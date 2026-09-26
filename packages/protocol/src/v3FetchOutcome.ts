/** Fixed, non-sensitive outcome categories for transient V3 Fetch diagnostics. */
export const V3FetchOutcomeReason = {
  REDIRECT_APPLIED: 'redirect-applied',
  REDIRECT_CONSTRUCTION_FAILED: 'redirect-construction-failed',
  NETWORK_FAILED: 'network-failed',
  RESPONSE_REPLACEMENT_APPLIED: 'response-replacement-applied',
  RESPONSE_REPLACEMENT_FAILED: 'response-replacement-failed',
  RESPONSE_REPLACEMENT_UNSUPPORTED: 'response-replacement-unsupported',
} as const

export type V3FetchOutcomeReason = (typeof V3FetchOutcomeReason)[keyof typeof V3FetchOutcomeReason]

export const V3FetchOutcomeStage = {
  REQUEST: 'request',
  RESPONSE: 'response',
} as const

export type V3FetchOutcomeStage = (typeof V3FetchOutcomeStage)[keyof typeof V3FetchOutcomeStage]

export const V3FetchOutcomeStatus = {
  APPLIED: 'applied',
  FALLBACK: 'fallback',
  FAILED: 'failed',
  UNSUPPORTED: 'unsupported',
} as const

export type V3FetchOutcomeStatus = (typeof V3FetchOutcomeStatus)[keyof typeof V3FetchOutcomeStatus]

/** Opt-in, transient Fetch outcome. It intentionally excludes request and response data. */
export type V3FetchOutcome = {
  kind: 'v3-fetch-outcome'
  correlation_id: string
  rule_id: string
  stage: V3FetchOutcomeStage
  outcome: V3FetchOutcomeStatus
  reason: V3FetchOutcomeReason
}

const ROOT_KEYS = ['kind', 'correlation_id', 'rule_id', 'stage', 'outcome', 'reason'] as const
const STAGES = new Set<string>(Object.values(V3FetchOutcomeStage))
const OUTCOMES = new Set<string>(Object.values(V3FetchOutcomeStatus))
const REASONS = new Set<string>(Object.values(V3FetchOutcomeReason))

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  try {
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
  } catch {
    return false
  }
}

function hasExactDataKeys(value: Record<string, unknown>): boolean {
  try {
    const keys = Reflect.ownKeys(value)
    if (
      keys.length !== ROOT_KEYS.length ||
      keys.some((key) => typeof key !== 'string' || !ROOT_KEYS.includes(key as never))
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

/** Validate an untrusted, user-opted-in Fetch outcome notice. */
export function isV3FetchOutcome(value: unknown): value is V3FetchOutcome {
  try {
    if (!isPlainRecord(value) || !hasExactDataKeys(value)) return false
    return (
      value.kind === 'v3-fetch-outcome' &&
      typeof value.correlation_id === 'string' &&
      /^[A-Za-z0-9._:-]{1,128}$/.test(value.correlation_id) &&
      typeof value.rule_id === 'string' &&
      value.rule_id.length >= 1 &&
      value.rule_id.length <= 256 &&
      typeof value.stage === 'string' &&
      STAGES.has(value.stage) &&
      typeof value.outcome === 'string' &&
      OUTCOMES.has(value.outcome) &&
      typeof value.reason === 'string' &&
      REASONS.has(value.reason)
    )
  } catch {
    return false
  }
}
