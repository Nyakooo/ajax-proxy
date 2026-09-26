import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RefGlobalState } from '../src/types'

async function createRedirectHarness(
  rules: RefGlobalState['value']['redirector_matching_content'] = [
    {
      switch_on: true,
      domain: 'https://example.test/api',
      redirect_url: 'https://target.test/mock',
      method: 'POST',
      filter_type: 'normal',
      redirect_type: 'text',
      headers: [{ key: 'x-redirected', value: 'yes' }],
    },
  ]
) {
  vi.resetModules()
  let forwardedRequest: Request | undefined
  const originFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    forwardedRequest = input instanceof Request ? input : new Request(input, init)
    return new Response('redirected response')
  })
  vi.stubGlobal('window', { fetch: originFetch, eval })

  const { default: customFetch, initRedirectFetchState } = await import('../src/redirectFetch')
  const state: RefGlobalState = {
    value: {
      global_on: true,
      mode: 'redirector',
      interceptor_matching_content: [],
      redirector_matching_content: rules,
    },
  }
  initRedirectFetchState(state)
  return { customFetch, originFetch, getForwardedRequest: () => forwardedRequest }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('RedirectFetch Request input', () => {
  it('matches a Request and preserves its request options when redirecting', async () => {
    const { customFetch, getForwardedRequest } = await createRedirectHarness()
    const controller = new AbortController()
    const request = new Request('https://example.test/api/users', {
      method: 'POST',
      body: 'original body',
      headers: { 'x-original': 'preserved' },
      credentials: 'include',
      mode: 'cors',
      cache: 'no-cache',
      redirect: 'manual',
      referrerPolicy: 'origin',
      signal: controller.signal,
    })

    const response = await customFetch(request)
    const forwardedRequest = getForwardedRequest()

    expect(await response.text()).toBe('redirected response')
    expect(forwardedRequest).toBeInstanceOf(Request)
    expect(forwardedRequest?.url).toBe('https://target.test/mock/users')
    expect(forwardedRequest?.method).toBe('POST')
    expect(await forwardedRequest?.text()).toBe('original body')
    expect(forwardedRequest?.headers.get('x-original')).toBe('preserved')
    expect(forwardedRequest?.headers.get('x-redirected')).toBe('yes')
    expect(forwardedRequest?.credentials).toBe('include')
    expect(forwardedRequest?.mode).toBe('cors')
    expect(forwardedRequest?.cache).toBe('no-cache')
    expect(forwardedRequest?.redirect).toBe('manual')
    expect(forwardedRequest?.referrerPolicy).toBe('origin')
    expect(forwardedRequest?.signal.aborted).toBe(false)
  })

  it('uses init.method and init.body when they override a Request', async () => {
    const { customFetch, getForwardedRequest } = await createRedirectHarness()
    const request = new Request('https://example.test/api/users')

    await customFetch(request, { method: 'POST', body: 'override body' })

    expect(getForwardedRequest()?.method).toBe('POST')
    expect(await getForwardedRequest()?.text()).toBe('override body')
  })

  it('continues past a method mismatch and applies the first matching rule', async () => {
    const { customFetch, getForwardedRequest } = await createRedirectHarness([
      {
        switch_on: true,
        domain: 'https://example.test/api',
        redirect_url: 'https://wrong.test/first',
        method: 'GET',
      },
      {
        switch_on: true,
        domain: 'https://example.test/api',
        redirect_url: 'https://target.test/second',
        method: 'POST',
      },
    ])

    await customFetch(new Request('https://example.test/api/users', { method: 'POST' }))

    expect(getForwardedRequest()?.url).toBe('https://target.test/second/users')
  })

  it('passes an ignored request to native fetch without redirecting it', async () => {
    const rules = [
      {
        switch_on: true,
        domain: 'https://example.test/api',
        redirect_url: 'https://target.test/mock',
        method: 'POST',
        ignores: ['/internal'],
      },
    ]
    const { customFetch, originFetch, getForwardedRequest } = await createRedirectHarness(rules)
    const input = new Request('https://example.test/api/internal/users', { method: 'POST' })
    const init = { headers: { 'x-original': 'preserved' } }

    await customFetch(input, init)

    expect(originFetch).toHaveBeenCalledTimes(1)
    expect(originFetch).toHaveBeenCalledWith(input, init)
    expect(getForwardedRequest()?.url).toBe('https://example.test/api/internal/users')
  })

  it('sends the original request when a redirect function throws', async () => {
    const { customFetch, originFetch } = await createRedirectHarness([
      {
        switch_on: true,
        domain: 'https://example.test/api',
        redirect_url: '',
        method: 'POST',
        redirect_type: 'function',
        redirect_func: 'function(req, next) { throw new Error("failed") }',
      },
    ])
    const request = new Request('https://example.test/api/users', { method: 'POST' })

    await customFetch(request)

    expect(originFetch).toHaveBeenCalledWith(request, undefined)
  })
})
