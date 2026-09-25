import { describe, expect, it } from 'vitest'
import {
  isValidInterceptors,
  isValidRedirectors,
  isValidRegexPattern,
  NoticeKey,
  StorageKey,
} from '../src'

describe('V3 protocol keys', () => {
  it('adds separate V3 keys and preserves the V2 keys', () => {
    expect(StorageKey.V3_CONFIG).toBe('ajax-proxy:storage:v3-config')
    expect(NoticeKey.V3_CONFIG).toBe('ajax-proxy:notice:v3-config')
    expect(StorageKey.V3_HITS).toBe('ajax-proxy:storage:v3-hits')
    expect(NoticeKey.V3_HIT).toBe('ajax-proxy:notice:v3-hit')
    expect(StorageKey.REDIRECT_LIST).toBe('ajax-proxy:storage:redirect-list')
    expect(NoticeKey.REDIRECT_LIST).toBe('ajax-proxy:notice:redirect-list')
  })
})

describe('rule input validation', () => {
  it('accepts supported RE2 patterns and rejects unsupported or oversized patterns', () => {
    expect(isValidRegexPattern('^https://example\\.com/api/.*$')).toBe(true)
    expect(isValidRegexPattern('([a-z]+)+$')).toBe(true)
    expect(isValidRegexPattern('(?=admin)')).toBe(false)
    expect(isValidRegexPattern('(a)\\1')).toBe(false)
    expect(isValidRegexPattern('a'.repeat(4097))).toBe(false)
  })

  it('rejects excessive matcher rules and malformed matcher fields', () => {
    const rule = { switch_on: true, match_url: '/api', filter_type: 'normal' }
    expect(isValidInterceptors([rule])).toBe(true)
    expect(isValidInterceptors([{ ...rule, match_url: 'x'.repeat(4097) }])).toBe(false)
    expect(isValidInterceptors(Array.from({ length: 1001 }, () => rule))).toBe(false)
    expect(
      isValidInterceptors(Array.from({ length: 101 }, () => ({ ...rule, filter_type: 'regex' })))
    ).toBe(false)
  })

  it('rejects invalid redirect headers and overlong ignore patterns', () => {
    const rule = {
      switch_on: true,
      domain: 'example.com',
      redirect_url: 'https://localhost',
    }
    expect(isValidRedirectors([rule])).toBe(true)
    expect(isValidRedirectors([{ ...rule, headers: [{ key: 'bad header', value: 'x' }] }])).toBe(
      false
    )
    expect(
      isValidRedirectors([{ ...rule, headers: [{ key: 'x-ok', value: 'safe\r\nInjected: yes' }] }])
    ).toBe(false)
    expect(isValidRedirectors([{ ...rule, ignores: ['x'.repeat(4097)] }])).toBe(false)
  })
})
