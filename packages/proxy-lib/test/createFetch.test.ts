import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RefGlobalState } from '../src/types'

async function createFetchHarness(
  options: {
    method: string
    matchUrl: string
    responseUrl?: string
  } = { method: 'POST', matchUrl: '/api/original' }
) {
  vi.resetModules()
  const response = new Response('original response', { status: 200 })
  Object.defineProperty(response, 'url', {
    value: options.responseUrl ?? 'https://example.test/api/original',
  })
  const originFetch = vi.fn().mockResolvedValue(response)
  const dispatchEvent = vi.fn()
  vi.stubGlobal('window', { fetch: originFetch, dispatchEvent })

  const { default: customFetch, initInterceptorFetchState } = await import('../src/createFetch')
  const state: RefGlobalState = {
    value: {
      global_on: true,
      mode: 'interceptor',
      interceptor_matching_content: [
        {
          switch_on: true,
          match_url: options.matchUrl,
          method: options.method as 'GET' | 'POST',
          override: 'intercepted response',
          status_code: '200',
        },
      ],
      redirector_matching_content: [],
    },
  }
  initInterceptorFetchState(state)
  return { customFetch, originFetch, dispatchEvent }
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
})
