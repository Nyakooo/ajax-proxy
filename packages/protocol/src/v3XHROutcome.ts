import { V3FetchOutcomeStage, V3FetchOutcomeStatus } from './v3FetchOutcome'

/** Fixed, non-sensitive outcome categories for transient asynchronous XHR diagnostics. */
export const V3XHROutcomeReason = {
  REDIRECT_APPLIED: 'redirect-applied',
  REDIRECT_OPEN_FAILED: 'redirect-open-failed',
  REDIRECT_TARGET_UNSUPPORTED: 'redirect-target-unsupported',
  SEND_FAILED: 'send-failed',
  RESPONSE_REPLACEMENT_APPLIED: 'response-replacement-applied',
  RESPONSE_REPLACEMENT_FAILED: 'response-replacement-failed',
  RESPONSE_REPLACEMENT_UNSUPPORTED: 'response-replacement-unsupported',
} as const

export type V3XHROutcomeReason = (typeof V3XHROutcomeReason)[keyof typeof V3XHROutcomeReason]

/** Opt-in, transient async XHR outcome; request and response contents are excluded. */
export type V3XHROutcome = {
  kind: 'v3-xhr-outcome'
  correlation_id: string
  rule_id: string
  stage: (typeof V3FetchOutcomeStage)[keyof typeof V3FetchOutcomeStage]
  outcome: (typeof V3FetchOutcomeStatus)[keyof typeof V3FetchOutcomeStatus]
  reason: V3XHROutcomeReason
}

const ROOT_KEYS = ['kind', 'correlation_id', 'rule_id', 'stage', 'outcome', 'reason'] as const
const STAGES = new Set<string>(Object.values(V3FetchOutcomeStage))
const OUTCOMES = new Set<string>(Object.values(V3FetchOutcomeStatus))
const REASONS = new Set<string>(Object.values(V3XHROutcomeReason))

/** Validate an untrusted, user-opted-in async XHR outcome notice. */
export function isV3XHROutcome(value: unknown): value is V3XHROutcome {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return false
    const record = value as Record<string, unknown>
    const keys = Reflect.ownKeys(record)
    if (
      keys.length !== ROOT_KEYS.length ||
      keys.some((key) => typeof key !== 'string' || !ROOT_KEYS.includes(key as never)) ||
      !keys.every((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(record, key)
        return descriptor !== undefined && 'value' in descriptor
      })
    )
      return false
    const validShape =
      record.kind === 'v3-xhr-outcome' &&
      typeof record.correlation_id === 'string' &&
      /^[A-Za-z0-9._:-]{1,128}$/.test(record.correlation_id) &&
      typeof record.rule_id === 'string' &&
      record.rule_id.length >= 1 &&
      record.rule_id.length <= 256 &&
      typeof record.stage === 'string' &&
      STAGES.has(record.stage) &&
      typeof record.outcome === 'string' &&
      OUTCOMES.has(record.outcome) &&
      typeof record.reason === 'string' &&
      REASONS.has(record.reason)
    if (!validShape) return false
    if (record.stage === 'request') {
      return (
        (record.reason === V3XHROutcomeReason.REDIRECT_APPLIED &&
          record.outcome === V3FetchOutcomeStatus.APPLIED) ||
        ((record.reason === V3XHROutcomeReason.REDIRECT_OPEN_FAILED ||
          record.reason === V3XHROutcomeReason.REDIRECT_TARGET_UNSUPPORTED) &&
          record.outcome === V3FetchOutcomeStatus.FALLBACK) ||
        (record.reason === V3XHROutcomeReason.SEND_FAILED &&
          record.outcome === V3FetchOutcomeStatus.FAILED)
      )
    }
    return (
      (record.reason === V3XHROutcomeReason.RESPONSE_REPLACEMENT_APPLIED &&
        record.outcome === V3FetchOutcomeStatus.APPLIED) ||
      (record.reason === V3XHROutcomeReason.RESPONSE_REPLACEMENT_FAILED &&
        record.outcome === V3FetchOutcomeStatus.FAILED) ||
      (record.reason === V3XHROutcomeReason.RESPONSE_REPLACEMENT_UNSUPPORTED &&
        record.outcome === V3FetchOutcomeStatus.UNSUPPORTED)
    )
  } catch {
    return false
  }
}
