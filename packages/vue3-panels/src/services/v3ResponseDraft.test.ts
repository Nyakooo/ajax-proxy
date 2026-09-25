import { describe, expect, it } from 'vitest'
import {
  buildV3ResponseRule,
  formatResponseBodyDraft,
  parseResponseBodyDraft,
} from './v3ResponseDraft.js'

describe('V3 response drafts', () => {
  it.each([
    ['object', '{"ok":true}', { ok: true }],
    ['array', '[1,"two"]', [1, 'two']],
    ['string primitive', '"hello"', 'hello'],
    ['number primitive', '42', 42],
    ['boolean primitive', 'false', false],
    ['null', 'null', null],
  ])('parses a JSON %s', (_label, draft, body) => {
    expect(parseResponseBodyDraft(draft)).toEqual({ ok: true, body })
    expect(JSON.parse(formatResponseBodyDraft(body))).toEqual(body)
  })

  it('returns a structured error for invalid JSON', () => {
    expect(parseResponseBodyDraft('{bad')).toEqual({ ok: false, error: 'invalid-json' })
    expect(buildV3ResponseRule({ id: 'new', match: { url: '/x' }, bodyDraft: '{bad' })).toEqual({
      ok: false,
      error: 'invalid-json',
    })
  })

  it.each(['199', '600', '200.5', 'abc', ''])(
    'rejects out of range or malformed status %s',
    (statusDraft) => {
      expect(
        buildV3ResponseRule({
          id: 'new',
          match: { url: '/x' },
          statusDraft,
          bodyDraft: '{}',
        })
      ).toEqual({ ok: false, error: 'invalid-status' })
    }
  )

  it('builds a response enabled rule with status 200 by default', () => {
    expect(
      buildV3ResponseRule({ id: 'new', match: { url: '/x' }, bodyDraft: '{"ok":true}' })
    ).toEqual({
      ok: true,
      rule: {
        id: 'new',
        enabled: true,
        match: { url: '/x' },
        response: { enabled: true, replace: { status: 200, body: { ok: true } } },
      },
    })
  })

  it('preserves an existing request action exactly when replacing response data', () => {
    const request = { enabled: true, redirect: { url: '/redirect', extra: 'kept' } }
    const existingRule = {
      id: 'existing',
      enabled: false,
      match: { url: '/old', method: 'POST' },
      request,
      response: { enabled: false, replace: { body: 'old' } },
    }

    const result = buildV3ResponseRule({
      existingRule,
      bodyDraft: 'null',
      statusDraft: '201',
    })

    expect(result).toEqual({
      ok: true,
      rule: {
        ...existingRule,
        response: { enabled: true, replace: { status: 201, body: null } },
      },
    })
    expect(result.rule.request).toBe(request)
  })

  it('preserves response fields that the JSON editor does not edit', () => {
    const headers = { 'x-debug': 'enabled' }
    const result = buildV3ResponseRule({
      existingRule: {
        id: 'existing',
        enabled: true,
        match: { url: '/x' },
        response: { enabled: true, replace: { headers, body: { old: true } } },
      },
      bodyDraft: '{"new":true}',
      statusDraft: '202',
    })

    expect(result.ok).toBe(true)
    expect(result.rule.response.replace).toEqual({
      headers,
      status: 202,
      body: { new: true },
    })
  })
})
