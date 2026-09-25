import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RefGlobalState } from '../src/types'

async function createFetchHarness(
  options: {
    method: string
    matchUrl: string
    responseUrl?: string
    responseStatus?: number
    responseHeaders?: HeadersInit
    statusCode?: string
    override?: string
    overrideType?: 'json' | 'function'
    overrideFunc?: string
    rules?: RefGlobalState['value']['interceptor_matching_content']
  } = { method: 'POST', matchUrl: '/api/original' }
) {
  vi.resetModules()
  const responseStatus = options.responseStatus ?? 200
  const originalBody = [204, 205, 304].includes(responseStatus) ? null : 'original response'
  const response = new Response(originalBody, {
    status: responseStatus,
    headers: options.responseHeaders,
  })
  Object.defineProperty(response, 'url', {
    value: options.responseUrl ?? 'https://example.test/api/original',
  })
  Object.defineProperty(response, 'redirected', { value: true })
  Object.defineProperty(response, 'type', { value: 'cors' })
  const originFetch = vi.fn().mockResolvedValue(response)
  const dispatchEvent = vi.fn()
  vi.stubGlobal('window', { fetch: originFetch, dispatchEvent, eval })

  const { default: customFetch, initInterceptorFetchState } = await import('../src/createFetch')
  const state: RefGlobalState = {
    value: {
      global_on: true,
      mode: 'interceptor',
      interceptor_matching_content: options.rules ?? [
        {
          switch_on: true,
          match_url: options.matchUrl,
          method: options.method as 'GET' | 'POST' | 'HEAD',
          override: options.override ?? 'intercepted response',
          status_code: options.statusCode ?? '200',
          override_type: options.overrideType,
          override_func: options.overrideFunc,
        },
      ],
      redirector_matching_content: [],
    },
  }
  initInterceptorFetchState(state)
  return { customFetch, originFetch, dispatchEvent, originalResponse: response }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('CustomFetch Request input', () => {
  it('matches the method and URL from a Request when init is omitted', async () => {
    const { customFetch, originFetch, dispatchEvent } = await createFetchHarness({
      method: 'POST',
      matchUrl: '/api/original',
      responseUrl: 'https://example.test/api/final',
    })
    const request = new Request('https://example.test/api/original', { method: 'POST' })

    const response = await customFetch(request)

    expect(await response.text()).toBe('intercepted response')
    expect(originFetch).toHaveBeenCalledWith(request, undefined)
    expect(dispatchEvent).toHaveBeenCalledOnce()
    expect(dispatchEvent.mock.calls[0][0].detail).toMatchObject({
      url: request.url,
      match_url: '/api/original',
      method: 'POST',
    })
  })

  it('uses init.method when it overrides the Request method', async () => {
    const { customFetch } = await createFetchHarness({
      method: 'POST',
      matchUrl: '/api/original',
    })
    const request = new Request('https://example.test/api/original', { method: 'GET' })

    const response = await customFetch(request, { method: 'POST' })

    expect(await response.text()).toBe('intercepted response')
  })

  it('uses GET as the effective method when no method is provided', async () => {
    const { customFetch } = await createFetchHarness({
      method: 'GET',
      matchUrl: '/api/original',
    })

    const response = await customFetch('https://example.test/api/original')

    expect(await response.text()).toBe('intercepted response')
  })

  it('returns the original response when a custom function throws', async () => {
    const { customFetch, originalResponse, dispatchEvent } = await createFetchHarness({
      method: 'POST',
      matchUrl: '/api/original',
      overrideType: 'function',
      overrideFunc: 'function(req, res, next) { throw new Error("failed") }',
    })

    const response = await customFetch('https://example.test/api/original', { method: 'POST' })

    expect(response).toBe(originalResponse)
    expect(dispatchEvent).not.toHaveBeenCalled()
  })

  it.each([204, 205, 304])('replaces status %i with a bodyless response', async (statusCode) => {
    const { customFetch } = await createFetchHarness({
      method: 'GET',
      matchUrl: '/api/original',
      responseUrl: 'https://example.test/api/original',
      responseStatus: 200,
      responseHeaders: {
        'content-length': '17',
        'content-encoding': 'gzip',
        'x-origin': 'preserved',
      },
      statusCode: String(statusCode),
    })

    const response = await customFetch('https://example.test/api/original')

    expect(response.status).toBe(statusCode)
    expect(response.body).toBeNull()
    expect(await response.text()).toBe('')
    expect(response.headers.get('content-length')).toBeNull()
    expect(response.headers.get('content-encoding')).toBeNull()
    expect(response.headers.get('x-origin')).toBe('preserved')
  })

  it('omits the replacement body for HEAD and preserves original Response metadata', async () => {
    const { customFetch } = await createFetchHarness({
      method: 'HEAD',
      matchUrl: '/api/original',
      responseHeaders: { 'content-length': '17', 'x-origin': 'preserved' },
    })

    const response = await customFetch('https://example.test/api/original', { method: 'HEAD' })

    expect(response.status).toBe(200)
    expect(response.body).toBeNull()
    expect(response.headers.get('content-length')).toBeNull()
    expect(response.headers.get('x-origin')).toBe('preserved')
    expect(response.url).toBe('https://example.test/api/original')
    expect(response.redirected).toBe(true)
    expect(response.type).toBe('cors')
  })

  it('returns the original response when the replacement status is invalid', async () => {
    const { customFetch, originalResponse } = await createFetchHarness({
      method: 'GET',
      matchUrl: '/api/original',
      statusCode: '101',
    })

    const response = await customFetch('https://example.test/api/original')

    expect(response).toBe(originalResponse)
  })

  it('applies and reports only the first matching rule', async () => {
    const { customFetch, dispatchEvent } = await createFetchHarness({
      method: 'POST',
      matchUrl: '/api/original',
      rules: [
        {
          switch_on: true,
          match_url: '/api',
          method: 'POST',
          override: 'first rule',
          status_code: '200',
        },
        {
          switch_on: true,
          match_url: '/api/original',
          method: 'POST',
          override: 'second rule',
          status_code: '201',
        },
      ],
    })

    const response = await customFetch('https://example.test/api/original', { method: 'POST' })

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('first rule')
    expect(dispatchEvent).toHaveBeenCalledOnce()
    expect(dispatchEvent.mock.calls[0][0].detail).toMatchObject({
      match_url: '/api',
      method: 'POST',
      rule_index: 0,
    })
  })

  it('continues after a method mismatch and reports the next matching rule index', async () => {
    const { customFetch, dispatchEvent } = await createFetchHarness({
      method: 'POST',
      matchUrl: '/api/original',
      rules: [
        {
          switch_on: true,
          match_url: '/api/original',
          method: 'GET',
          override: 'wrong method',
          status_code: '202',
        },
        {
          switch_on: true,
          match_url: '/api/original',
          method: 'POST',
          override: 'matched rule',
          status_code: '200',
        },
      ],
    })

    const response = await customFetch('https://example.test/api/original', { method: 'POST' })

    expect(await response.text()).toBe('matched rule')
    expect(dispatchEvent).toHaveBeenCalledOnce()
    expect(dispatchEvent.mock.calls[0][0].detail.rule_index).toBe(1)
  })
})
