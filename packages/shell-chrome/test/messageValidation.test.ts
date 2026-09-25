import { describe, expect, it } from 'vitest'
import { isPageBadgeHit, isPageV3Hit } from '../src/messageValidation'

describe('page-world message validation', () => {
  it('accepts a bounded hit event with optional request metadata', () => {
    expect(isPageBadgeHit({ match_url: '/api', method: 'GET' })).toBe(true)
    expect(
      isPageBadgeHit({
        match_url: '/api',
        method: 'OPTIONS',
        url: 'https://site.test/api',
        rule_index: 0,
      })
    ).toBe(true)
  })

  it('rejects malformed, oversized, and unexpected data', () => {
    expect(isPageBadgeHit(null)).toBe(false)
    expect(isPageBadgeHit({ match_url: '', method: 'GET' })).toBe(false)
    expect(isPageBadgeHit({ match_url: '/api', method: 'get' })).toBe(false)
    expect(isPageBadgeHit({ match_url: '/api', method: 'GET', rule_index: -1 })).toBe(false)
    expect(isPageBadgeHit({ match_url: '/api', method: 'GET', detail: 'unexpected' })).toBe(false)
    expect(
      isPageBadgeHit(
        Object.assign(Object.create({ inherited: true }), { match_url: '/api', method: 'GET' })
      )
    ).toBe(false)
    expect(
      isPageBadgeHit(
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

describe('V3 page-world hit validation', () => {
  const valid = { kind: 'v3-hit', rule_id: 'rule-1', match_url: '/api', method: 'GET' }

  it('accepts the bounded V3 hit payload and optional URL', () => {
    expect(isPageV3Hit(valid)).toBe(true)
    expect(isPageV3Hit({ ...valid, url: 'https://site.test/api' })).toBe(true)
  })

  it('rejects malformed, oversized, and extra-field payloads', () => {
    expect(isPageV3Hit(null)).toBe(false)
    expect(isPageV3Hit({ ...valid, rule_id: '' })).toBe(false)
    expect(isPageV3Hit({ ...valid, rule_id: 'x'.repeat(257) })).toBe(false)
    expect(isPageV3Hit({ ...valid, match_url: '' })).toBe(false)
    expect(isPageV3Hit({ ...valid, match_url: 'x'.repeat(4097) })).toBe(false)
    expect(isPageV3Hit({ ...valid, method: 'get' })).toBe(false)
    expect(isPageV3Hit({ ...valid, method: 'A'.repeat(17) })).toBe(false)
    expect(isPageV3Hit({ ...valid, url: 'x'.repeat(8193) })).toBe(false)
    expect(isPageV3Hit({ ...valid, extra: true })).toBe(false)
    expect(isPageV3Hit(Object.assign(Object.create({ inherited: true }), valid))).toBe(false)
  })
})
