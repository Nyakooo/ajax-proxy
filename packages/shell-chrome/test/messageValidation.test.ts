import { describe, expect, it } from 'vitest'
import { isPageBadgeHit } from '../src/messageValidation'

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
