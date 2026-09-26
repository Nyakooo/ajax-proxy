import { describe, expect, it } from 'vitest'
import { isV3FetchOutcome, V3FetchOutcomeReason } from '../src/v3FetchOutcome'

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
