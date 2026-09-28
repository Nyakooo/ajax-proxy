import { describe, expect, it } from 'vitest'
import {
  isRecord,
  isValidGlobalState,
  isValidInterceptors,
  isValidMode,
  isValidRedirectors,
} from '../src/validateState'

describe('proxy state validation', () => {
  it('accepts plain records and rejects objects with custom prototypes', () => {
    expect(isRecord({})).toBe(true)
    expect(isRecord(Object.create(null))).toBe(true)
    expect(isRecord(Object.create({ inherited: true }))).toBe(false)
    expect(isRecord(null)).toBe(false)
    expect(isRecord([])).toBe(false)
  })

  it('validates supported modes and interceptor rules', () => {
    expect(isValidMode('interceptor')).toBe(true)
    expect(isValidMode('unknown')).toBe(false)
    expect(
      isValidInterceptors([
        {
          match_url: '/api',
          switch_on: true,
          filter_type: 'regex',
          method: 'POST',
          override_type: 'function',
          override_func: 'return { status: 200 }',
          hit: 2,
        },
      ])
    ).toBe(true)
    expect(isValidInterceptors([])).toBe(true)
    expect(isValidInterceptors([{ match_url: '/api', switch_on: 'yes' }])).toBe(false)
    expect(isValidInterceptors([{ match_url: ' ', switch_on: true }])).toBe(false)
    expect(isValidInterceptors([{ match_url: '/api', switch_on: true, hit: Number.NaN }])).toBe(
      false
    )
    expect(isValidInterceptors([{ match_url: '/api', switch_on: true, status_code: 200 }])).toBe(
      true
    )
    expect(isValidInterceptors([{ match_url: '/api', switch_on: true, status_code: 700 }])).toBe(
      false
    )
  })

  it('validates redirect rules and nested header/ignore fields', () => {
    expect(
      isValidRedirectors([
        {
          domain: 'example.test',
          redirect_url: 'https://target.test',
          switch_on: true,
          headers: [{ key: 'x-test', value: 'ok', description: 'test' }],
          ignores: ['/health'],
          redirect_type: 'text',
        },
      ])
    ).toBe(true)
    expect(isValidRedirectors([])).toBe(true)
    expect(
      isValidRedirectors([
        { domain: 'example.test', redirect_url: '/', switch_on: true, headers: [{}] },
      ])
    ).toBe(false)
    expect(
      isValidRedirectors([
        { domain: 'example.test', redirect_url: '/', switch_on: true, ignores: [1] },
      ])
    ).toBe(false)
  })

  it('requires a complete and well-formed global state', () => {
    expect(
      isValidGlobalState({
        global_on: true,
        mode: 'redirector',
        interceptor_matching_content: [],
        redirector_matching_content: [],
      })
    ).toBe(true)
    expect(isValidGlobalState({ global_on: true, mode: 'redirector' })).toBe(false)
  })
})
