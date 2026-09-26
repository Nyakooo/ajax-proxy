import { afterEach, describe, expect, it, vi } from 'vitest'
import { createV3Fetch } from '../../src/v3/fetch'
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
    expect(onMatched).toHaveBeenCalledExactlyOnceWith(selectedRule, 0, {
      url: 'https://example.test/api/items',
      method: 'POST',
    })
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

  it('reports request fallback and response success with one temporary correlation ID', async () => {
    const selectedRule = rule('redirect', {
      request: { enabled: true, redirect: { url: 'javascript:alert(1)' } },
      response: { enabled: true, replace: { body: { ok: true } } },
    })
    const fetcher = vi.fn(async () => new Response('native'))
    const onFetchOutcome = vi.fn()
    const fetch = createV3Fetch(fetcher, {
      getRules: () => [selectedRule],
      isFetchOutcomeDiagnosticsArmed: () => true,
      onFetchOutcome,
    })

    const result = await fetch('https://example.test/api', { method: 'POST' })

    expect(fetcher).toHaveBeenCalledOnce()
    expect(await result.json()).toEqual({ ok: true })
    expect(onFetchOutcome.mock.calls.map((call) => call.slice(2))).toEqual([
      ['request', 'fallback', 'redirect-construction-failed'],
      ['response', 'applied', 'response-replacement-applied'],
    ])
    expect(onFetchOutcome.mock.calls[0][1]).toBe(onFetchOutcome.mock.calls[1][1])
  })

  it('reports a dispatched network failure without retrying or calling it a rule fallback', async () => {
    const selectedRule = rule('redirect', {
      request: { enabled: true, redirect: { url: 'https://target.test/' } },
    })
    const fetcher = vi.fn(async () => {
      throw new TypeError('network error')
    })
    const onFetchOutcome = vi.fn()
    const fetch = createV3Fetch(fetcher, {
      getRules: () => [selectedRule],
      isFetchOutcomeDiagnosticsArmed: () => true,
      onFetchOutcome,
    })

    await expect(fetch('https://example.test/api', { method: 'POST' })).rejects.toThrow(
      'network error'
    )
    expect(fetcher).toHaveBeenCalledOnce()
    expect(onFetchOutcome.mock.calls.map((call) => call.slice(2))).toEqual([
      ['request', 'failed', 'network-failed'],
    ])
  })

  it('reports response function fallback without including error text', async () => {
    const selectedRule = rule('function', {
      response: { enabled: true, replace: { code: 'return {}' } },
    })
    const onFetchOutcome = vi.fn()
    const fetch = createV3Fetch(
      async () => new Response('native', { headers: { 'content-type': 'text/plain' } }),
      {
        getRules: () => [selectedRule],
        isFetchOutcomeDiagnosticsArmed: () => true,
        onFetchOutcome,
        executeResponseFunction: async () => {
          throw new Error('private function failure')
        },
      }
    )

    await fetch('https://example.test/api', { method: 'POST' })

    expect(onFetchOutcome.mock.calls.map((call) => call.slice(2))).toEqual([
      ['response', 'fallback', 'response-replacement-failed'],
    ])
    expect(JSON.stringify(onFetchOutcome.mock.calls)).not.toContain('private function failure')
  })

  it('reports unsupported response snapshot formats with a fixed reason', async () => {
    const selectedRule = rule('function', {
      response: { enabled: true, replace: { code: 'return {}' } },
    })
    const onFetchOutcome = vi.fn()
    const executeResponseFunction = vi.fn()
    const fetch = createV3Fetch(
      async () =>
        new Response('binary', { headers: { 'content-type': 'application/octet-stream' } }),
      {
        getRules: () => [selectedRule],
        isFetchOutcomeDiagnosticsArmed: () => true,
        onFetchOutcome,
        executeResponseFunction,
      }
    )

    await fetch('https://example.test/api', { method: 'POST' })

    expect(executeResponseFunction).not.toHaveBeenCalled()
    expect(onFetchOutcome.mock.calls.map((call) => call.slice(2))).toEqual([
      ['response', 'unsupported', 'response-replacement-unsupported'],
    ])
  })

  it('does not generate or report outcomes while the opt-in gate is off', async () => {
    const selectedRule = rule('redirect', {
      request: { enabled: true, redirect: { url: 'https://target.test/' } },
      response: { enabled: true, replace: { body: 'replacement' } },
    })
    const onFetchOutcome = vi.fn()
    const fetch = createV3Fetch(async () => new Response('native'), {
      getRules: () => [selectedRule],
      isFetchOutcomeDiagnosticsArmed: () => false,
      onFetchOutcome,
    })

    await fetch('https://example.test/api', { method: 'POST' })

    expect(onFetchOutcome).not.toHaveBeenCalled()
  })

  it('does not emit an outcome for a successful request with no configured actions', async () => {
    const selectedRule = rule('observe-only')
    const onFetchOutcome = vi.fn()
    const fetch = createV3Fetch(async () => new Response('native'), {
      getRules: () => [selectedRule],
      isFetchOutcomeDiagnosticsArmed: () => true,
      onFetchOutcome,
    })

    await fetch('https://example.test/api', { method: 'POST' })

    expect(onFetchOutcome).not.toHaveBeenCalled()
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
    const onNoMatch = vi.fn()
    const fetch = createV3Fetch(fetcher, {
      getRules: () => [rule('other', { match: { url: '/else' } })],
      onNoMatch,
    })
    const input = 'https://example.test/api'
    const init = { method: 'POST' }

    await fetch(input, init)

    expect(fetcher).toHaveBeenCalledExactlyOnceWith(input, init)
    expect(onNoMatch).toHaveBeenCalledExactlyOnceWith({
      url: 'https://example.test/api',
      method: 'POST',
    })
  })

  it('does not let no-match diagnostics change native requests or leak when their callback throws', async () => {
    const fetcher = vi.fn(async () => new Response('ok'))
    const input = 'https://example.test/api?private=value'
    const init = { method: 'POST', body: 'private body' }
    const fetch = createV3Fetch(fetcher, {
      getRules: () => [rule('other', { match: { url: '/else' } })],
      onNoMatch: () => {
        throw new Error('diagnostics unavailable')
      },
    })

    await expect(fetch(input, init)).resolves.toBeInstanceOf(Response)
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(input, init)
  })

  it('runs response functions on bounded text snapshots and applies validated changes', async () => {
    const selectedRule = rule('function', {
      response: { enabled: true, replace: { code: 'return { body: {} }' } },
    })
    const executeResponseFunction = vi.fn(async (_code, request, response) => ({
      status: 201,
      headers: { 'x-function': 'applied' },
      body: { request: request.body, response: JSON.parse(response.body) },
    }))
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.body).toBe('{"input":true}')
      return new Response('{"native":true}', {
        headers: { 'content-type': 'application/json', 'x-native': 'kept' },
      })
    })
    const fetch = createV3Fetch(fetcher, {
      getRules: () => [selectedRule],
      executeResponseFunction,
    })

    const result = await fetch('https://example.test/api', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"input":true}',
    })

    expect(executeResponseFunction).toHaveBeenCalledWith(
      'return { body: {} }',
      { url: 'https://example.test/api', method: 'POST', body: '{"input":true}' },
      expect.objectContaining({ status: 200, body: '{"native":true}' })
    )
    expect(executeResponseFunction.mock.calls[0][2].statusText).toBe('')
    expect(executeResponseFunction.mock.calls[0][2].headers).toEqual({
      'content-type': 'application/json',
      'x-native': 'kept',
    })
    expect(result.status).toBe(201)
    expect(result.headers.get('x-function')).toBe('applied')
    expect(result.headers.get('x-native')).toBe('kept')
    expect(await result.json()).toEqual({
      request: '{"input":true}',
      response: { native: true },
    })
  })

  it('fails open when a function rejects or returns an invalid result', async () => {
    const selectedRule = rule('function', {
      response: { enabled: true, replace: { code: 'throw new Error("no")' } },
    })
    const fetcher = vi.fn(
      async () => new Response('native', { headers: { 'content-type': 'text/plain' } })
    )
    const onFunctionError = vi.fn()
    const rejected = createV3Fetch(fetcher, {
      getRules: () => [selectedRule],
      onFunctionError,
      executeResponseFunction: async () => {
        throw new Error('Function response timed out after 5 seconds.')
      },
    })
    const invalid = createV3Fetch(fetcher, {
      getRules: () => [selectedRule],
      onFunctionError,
      executeResponseFunction: async () => ({ status: 200, unknown: true }),
    })

    expect(await (await rejected('https://example.test/api', { method: 'POST' })).text()).toBe(
      'native'
    )
    expect(await (await invalid('https://example.test/api', { method: 'POST' })).text()).toBe(
      'native'
    )
    expect(onFunctionError.mock.calls.map(([, , code]) => code)).toEqual([
      'timeout',
      'invalid-result',
    ])
  })

  it('fails open with a fixed diagnostic when the response function sandbox is unavailable', async () => {
    const selectedRule = rule('function', {
      response: { enabled: true, replace: { code: 'return { body: "changed" }' } },
    })
    const response = new Response('native', { headers: { 'content-type': 'text/plain' } })
    const onFunctionError = vi.fn()
    const onFetchOutcome = vi.fn()
    const fetch = createV3Fetch(async () => response, {
      getRules: () => [selectedRule],
      onFunctionError,
      isFetchOutcomeDiagnosticsArmed: () => true,
      onFetchOutcome,
    })

    const result = await fetch('https://example.test/api', { method: 'POST' })

    expect(result).toBe(response)
    expect(await result.text()).toBe('native')
    expect(onFunctionError.mock.calls[0][2]).toBe('sandbox-unavailable')
    expect(onFetchOutcome.mock.calls.map((call) => call.slice(2))).toEqual([
      ['response', 'unsupported', 'response-replacement-unsupported'],
    ])
  })

  it('does not expose binary response bodies to response functions', async () => {
    const executeResponseFunction = vi.fn(async () => ({ body: 'changed' }))
    const onFunctionError = vi.fn()
    const selectedRule = rule('function', {
      response: { enabled: true, replace: { code: 'return { body: "changed" }' } },
    })
    const fetch = createV3Fetch(
      async () =>
        new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } }),
      { getRules: () => [selectedRule], executeResponseFunction, onFunctionError }
    )

    const result = await fetch('https://example.test/api', { method: 'POST' })

    expect(executeResponseFunction).not.toHaveBeenCalled()
    expect([...new Uint8Array(await result.arrayBuffer())]).toEqual([1, 2, 3])
    expect(onFunctionError.mock.calls[0][2]).toBe('snapshot-unsupported')
  })

  it('fails open with the complete response when a function snapshot exceeds its size limit', async () => {
    const body = 'x'.repeat(512 * 1024 + 1)
    const response = new Response(body, { headers: { 'content-type': 'text/plain' } })
    const executeResponseFunction = vi.fn()
    const onFunctionError = vi.fn()
    const onFetchOutcome = vi.fn()
    const selectedRule = rule('large-snapshot', {
      response: { enabled: true, replace: { code: 'return { body: "changed" }' } },
    })
    const fetch = createV3Fetch(async () => response, {
      getRules: () => [selectedRule],
      executeResponseFunction,
      onFunctionError,
      isFetchOutcomeDiagnosticsArmed: () => true,
      onFetchOutcome,
    })

    const result = await fetch('https://example.test/api', { method: 'POST' })

    expect(result).toBe(response)
    expect(await result.text()).toBe(body)
    expect(executeResponseFunction).not.toHaveBeenCalled()
    expect(onFunctionError.mock.calls[0][2]).toBe('snapshot-too-large')
    expect(onFetchOutcome.mock.calls.map((call) => call.slice(2))).toEqual([
      ['response', 'fallback', 'response-replacement-failed'],
    ])
  })

  it('fails open with the original bytes when a text snapshot is not valid UTF-8', async () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0xc3, 0x28])
    const response = new Response(bytes, { headers: { 'content-type': 'text/plain' } })
    const executeResponseFunction = vi.fn()
    const onFunctionError = vi.fn()
    const onFetchOutcome = vi.fn()
    const selectedRule = rule('invalid-text-snapshot', {
      response: { enabled: true, replace: { code: 'return { body: "changed" }' } },
    })
    const fetch = createV3Fetch(async () => response, {
      getRules: () => [selectedRule],
      executeResponseFunction,
      onFunctionError,
      isFetchOutcomeDiagnosticsArmed: () => true,
      onFetchOutcome,
    })

    const result = await fetch('https://example.test/api', { method: 'POST' })

    expect(result).toBe(response)
    expect([...new Uint8Array(await result.arrayBuffer())]).toEqual([...bytes])
    expect(executeResponseFunction).not.toHaveBeenCalled()
    expect(onFunctionError.mock.calls[0][2]).toBe('snapshot-unsupported')
    expect(onFetchOutcome.mock.calls.map((call) => call.slice(2))).toEqual([
      ['response', 'unsupported', 'response-replacement-unsupported'],
    ])
  })

  it('fails open when response snapshot headers exceed the safe count', async () => {
    const response = new Response('native', {
      headers: {
        'content-type': 'text/plain',
        ...Object.fromEntries(
          Array.from({ length: 100 }, (_, index) => [`x-header-${index}`, 'ok'])
        ),
      },
    })
    const executeResponseFunction = vi.fn()
    const onFunctionError = vi.fn()
    const selectedRule = rule('too-many-snapshot-headers', {
      response: { enabled: true, replace: { code: 'return { body: "changed" }' } },
    })
    const fetch = createV3Fetch(async () => response, {
      getRules: () => [selectedRule],
      executeResponseFunction,
      onFunctionError,
    })

    const result = await fetch('https://example.test/api', { method: 'POST' })

    expect(result).toBe(response)
    expect(await result.text()).toBe('native')
    expect(executeResponseFunction).not.toHaveBeenCalled()
    expect(onFunctionError.mock.calls[0][2]).toBe('snapshot-too-large')
  })

  it('fails open when response snapshot headers exceed the combined byte limit', async () => {
    const response = new Response('native', {
      headers: {
        'content-type': 'text/plain',
        'x-first': 'a'.repeat(8192),
        'x-second': 'b'.repeat(8192),
        'x-third': 'c'.repeat(8192),
        'x-fourth': 'd'.repeat(8192),
        'x-fifth': 'e'.repeat(8192),
      },
    })
    const executeResponseFunction = vi.fn()
    const onFunctionError = vi.fn()
    const selectedRule = rule('large-snapshot-headers', {
      response: { enabled: true, replace: { code: 'return { body: "changed" }' } },
    })
    const fetch = createV3Fetch(async () => response, {
      getRules: () => [selectedRule],
      executeResponseFunction,
      onFunctionError,
    })

    const result = await fetch('https://example.test/api', { method: 'POST' })

    expect(result).toBe(response)
    expect(await result.text()).toBe('native')
    expect(executeResponseFunction).not.toHaveBeenCalled()
    expect(onFunctionError.mock.calls[0][2]).toBe('snapshot-too-large')
  })
})
