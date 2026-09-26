import { describe, expect, it } from 'vitest'
import { isV3FetchOutcome, V3FetchOutcomeReason } from '../src/v3FetchOutcome'
import { isV3XHROutcome, V3XHROutcomeReason } from '../src/v3XHROutcome'

const valid = {
  kind: 'v3-fetch-outcome',
  correlation_id: 'v3-fetch-1',
  rule_id: 'rule-1',
  stage: 'request',
  outcome: 'applied',
  reason: V3FetchOutcomeReason.REDIRECT_APPLIED,
}

describe('isV3FetchOutcome', () => {
  it('accepts the exact transient event shape', () => {
    expect(isV3FetchOutcome(valid)).toBe(true)
  })

  it('rejects extra request or response fields', () => {
    expect(isV3FetchOutcome({ ...valid, url: 'https://example.test/?secret=1' })).toBe(false)
    expect(isV3FetchOutcome({ ...valid, body: 'private' })).toBe(false)
    expect(isV3FetchOutcome({ ...valid, headers: {} })).toBe(false)
  })

  it('rejects unknown enum values and malformed identifiers', () => {
    expect(isV3FetchOutcome({ ...valid, reason: 'network error: secret' })).toBe(false)
    expect(isV3FetchOutcome({ ...valid, outcome: 'success' })).toBe(false)
    expect(isV3FetchOutcome({ ...valid, correlation_id: 'bad id' })).toBe(false)
  })
})

describe('isV3XHROutcome', () => {
  const valid = {
    kind: 'v3-xhr-outcome',
    correlation_id: 'v3-xhr-1',
    rule_id: 'rule-1',
    stage: 'response',
    outcome: 'unsupported',
    reason: V3XHROutcomeReason.RESPONSE_REPLACEMENT_UNSUPPORTED,
  }

  it('accepts the exact transient XHR event shape and keeps transport distinct', () => {
    expect(isV3XHROutcome(valid)).toBe(true)
    expect(isV3XHROutcome({ ...valid, kind: 'v3-fetch-outcome' })).toBe(false)
    expect(isV3XHROutcome({ ...valid, stage: 'request' })).toBe(false)
    expect(isV3XHROutcome({ ...valid, outcome: 'failed' })).toBe(false)
  })

  it('rejects request and response data, unknown categories, and accessor properties', () => {
    expect(isV3XHROutcome({ ...valid, url: 'https://example.test/?secret=1' })).toBe(false)
    expect(isV3XHROutcome({ ...valid, body: 'private' })).toBe(false)
    expect(isV3XHROutcome({ ...valid, headers: {} })).toBe(false)
    expect(isV3XHROutcome({ ...valid, reason: 'failed: secret' })).toBe(false)
    expect(isV3XHROutcome({ ...valid, reason: V3FetchOutcomeReason.NETWORK_FAILED })).toBe(false)
    const accessor = { ...valid }
    Object.defineProperty(accessor, 'reason', { get: () => valid.reason })
    expect(isV3XHROutcome(accessor)).toBe(false)
  })
})
