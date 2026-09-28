import { describe, expect, it, vi } from 'vitest'
import {
  isValidInterceptors,
  isValidRedirectors,
  isValidRegexPattern,
  isV3Hit,
  isV3HitNotice,
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

describe('V3 hit event validation', () => {
  const valid = { kind: 'v3-hit', rule_id: 'rule-1', match_url: '/api', method: 'GET' }

  it('accepts a valid hit event with an optional request URL', () => {
    expect(isV3Hit(valid)).toBe(true)
    expect(isV3Hit({ ...valid, url: 'https://site.test/api' })).toBe(true)
    expect(
      isV3Hit({
        ...valid,
        url: 'https://site.test/api',
        response_mode: 'mock',
        status: 201,
        network_skipped: true,
      })
    ).toBe(true)
    expect(isV3Hit({ ...valid, response_mode: 'mock' })).toBe(false)
    expect(isV3Hit({ ...valid, response_mode: 'mock', status: 201, network_skipped: false })).toBe(
      false
    )
    expect(isV3Hit({ ...valid, response_mode: 'mock', status: 101, network_skipped: true })).toBe(
      false
    )
  })

  it('rejects malformed events, oversized fields, extra keys, and custom prototypes', () => {
    expect(isV3Hit(null)).toBe(false)
    expect(isV3Hit({ ...valid, rule_id: '' })).toBe(false)
    expect(isV3Hit({ ...valid, rule_id: 'x'.repeat(257) })).toBe(false)
    expect(isV3Hit({ ...valid, match_url: '' })).toBe(false)
    expect(isV3Hit({ ...valid, match_url: 'x'.repeat(4097) })).toBe(false)
    expect(isV3Hit({ ...valid, method: 'get' })).toBe(false)
    expect(isV3Hit({ ...valid, method: 'A'.repeat(17) })).toBe(false)
    expect(isV3Hit({ ...valid, url: 'x'.repeat(8193) })).toBe(false)
    expect(isV3Hit({ ...valid, extra: true })).toBe(false)
    expect(isV3Hit({ ...valid, [Symbol('extra')]: true })).toBe(false)
    const hiddenExtra = { ...valid }
    Object.defineProperty(hiddenExtra, 'extra', { value: true })
    expect(isV3Hit(hiddenExtra)).toBe(false)
    expect(isV3Hit(Object.assign(Object.create({ inherited: true }), valid))).toBe(false)
    expect(
      isV3Hit(
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

  it('rejects accessor fields without invoking them', () => {
    const getter = vi.fn(() => 'GET')
    const accessor = { ...valid }
    Object.defineProperty(accessor, 'method', { enumerable: true, get: getter })

    expect(isV3Hit(accessor)).toBe(false)
    expect(getter).not.toHaveBeenCalled()
  })

  it('validates copied property descriptors without invoking proxy get traps', () => {
    const get = vi.fn(() => 'POST')

    expect(isV3Hit(new Proxy(valid, { get }))).toBe(true)
    expect(get).not.toHaveBeenCalled()
  })
})

describe('V3 hit notice validation', () => {
  const valid = {
    rule_id: 'rule-1',
    count: 1,
    match_url: '/api',
    method: 'GET',
    url: 'https://site.test/api',
  }

  it('accepts a well-formed service-worker hit notice', () => {
    expect(isV3HitNotice(valid)).toBe(true)
    expect(
      isV3HitNotice({
        ...valid,
        response_mode: 'mock',
        status: 201,
        network_skipped: true,
      })
    ).toBe(true)
    expect(isV3HitNotice({ ...valid, response_mode: 'mock' })).toBe(false)
  })

  it('rejects missing, malformed, extra, or unsafe notice values', () => {
    expect(isV3HitNotice(null)).toBe(false)
    expect(isV3HitNotice({ ...valid, rule_id: '' })).toBe(false)
    expect(isV3HitNotice({ ...valid, count: 0 })).toBe(false)
    expect(isV3HitNotice({ ...valid, count: -1 })).toBe(false)
    expect(isV3HitNotice({ ...valid, count: 1.5 })).toBe(false)
    expect(isV3HitNotice({ ...valid, count: Number.MAX_SAFE_INTEGER + 1 })).toBe(false)
    expect(isV3HitNotice({ ...valid, match_url: '' })).toBe(false)
    expect(isV3HitNotice({ ...valid, method: '' })).toBe(false)
    expect(isV3HitNotice({ ...valid, method: 1 })).toBe(false)
    expect(isV3HitNotice({ ...valid, url: '' })).toBe(false)
    expect(isV3HitNotice({ ...valid, extra: true })).toBe(false)
    const missingUrl: Record<string, unknown> = { ...valid }
    delete missingUrl.url
    expect(isV3HitNotice(missingUrl)).toBe(false)
    expect(isV3HitNotice(Object.assign(Object.create({ inherited: true }), valid))).toBe(false)
    expect(
      isV3HitNotice(
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

  it('rejects accessor fields without invoking them', () => {
    const getter = vi.fn(() => 'https://site.test/api')
    const accessor = { ...valid }
    Object.defineProperty(accessor, 'url', { enumerable: true, get: getter })

    expect(isV3HitNotice(accessor)).toBe(false)
    expect(getter).not.toHaveBeenCalled()
  })
})

describe('rule input validation', () => {
  it('validates shared rule fields and their supported boundaries', () => {
    const interceptor = { switch_on: true, match_url: '/api' }
    const redirector = {
      switch_on: true,
      domain: 'example.com',
      redirect_url: 'https://localhost',
    }
    const cases = [
      {
        rule: interceptor,
        regexField: 'match_url',
        validate: (rule: Record<string, unknown>) => isValidInterceptors([rule]),
      },
      {
        rule: redirector,
        regexField: 'domain',
        validate: (rule: Record<string, unknown>) => isValidRedirectors([rule]),
      },
    ]

    for (const { rule, regexField, validate } of cases) {
      expect(validate(rule)).toBe(true)
      for (const method of ['ANY', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH']) {
        expect(validate({ ...rule, method })).toBe(true)
      }
      expect(validate({ ...rule, filter_type: 'normal', remark: 'x'.repeat(512) })).toBe(true)
      expect(validate({ ...rule, filter_type: 'regex', [regexField]: '^/api$' })).toBe(true)
    }
  })

  it.each([
    ['switch_on', undefined],
    ['switch_on', 1],
    ['filter_type', null],
    ['filter_type', 'other'],
    ['method', 'get'],
    ['method', 'OPTIONS'],
    ['remark', 1],
    ['remark', 'x'.repeat(513)],
  ])('rejects invalid shared field %s=%s', (field, value) => {
    const interceptor = { switch_on: true, match_url: '/api', [field]: value }
    const redirector = {
      switch_on: true,
      domain: 'example.com',
      redirect_url: 'https://localhost',
      [field]: value,
    }
    expect(isValidInterceptors([interceptor])).toBe(false)
    expect(isValidRedirectors([redirector])).toBe(false)
  })

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

  it('accepts status codes at the supported endpoints and rejects values outside them', () => {
    const rule = { switch_on: true, match_url: '/api' }
    expect(isValidInterceptors([{ ...rule, status_code: 200 }])).toBe(true)
    expect(isValidInterceptors([{ ...rule, status_code: '599' }])).toBe(true)
    expect(isValidInterceptors([{ ...rule, status_code: 199 }])).toBe(false)
    expect(isValidInterceptors([{ ...rule, status_code: '600' }])).toBe(false)
    expect(isValidInterceptors([{ ...rule, status_code: 200.5 }])).toBe(false)
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

  it('enforces the redirect header count and aggregate UTF-8 byte limits', () => {
    const rule = {
      switch_on: true,
      domain: 'example.com',
      redirect_url: 'https://localhost',
    }
    expect(
      isValidRedirectors([
        { ...rule, headers: Array.from({ length: 100 }, () => ({ key: 'x', value: '' })) },
      ])
    ).toBe(true)
    expect(
      isValidRedirectors([
        { ...rule, headers: Array.from({ length: 101 }, () => ({ key: 'x', value: '' })) },
      ])
    ).toBe(false)

    const exactByteLimit = [
      ...Array.from({ length: 3 }, () => ({ key: 'x', value: 'é'.repeat(4096) })),
      { key: 'x', value: 'é'.repeat(4094) },
    ]
    expect(isValidRedirectors([{ ...rule, headers: exactByteLimit }])).toBe(true)
    expect(
      isValidRedirectors([
        {
          ...rule,
          headers: [...exactByteLimit.slice(0, 3), { key: 'x', value: 'é'.repeat(4094) + 'a' }],
        },
      ])
    ).toBe(false)
  })
})
