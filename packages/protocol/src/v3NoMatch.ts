/** Actual V3 selector outcomes that explain why an individual rule did not match. */
export const V3NoMatchReason = {
  GLOBAL_DISABLED: 'global-disabled',
  RULE_DISABLED: 'rule-disabled',
  ACTIONS_DISABLED: 'actions-disabled',
  METHOD_MISMATCH: 'method-mismatch',
  URL_MISMATCH: 'url-mismatch',
  INVALID_REGEX: 'invalid-regex',
  INVALID_MATCH_TYPE: 'invalid-match-type',
  MATCHER_ERROR: 'matcher-error',
  REQUEST_TOO_LONG: 'request-too-long',
} as const

export type V3NoMatchReason = (typeof V3NoMatchReason)[keyof typeof V3NoMatchReason]

/** Opt-in, transient no-match diagnostic. It deliberately carries no request URL or data. */
export type V3NoMatch = {
  kind: 'v3-no-match'
  method: string
  rules: Array<{ rule_id: string; reason: V3NoMatchReason }>
  truncated: boolean
}

const ROOT_KEYS = ['kind', 'method', 'rules', 'truncated'] as const
const RULE_KEYS = ['rule_id', 'reason'] as const
const REASONS = new Set<string>(Object.values(V3NoMatchReason))
const MAX_RULES = 100
const MAX_RULE_ID_LENGTH = 256

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  try {
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
  } catch {
    return false
  }
}

function hasExactDataKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  try {
    const keys = Reflect.ownKeys(value)
    if (
      keys.length !== allowed.length ||
      keys.some((key) => typeof key !== 'string' || !allowed.includes(key))
    )
      return false
    return keys.every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      return descriptor !== undefined && 'value' in descriptor
    })
  } catch {
    return false
  }
}

/** Validate an untrusted, user-opted-in no-match diagnostic payload. */
export function isV3NoMatch(value: unknown): value is V3NoMatch {
  try {
    if (!isPlainRecord(value) || !hasExactDataKeys(value, ROOT_KEYS)) return false
    if (
      value.kind !== 'v3-no-match' ||
      typeof value.method !== 'string' ||
      !/^[A-Z]{1,16}$/.test(value.method) ||
      typeof value.truncated !== 'boolean' ||
      !Array.isArray(value.rules) ||
      value.rules.length > MAX_RULES
    )
      return false

    return value.rules.every(
      (rule) =>
        isPlainRecord(rule) &&
        hasExactDataKeys(rule, RULE_KEYS) &&
        typeof rule.rule_id === 'string' &&
        rule.rule_id.length >= 1 &&
        rule.rule_id.length <= MAX_RULE_ID_LENGTH &&
        typeof rule.reason === 'string' &&
        REASONS.has(rule.reason)
    )
  } catch {
    return false
  }
}
