import { describe, expect, it } from 'vitest'
import { getV3HitTotal, recordV3Hit, sanitizeV3HitCounters } from '../src'
import type { V3Backup } from '../src'

const backup = {
  format: 'ajax-proxy-backup',
  formatVersion: 3,
  settings: { globalEnabled: true, mode: 'interceptor', language: 'en' },
  tags: [],
  rules: [
    {
      id: 'response-rule',
      enabled: true,
      match: { url: '/api', method: 'POST' },
      response: { enabled: true, replace: {} },
    },
    {
      id: 'request-rule',
      enabled: true,
      match: { url: '/redirect', method: 'ANY' },
      request: { enabled: true, redirect: { url: '/target' } },
    },
    {
      id: 'disabled-action',
      enabled: true,
      match: { url: '/disabled', method: 'GET' },
      response: { enabled: false, replace: {} },
    },
    {
      id: 'disabled-rule',
      enabled: false,
      match: { url: '/disabled-rule', method: 'GET' },
      response: { enabled: true, replace: {} },
    },
  ],
} as const satisfies V3Backup

const hit = (rule_id: string, match_url: string, method: string) => ({
  kind: 'v3-hit' as const,
  rule_id,
  match_url,
  method,
})

describe('V3 hit counters', () => {
  it('accepts only enabled rules with an enabled action and exact request identity', () => {
    expect(recordV3Hit(backup, {}, hit('response-rule', '/api', 'POST'))).toMatchObject({
      counters: { 'response-rule': 1 },
      count: 1,
    })
    expect(recordV3Hit(backup, {}, hit('request-rule', '/redirect', 'PATCH'))).toMatchObject({
      counters: { 'request-rule': 1 },
    })
    for (const invalidHit of [
      hit('missing', '/api', 'POST'),
      hit('response-rule', '/wrong', 'POST'),
      hit('response-rule', '/api', 'GET'),
      hit('disabled-action', '/disabled', 'GET'),
      hit('disabled-rule', '/disabled-rule', 'GET'),
    ]) {
      expect(recordV3Hit(backup, {}, invalidHit)).toBeUndefined()
    }
  })

  it('sanitizes counters to known IDs and safe non-negative integers', () => {
    const value = {
      'response-rule': 2,
      'request-rule': 0,
      unknown: 10,
      negative: -1,
      fraction: 1.5,
      unsafe: Number.MAX_SAFE_INTEGER + 1,
      nan: Number.NaN,
    }
    expect(sanitizeV3HitCounters(value, backup)).toEqual({
      'response-rule': 2,
      'request-rule': 0,
    })
    expect(
      sanitizeV3HitCounters(Object.assign(Object.create({ inherited: 1 }), value), backup)
    ).toEqual({})
    expect(sanitizeV3HitCounters([], backup)).toEqual({})
    expect(
      sanitizeV3HitCounters(Object.assign(Object.create(null), { 'response-rule': 3 }), backup)
    ).toEqual({
      'response-rule': 3,
    })
  })

  it('totals only valid known counters', () => {
    expect(
      getV3HitTotal({ 'response-rule': 4, 'request-rule': 3, unknown: 100, negative: -2 }, backup)
    ).toBe(7)
    expect(getV3HitTotal(Object.create({ 'response-rule': 4 }), backup)).toBe(0)
  })

  it('increments counters but never exceeds the maximum safe integer', () => {
    expect(
      recordV3Hit(
        backup,
        { 'response-rule': Number.MAX_SAFE_INTEGER - 1 },
        hit('response-rule', '/api', 'POST')
      )
    ).toMatchObject({
      counters: { 'response-rule': Number.MAX_SAFE_INTEGER },
      count: Number.MAX_SAFE_INTEGER,
    })
    expect(
      recordV3Hit(
        backup,
        { 'response-rule': Number.MAX_SAFE_INTEGER },
        hit('response-rule', '/api', 'POST')
      )
    ).toMatchObject({
      counters: { 'response-rule': Number.MAX_SAFE_INTEGER },
      count: Number.MAX_SAFE_INTEGER,
    })
    expect(
      recordV3Hit(
        backup,
        { 'response-rule': Number.MAX_SAFE_INTEGER + 1 },
        hit('response-rule', '/api', 'POST')
      )
    ).toMatchObject({
      counters: { 'response-rule': 1 },
      count: 1,
    })
  })
})
