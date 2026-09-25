import { validateV3ResponseFunctionResult } from '@proxy/v3-domain'
import type { V3FunctionErrorCode } from '@proxy/protocol'
import type { V3Rule } from '@proxy/v3-domain'
import type {
  V3FunctionRequestSnapshot,
  V3FunctionResponseSnapshot,
  V3ResponseFunctionExecutor,
} from './responseFunctionSandbox'

const MAX_SNAPSHOT_BYTES = 1024 * 1024
const MAX_SNAPSHOT_PART_BYTES = 512 * 1024

function supportsTextSnapshot(headers: Headers): boolean {
  const contentType = headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  return Boolean(
    contentType &&
    (contentType.startsWith('text/') ||
      contentType === 'application/json' ||
      contentType.endsWith('+json') ||
      contentType.includes('xml') ||
      contentType === 'application/x-www-form-urlencoded')
  )
}

async function readBoundedUtf8(body: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!body) return ''
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > MAX_SNAPSHOT_PART_BYTES) throw new Error('Snapshot body is too large.')
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

function snapshotHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = Object.create(null)
  let total = 0
  headers.forEach((value, name) => {
    total += new TextEncoder().encode(name).length + new TextEncoder().encode(value).length
    if (total > 32 * 1024 || Object.keys(result).length >= 100) {
      throw new Error('Snapshot headers are too large.')
    }
    result[name] = value
  })
  return result
}

async function createFunctionSnapshots(
  request: Request,
  requestSnapshot: Request,
  response: Response
): Promise<{ request: V3FunctionRequestSnapshot; response: V3FunctionResponseSnapshot }> {
  const requestHeaders = new Headers(request.headers)
  const responseHeaders = new Headers(response.headers)
  if (
    (request.body && !supportsTextSnapshot(requestHeaders)) ||
    (response.body && !supportsTextSnapshot(responseHeaders))
  ) {
    throw new Error('Function snapshots support text and JSON responses only.')
  }
  const requestBody = request.body ? await readBoundedUtf8(requestSnapshot.body) : undefined
  const responseBody = response.body ? await readBoundedUtf8(response.clone().body) : ''
  const snapshotBytes =
    new TextEncoder().encode(requestBody ?? '').length +
    new TextEncoder().encode(responseBody).length
  if (snapshotBytes > MAX_SNAPSHOT_BYTES) throw new Error('Function snapshots are too large.')
  return {
    request: {
      url: request.url,
      method: request.method,
      ...(requestBody === undefined ? {} : { body: requestBody }),
    },
    response: {
      status: response.status,
      statusText: response.statusText,
      headers: snapshotHeaders(responseHeaders),
      body: responseBody,
    },
  }
}

function responseMetadataProxy(response: Response, original: Response): Response {
  return new Proxy(response, {
    get(target, property) {
      if (property === 'url' || property === 'redirected' || property === 'type') {
        return Reflect.get(original, property, original)
      }
      const value = Reflect.get(target, property, target)
      return typeof value === 'function' && property !== 'constructor' ? value.bind(target) : value
    },
  })
}

function snapshotFailureCode(error: unknown): V3FunctionErrorCode {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (message.includes('too large')) return 'snapshot-too-large'
  return 'snapshot-unsupported'
}

function executionFailureCode(error: unknown): V3FunctionErrorCode {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (message.includes('timed out')) return 'timeout'
  if (message.includes('sandbox') && message.includes('unavailable')) return 'sandbox-unavailable'
  return 'execution-failed'
}

function reportFunctionError(
  report: ((code: V3FunctionErrorCode) => void) | undefined,
  code: V3FunctionErrorCode
) {
  try {
    report?.(code)
  } catch {
    // Diagnostic reporting must never change the native-response fallback.
  }
}

function applyResponseChanges(
  response: Response,
  request: Request,
  changes: { status?: number; headers?: Record<string, string>; body?: unknown }
) {
  const status = changes.status ?? response.status
  const hasNoBody = request.method === 'HEAD' || [204, 205, 304].includes(status)
  const headers = new Headers(response.headers)
  if (changes.headers) {
    for (const [name, value] of Object.entries(changes.headers)) headers.set(name, value)
  }
  headers.delete('content-length')
  headers.delete('content-encoding')
  headers.delete('content-range')
  headers.delete('transfer-encoding')

  let body: BodyInit | null
  if (hasNoBody) body = null
  else if (changes.body !== undefined) body = JSON.stringify(changes.body)
  else body = response.body ? response.clone().body : null

  const updated = new Response(body, { status, statusText: response.statusText, headers })
  return responseMetadataProxy(updated, response)
}

export async function replaceFetchResponse(
  response: Response,
  request: Request,
  rule: V3Rule,
  executeResponseFunction?: V3ResponseFunctionExecutor,
  requestSnapshot = request,
  onFunctionError?: (code: V3FunctionErrorCode) => void
) {
  const replace = rule.response?.replace
  if (!rule.response?.enabled || !replace) return response
  if (typeof replace.code === 'string' && replace.code.trim() !== '') {
    if (!executeResponseFunction) {
      reportFunctionError(onFunctionError, 'sandbox-unavailable')
      return response
    }
    let snapshots: Awaited<ReturnType<typeof createFunctionSnapshots>>
    try {
      snapshots = await createFunctionSnapshots(request, requestSnapshot, response)
    } catch (error) {
      reportFunctionError(onFunctionError, snapshotFailureCode(error))
      return response
    }
    let rawResult: unknown
    try {
      rawResult = await executeResponseFunction(replace.code, snapshots.request, snapshots.response)
    } catch (error) {
      reportFunctionError(onFunctionError, executionFailureCode(error))
      return response
    }
    const validation = validateV3ResponseFunctionResult(rawResult)
    if (!validation.ok) {
      reportFunctionError(onFunctionError, 'invalid-result')
      return response
    }
    try {
      return applyResponseChanges(response, request, validation.data)
    } catch {
      reportFunctionError(onFunctionError, 'response-construction-failed')
      // Function failures fail open and preserve the native response.
      return response
    }
  }

  try {
    return applyResponseChanges(response, request, replace)
  } catch {
    return response
  }
}
