import { afterEach, describe, expect, it, vi } from 'vitest'
import { createV3Fetch } from '../src/v3Fetch'
import type { V3Rule } from '@proxy/v3-domain'

afterEach(() => vi.restoreAllMocks())

function rule(id: string, options: Partial<V3Rule> = {}): V3Rule {
  return {
    id,
    enabled: true,
    match: { url: '/api', method: 'POST' },
    request: { enabled: false, redirect: { url: 'https://target.test/replaced' } },
    response: { enabled: false, replace: {} },
    ...options,
  }
}

describe('createV3Fetch', () => {
  it('uses the first rule selected on the original URL for redirect and response replacement', async () => {
    const selectedRule = rule('first', {
      request: { enabled: true, redirect: { url: '/redirected' } },
      response: {
        enabled: true,
        replace: { status: 201, headers: { 'x-v3': 'applied' }, body: { ok: true } },
      },
    })
    const laterRule = rule('later', {
      request: { enabled: true, redirect: { url: 'https://wrong.test/' } },
    })
    const response = new Response('network body', {
      headers: { 'content-length': '12', 'x-network': 'kept' },
    })
    Object.defineProperty(response, 'url', { value: 'https://target.test/final' })
    Object.defineProperty(response, 'redirected', { value: true })
    const fetcher = vi.fn(async (request: Request) => {
      expect(request.url).toBe('https://example.test/redirected')
      return response
    })
    const onMatched = vi.fn()
    const fetch = createV3Fetch(fetcher, {
      getRules: () => [selectedRule, laterRule],
      onMatched,
    })

    const result = await fetch('https://example.test/api/items', {
      method: 'POST',
      body: 'payload',
    })

    expect(fetcher).toHaveBeenCalledOnce()
    expect(onMatched).toHaveBeenCalledExactlyOnceWith(selectedRule, 0)
    expect(result.status).toBe(201)
    expect(result.headers.get('x-v3')).toBe('applied')
    expect(result.headers.get('x-network')).toBe('kept')
    expect(result.headers.has('content-length')).toBe(false)
    expect(result.url).toBe('https://target.test/final')
    expect(result.redirected).toBe(true)
    expect(await result.json()).toEqual({ ok: true })
  })

  it('preserves the effective Request properties and body while redirecting', async () => {
    const selectedRule = rule('redirect', {
      request: { enabled: true, redirect: { url: 'https://target.test/post' } },
    })
    const fetcher = vi.fn(async () => new Response('ok'))
    const fetch = createV3Fetch(fetcher, { getRules: () => [selectedRule] })
    const request = new Request('https://example.test/api', {
      method: 'POST',
      body: 'request body',
      headers: {
        'x-original': 'kept',
        authorization: 'Bearer secret',
        'proxy-authorization': 'Basic secret',
        cookie: 'session=secret',
      },
      credentials: 'include',
      cache: 'no-store',
    })

    await fetch(request)

    const redirected = fetcher.mock.calls[0][0] as Request
    expect(redirected.url).toBe('https://target.test/post')
    expect(redirected.method).toBe('POST')
    expect(redirected.headers.get('x-original')).toBe('kept')
    expect(redirected.headers.has('authorization')).toBe(false)
    expect(redirected.headers.has('proxy-authorization')).toBe(false)
    expect(redirected.headers.has('cookie')).toBe(false)
    expect(redirected.credentials).toBe('include')
    expect(redirected.cache).toBe('no-store')
    expect(await redirected.text()).toBe('request body')
  })

  it('fails open to the original request when redirect construction fails and still replaces its response', async () => {
    const selectedRule = rule('fallback', {
      request: { enabled: true, redirect: { url: 'javascript:alert(1)' } },
      response: { enabled: true, replace: { body: 'replacement' } },
    })
    const response = new Response('original')
    const fetcher = vi.fn(async () => response)
    const fetch = createV3Fetch(fetcher, { getRules: () => [selectedRule] })
    const input = 'https://example.test/api'
    const init = { method: 'POST', body: 'data' }

    const result = await fetch(input, init)

    expect(fetcher).toHaveBeenCalledExactlyOnceWith(input, init)
    expect(await result.text()).toBe('"replacement"')
  })

  it('does not retry the original URL when a redirected network request fails', async () => {
    const selectedRule = rule('redirect', {
      request: { enabled: true, redirect: { url: 'https://target.test/' } },
    })
    const fetcher = vi.fn(async () => {
      throw new TypeError('network error')
    })
    const fetch = createV3Fetch(fetcher, { getRules: () => [selectedRule] })

    await expect(
      fetch('https://example.test/api', { method: 'POST', body: 'data' })
    ).rejects.toThrow('network error')
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('preserves no-body status semantics and does not let statistics errors affect the request', async () => {
    const selectedRule = rule('no-body', {
      response: { enabled: true, replace: { status: 204, body: { ignored: true } } },
    })
    const fetcher = vi.fn(async () => new Response('original'))
    const fetch = createV3Fetch(fetcher, {
      getRules: () => [selectedRule],
      onMatched: () => {
        throw new Error('statistics unavailable')
      },
    })

    const result = await fetch('https://example.test/api', { method: 'POST' })

    expect(result.status).toBe(204)
    expect(result.body).toBeNull()
  })

  it('passes through unmatched requests without rewriting the input', async () => {
    const fetcher = vi.fn(async () => new Response('ok'))
    const fetch = createV3Fetch(fetcher, {
      getRules: () => [rule('other', { match: { url: '/else' } })],
    })
    const input = 'https://example.test/api'
    const init = { method: 'POST' }

    await fetch(input, init)

    expect(fetcher).toHaveBeenCalledExactlyOnceWith(input, init)
  })
})
