import { isV3RedirectExcluded, selectV3Rule } from '@proxy/v3-domain'
import type { V3Rule } from '@proxy/v3-domain'
import type {
  V3FetchOutcomeReason,
  V3FetchOutcomeStage,
  V3FetchOutcomeStatus,
} from '@proxy/protocol'
import type { V3RuntimeHostOptions } from './runtimeOptions'
import { replaceFetchResponse } from './responseAction'

export type V3Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
export type V3FetchOptions = V3RuntimeHostOptions
const correlationNonce = Math.random().toString(36).slice(2, 10)
let correlationSequence = 0

function createCorrelationId(): string {
  return `v3-fetch-${Date.now().toString(36)}-${correlationNonce}-${++correlationSequence}`
}

function reportOutcome(
  options: V3FetchOptions,
  rule: V3Rule,
  correlationId: string | undefined,
  stage: V3FetchOutcomeStage,
  outcome: V3FetchOutcomeStatus,
  reason: V3FetchOutcomeReason
) {
  if (!correlationId) return
  try {
    options.onFetchOutcome?.(rule, correlationId, stage, outcome, reason)
  } catch {
    // Outcome diagnostics must never change the native Fetch result.
  }
}

function isRequestInput(input: RequestInfo | URL): input is Request {
  return (
    typeof input === 'object' &&
    input !== null &&
    'body' in input &&
    typeof (input as Request).clone === 'function'
  )
}

function isReadableStreamBody(body: BodyInit | null | undefined): boolean {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { getReader?: unknown }).getReader === 'function'
  )
}

function needsRequestSnapshot(rule: V3Rule): boolean {
  const replace = rule.response?.replace
  return Boolean(
    rule.response?.enabled && typeof replace?.code === 'string' && replace.code.trim() !== ''
  )
}

async function redirectRequest(
  request: Request,
  targetUrl: string,
  preserveStreamingBody: boolean
): Promise<Request> {
  const destination = new URL(targetUrl, request.url)
  if (destination.protocol !== 'http:' && destination.protocol !== 'https:') {
    throw new TypeError('V3 redirect targets must use HTTP or HTTPS.')
  }
  const body = request.body
    ? preserveStreamingBody
      ? request.clone().body
      : await request.clone().arrayBuffer()
    : undefined
  const headers = new Headers(request.headers)
  if (destination.origin !== new URL(request.url).origin) {
    for (const name of ['authorization', 'proxy-authorization', 'cookie', 'cookie2']) {
      headers.delete(name)
    }
  }
  const redirectInit: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers,
    body,
    duplex: preserveStreamingBody && body ? 'half' : undefined,
    credentials: request.credentials,
    mode: request.mode,
    cache: request.cache,
    redirect: request.redirect,
    referrer: request.referrer,
    referrerPolicy: request.referrerPolicy,
    integrity: request.integrity,
    keepalive: request.keepalive,
    signal: request.signal,
  }
  return new Request(destination, redirectInit)
}

/**
 * Build a Fetch wrapper that applies one V3 rule across the request and
 * response stages. The extension host owns configuration, diagnostics, and mounting.
 */
export function createV3Fetch(fetcher: V3Fetch, options: V3FetchOptions): V3Fetch {
  return async (input, init) => {
    const originalRequest = new Request(input, init)
    const selection = selectV3Rule(options.getRules(), {
      url: originalRequest.url,
      method: originalRequest.method,
    })
    if (!selection) {
      try {
        options.onNoMatch?.({ url: originalRequest.url, method: originalRequest.method })
      } catch {
        // Diagnostics must not affect the native request.
      }
      return fetcher(input, init)
    }

    try {
      options.onMatched?.(selection.rule, selection.index, selection.originalRequest)
    } catch {
      // Statistics and notifications must not change the network result.
    }

    let requestForResponse = originalRequest
    let requestSnapshot: Request | undefined
    let networkResponse!: Response
    const snapshotRequestBody = needsRequestSnapshot(selection.rule)
    const outcomeArmed =
      options.onFetchOutcome !== undefined && (options.isFetchOutcomeDiagnosticsArmed?.() ?? true)
    const correlationId = outcomeArmed ? createCorrelationId() : undefined
    const redirect = selection.rule.request
    if (redirect?.enabled && !isV3RedirectExcluded(selection.rule, originalRequest.url)) {
      try {
        requestForResponse = await redirectRequest(
          originalRequest,
          redirect.redirect.url,
          isReadableStreamBody(init?.body)
        )
      } catch {
        // A construction/body replay failure can safely fall back before network dispatch.
        requestForResponse = originalRequest
        if (snapshotRequestBody) requestSnapshot = originalRequest.clone()
        reportOutcome(
          options,
          selection.rule,
          correlationId,
          'request',
          'fallback',
          'redirect-construction-failed'
        )
        try {
          const useNormalizedRequest = isRequestInput(input) || isReadableStreamBody(init?.body)
          networkResponse = useNormalizedRequest
            ? await fetcher(originalRequest)
            : await fetcher(input, init)
        } catch (networkError) {
          reportOutcome(
            options,
            selection.rule,
            correlationId,
            'request',
            'failed',
            'network-failed'
          )
          throw networkError
        }
      }
      if (requestForResponse !== originalRequest) {
        if (snapshotRequestBody) requestSnapshot = requestForResponse.clone()
        try {
          networkResponse = await fetcher(requestForResponse)
        } catch (networkError) {
          // Once the redirected request is dispatched, preserve its native network error.
          reportOutcome(
            options,
            selection.rule,
            correlationId,
            'request',
            'failed',
            'network-failed'
          )
          throw networkError
        }
        reportOutcome(
          options,
          selection.rule,
          correlationId,
          'request',
          'applied',
          'redirect-applied'
        )
      }
    } else {
      if (snapshotRequestBody) requestSnapshot = originalRequest.clone()
      try {
        networkResponse = await fetcher(input, init)
      } catch (networkError) {
        reportOutcome(options, selection.rule, correlationId, 'request', 'failed', 'network-failed')
        throw networkError
      }
    }
    return replaceFetchResponse(
      networkResponse,
      requestForResponse,
      selection.rule,
      options.executeResponseFunction,
      requestSnapshot ?? requestForResponse,
      (code) => options.onFunctionError?.(selection.rule, selection.originalRequest, code),
      (outcome, reason) =>
        reportOutcome(options, selection.rule, correlationId, 'response', outcome, reason)
    )
  }
}
