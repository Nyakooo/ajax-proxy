/** Stable, non-sensitive failure categories for V3 request and response functions. */
export const V3FunctionErrorCode = {
  SANDBOX_UNAVAILABLE: 'sandbox-unavailable',
  TIMEOUT: 'timeout',
  SNAPSHOT_UNSUPPORTED: 'snapshot-unsupported',
  SNAPSHOT_TOO_LARGE: 'snapshot-too-large',
  EXECUTION_FAILED: 'execution-failed',
  INVALID_RESULT: 'invalid-result',
  REDIRECT_TARGET_INVALID: 'redirect-target-invalid',
  RESPONSE_CONSTRUCTION_FAILED: 'response-construction-failed',
} as const

export type V3FunctionErrorCode = (typeof V3FunctionErrorCode)[keyof typeof V3FunctionErrorCode]

/** Safe diagnostic metadata; intentionally excludes raw URLs and request/response data. */
export type V3FunctionError = {
  rule_id: string
  match_url: string
  method: string
  action: 'redirect' | 'response'
  code: V3FunctionErrorCode
}

const ERROR_KEYS = ['rule_id', 'match_url', 'method', 'action', 'code'] as const
const ERROR_CODES = new Set<string>(Object.values(V3FunctionErrorCode))
const ERROR_ACTIONS = new Set<string>(['redirect', 'response'])

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  try {
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
  } catch {
    return false
  }
}

/** Validate an untrusted V3 function failure notice. */
export function isV3FunctionError(value: unknown): value is V3FunctionError {
  try {
    if (!isPlainRecord(value)) return false
    const keys = Object.keys(value)
    if (keys.length !== ERROR_KEYS.length || keys.some((key) => !ERROR_KEYS.includes(key as never)))
      return false

    return (
      typeof value.rule_id === 'string' &&
      value.rule_id.length >= 1 &&
      value.rule_id.length <= 256 &&
      typeof value.match_url === 'string' &&
      value.match_url.length >= 1 &&
      value.match_url.length <= 4096 &&
      typeof value.method === 'string' &&
      /^[A-Z]{1,16}$/.test(value.method) &&
      typeof value.action === 'string' &&
      ERROR_ACTIONS.has(value.action) &&
      typeof value.code === 'string' &&
      ERROR_CODES.has(value.code)
    )
  } catch {
    return false
  }
}
