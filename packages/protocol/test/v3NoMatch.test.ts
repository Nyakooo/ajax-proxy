import { describe, expect, it } from 'vitest'
import { isV3NoMatch, V3NoMatchReason } from '../src/v3NoMatch'

const validNoMatch = {
  kind: 'v3-no-match',
  method: 'POST',
  rules: [{ rule_id: 'rule-1', reason: V3NoMatchReason.URL_MISMATCH }],
  truncated: false,
}

describe('V3 no-match guard', () => {
  it('accepts the exact safe payload and every actual no-match reason', () => {
    expect(isV3NoMatch(validNoMatch)).toBe(true)
    for (const reason of Object.values(V3NoMatchReason)) {
      expect(isV3NoMatch({ ...validNoMatch, rules: [{ rule_id: 'rule-1', reason }] })).toBe(true)
    }
  })

  it('accepts empty and capped rule lists and validates truncation', () => {
    expect(isV3NoMatch({ ...validNoMatch, rules: [] })).toBe(true)
    expect(
      isV3NoMatch({
        ...validNoMatch,
        rules: Array.from({ length: 100 }, (_, index) => ({
          rule_id: `rule-${index}`,
          reason: V3NoMatchReason.RULE_DISABLED,
        })),
        truncated: true,
      })
    ).toBe(true)
    expect(isV3NoMatch({ ...validNoMatch, truncated: 0 })).toBe(false)
  })

  it('rejects URL, query, request data, unknown fields, and malformed shape', () => {
    for (const key of ['url', 'match_url', 'query', 'body', 'headers', 'extra']) {
      expect(isV3NoMatch({ ...validNoMatch, [key]: 'sensitive' })).toBe(false)
    }
    expect(
      isV3NoMatch({ ...validNoMatch, rules: [{ ...validNoMatch.rules[0], url: '/secret' }] })
    ).toBe(false)
    expect(isV3NoMatch({ ...validNoMatch, rules: null })).toBe(false)
    expect(isV3NoMatch({ ...validNoMatch, kind: 'other' })).toBe(false)
    expect(isV3NoMatch({ ...validNoMatch, missing: undefined })).toBe(false)
  })

  it('enforces method, rule id, reason, and list bounds', () => {
    for (const method of ['', 'post', 'GET/POST', 'M'.repeat(17)]) {
      expect(isV3NoMatch({ ...validNoMatch, method })).toBe(false)
    }
    for (const rule_id of ['', 'r'.repeat(257)]) {
      expect(isV3NoMatch({ ...validNoMatch, rules: [{ rule_id, reason: 'url-mismatch' }] })).toBe(
        false
      )
    }
    expect(isV3NoMatch({ ...validNoMatch, rules: [{ rule_id: 'r', reason: 'matched' }] })).toBe(
      false
    )
    expect(isV3NoMatch({ ...validNoMatch, rules: Array(101).fill(validNoMatch.rules[0]) })).toBe(
      false
    )
  })

  it('rejects non-plain objects, accessor fields, and hostile proxies', () => {
    class NoMatch {
      kind = validNoMatch.kind
      method = validNoMatch.method
      rules = validNoMatch.rules
      truncated = validNoMatch.truncated
    }
    expect(isV3NoMatch(null)).toBe(false)
    expect(isV3NoMatch([])).toBe(false)
    expect(isV3NoMatch(new NoMatch())).toBe(false)

    const accessor = { ...validNoMatch }
    Object.defineProperty(accessor, 'method', { enumerable: true, get: () => 'GET' })
    expect(isV3NoMatch(accessor)).toBe(false)
    expect(
      isV3NoMatch(
        new Proxy(
          {},
          {
            getPrototypeOf: () => {
              throw new Error('blocked')
            },
          }
        )
      )
    ).toBe(false)
  })
})
