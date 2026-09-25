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
})
