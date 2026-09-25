import { describe, expect, it } from 'vitest'
import { finalRedirectUrl, matchIgnoresAndRule, maybeMatching } from '../src/common'

describe('maybeMatching', () => {
  it('matches a normal rule as a case-sensitive substring', () => {
    expect(maybeMatching('https://example.com/api/users', '/api/')).toBe(true)
    expect(maybeMatching('https://example.com/API/users', '/api/')).toBe(false)
  })

  it('matches regular expressions case-insensitively', () => {
    expect(
      maybeMatching('https://example.com/API/users', '^https://example\\.com/api', 'regex')
    ).toBe(true)
  })

  it('returns false for an invalid regular expression', () => {
    expect(maybeMatching('https://example.com/api', '[', 'regex')).toBe(false)
  })

  it('uses bounded linear-time matching for nested quantifiers', () => {
    expect(maybeMatching(`${'a'.repeat(20000)}!`, '([a-z]+)+$', 'regex')).toBe(false)
  })

  it('skips overlong patterns and request URLs', () => {
    expect(maybeMatching('https://example.com/api', 'a'.repeat(4097), 'regex')).toBe(false)
    expect(maybeMatching('x'.repeat(65537), 'x', 'normal')).toBe(false)
  })
})

describe('matchIgnoresAndRule', () => {
  it('lets an ignore entry take precedence over a matching rule', () => {
    expect(
      matchIgnoresAndRule('https://example.com/api/internal/users', '/api/', 'normal', [
        '/internal/',
      ])
    ).toBe(false)
  })

  it('matches when no ignore entry applies', () => {
    expect(matchIgnoresAndRule('https://example.com/api/users', '/api/', 'normal', [])).toBe(true)
  })
})

describe('finalRedirectUrl', () => {
  it('replaces the configured substring', () => {
    expect(finalRedirectUrl('https://example.com/api/users', 'example.com', 'localhost:3000')).toBe(
      'https://localhost:3000/api/users'
    )
  })

  it('uses a case-insensitive regular expression rule', () => {
    expect(
      finalRedirectUrl(
        'https://example.com/API/users',
        '^https://example\\.com/api',
        'http://localhost:3000/mock',
        'regex'
      )
    ).toBe('http://localhost:3000/mock/users')
  })

  it('replaces only when an RE2 expression matches', () => {
    expect(finalRedirectUrl('https://example.com/api', '(?=api)', '/mock', 'regex')).toBe(
      'https://example.com/api'
    )
  })
})
