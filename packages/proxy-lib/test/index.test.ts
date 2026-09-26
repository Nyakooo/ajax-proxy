import { afterEach, describe, expect, it, vi } from 'vitest'

class ExistingXMLHttpRequest {
  readyState = 0
  responseText = ''
  response: unknown = ''
  responseType = ''
  responseURL = ''
  status = 200
  statusText = 'OK'
  openedUrls: string[] = []
  onreadystatechange: ((event: Event) => void) | null = null

  open = (_method: string, url: string | URL) => {
    const target = url.toString()
    this.openedUrls.push(target)
    this.responseURL = target
    this.readyState = 1
  }

  send = (body?: Document | XMLHttpRequestBodyInit | null) => {
    this.responseText = typeof body === 'string' ? body : 'page response'
    this.response = this.responseText
    this.readyState = 4
    this.onreadystatechange?.(new Event('readystatechange'))
  }

  setRequestHeader = () => {}
  abort = () => {}
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('proxy lifecycle and page wrappers', () => {
  it('mounts the validated V3 backup on both Fetch and XHR', async () => {
    vi.stubGlobal('XMLHttpRequest', ExistingXMLHttpRequest)
    const dispatchedRequests: Array<{ url: string; body: string }> = []
    const pageFetch = vi.fn(async (input: RequestInfo | URL) => {
      const request = input instanceof Request ? input : new Request(input)
      dispatchedRequests.push({ url: request.url, body: await request.clone().text() })
      return new Response(JSON.stringify({ url: request.url, body: await request.text() }))
    })
    const dispatchEvent = vi.fn()
    vi.stubGlobal('window', {
      XMLHttpRequest: ExistingXMLHttpRequest,
      fetch: pageFetch,
      dispatchEvent,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      eval,
    })
    const { default: lib } = await import('../src/index')
    lib.updateV3({
      format: 'ajax-proxy-backup',
      formatVersion: 3,
      settings: { globalEnabled: true, mode: 'interceptor', language: 'en' },
      tags: [],
      rules: [
        {
          id: 'combined',
          enabled: true,
          match: { url: '/api', method: 'POST' },
          request: { enabled: true, redirect: { url: 'https://mock.test/target' } },
          response: {
            enabled: true,
            replace: { status: 201, body: { mocked: true } },
          },
        },
      ],
    })

    const response = await window.fetch('https://example.test/api', {
      method: 'POST',
      body: 'request payload',
    })
    expect(await response.json()).toEqual({ mocked: true })
    expect(response.status).toBe(201)
    expect(pageFetch).toHaveBeenCalledOnce()
    expect(dispatchedRequests).toEqual([
      { url: 'https://mock.test/target', body: 'request payload' },
    ])

    const xhr = new window.XMLHttpRequest()
    xhr.open('POST', 'https://example.test/api')
    xhr.send('request payload')
    expect(xhr.openedUrls).toEqual(['https://mock.test/target'])
    expect(xhr.status).toBe(201)
    expect(xhr.responseText).toBe('{"mocked":true}')
    // V3 hits use their dedicated diagnostics protocol, never the legacy V2 badge event.
    expect(dispatchEvent.mock.calls.map(([event]) => (event as CustomEvent).detail)).toEqual([
      {
        kind: 'v3-hit',
        rule_id: 'combined',
        match_url: '/api',
        method: 'POST',
        url: 'https://example.test/api',
      },
      {
        kind: 'v3-hit',
        rule_id: 'combined',
        match_url: '/api',
        method: 'POST',
        url: 'https://example.test/api',
      },
    ])
  })

  it('keeps an invalid V3 update from replacing an active configuration', async () => {
    vi.stubGlobal('XMLHttpRequest', ExistingXMLHttpRequest)
    const pageFetch = vi.fn(async () => new Response('native'))
    vi.stubGlobal('window', {
      XMLHttpRequest: ExistingXMLHttpRequest,
      fetch: pageFetch,
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      eval,
    })
    const { default: lib } = await import('../src/index')
    const backup = {
      format: 'ajax-proxy-backup',
      formatVersion: 3,
      settings: { globalEnabled: true, mode: 'interceptor', language: 'en' },
      tags: [],
      rules: [],
    }
    expect(lib.updateV3(backup)).toEqual({ ok: true, status: 'updated' })

    const invalidConfig = { ...backup, formatVersion: 2 }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(lib.updateV3(invalidConfig)).toMatchObject({
      ok: false,
      issues: [{ path: 'formatVersion' }],
    })
    expect(warn).toHaveBeenCalledWith(
      'invalid V3 configuration',
      'formatVersion: Expected version 3, 4, or 5.'
    )

    expect(await (await window.fetch('https://example.test/no-match')).text()).toBe('native')
    expect(window.fetch).not.toBe(pageFetch)

    expect(
      lib.updateV3({ ...backup, settings: { ...backup.settings, globalEnabled: false } })
    ).toEqual({ ok: true, status: 'updated' })
    expect(window.fetch).toBe(pageFetch)
  })

  it('disables a captured V2 proxy while V3 owns state and restores it after V3 removal', async () => {
    vi.stubGlobal('XMLHttpRequest', ExistingXMLHttpRequest)
    const pageFetch = vi.fn(async () => new Response('native'))
    vi.stubGlobal('window', {
      XMLHttpRequest: ExistingXMLHttpRequest,
      fetch: pageFetch,
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      eval,
    })
    const { default: lib } = await import('../src/index')
    lib.update({
      global_on: true,
      mode: 'interceptor',
      interceptor_matching_content: [
        {
          switch_on: true,
          match_url: '/api',
          override: 'v2',
          status_code: '200',
          override_type: 'json',
        },
      ],
      redirector_matching_content: [],
    })
    const capturedV2Proxy = window.fetch
    const pageWrapper = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      capturedV2Proxy(input, init)
    )
    window.fetch = pageWrapper

    lib.updateV3({
      format: 'ajax-proxy-backup',
      formatVersion: 3,
      settings: { globalEnabled: true, mode: 'interceptor', language: 'en' },
      tags: [],
      rules: [],
    })
    expect(await (await window.fetch(new Request('https://example.test/api'))).text()).toBe(
      'native'
    )
    expect(window.fetch).toBe(pageWrapper)

    expect(lib.updateV3(null)).toEqual({ ok: true, status: 'cleared' })
    expect(await (await window.fetch(new Request('https://example.test/api'))).text()).toBe('v2')
  })

  it('layers over wrappers present at injection and restores them when disabled', async () => {
    vi.stubGlobal('XMLHttpRequest', ExistingXMLHttpRequest)
    const pageFetch = vi.fn(async () => new Response('page fetch'))
    vi.stubGlobal('window', {
      XMLHttpRequest: ExistingXMLHttpRequest,
      fetch: pageFetch,
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      eval,
    })
    const { default: lib } = await import('../src/index')

    lib.update({
      global_on: true,
      mode: 'interceptor',
      interceptor_matching_content: [],
      redirector_matching_content: [],
    })
    await window.fetch('/page')
    const interceptedRequest = new window.XMLHttpRequest()
    interceptedRequest.open('GET', '/page')
    interceptedRequest.send()

    expect(pageFetch).toHaveBeenCalledOnce()
    expect(interceptedRequest.openedUrls).toEqual(['/page'])

    lib.update('redirector')
    await window.fetch('https://example.test/redirector')
    const redirectedRequest = new window.XMLHttpRequest()
    redirectedRequest.open('GET', '/redirector')

    expect(pageFetch).toHaveBeenCalledTimes(2)
    expect(redirectedRequest.openedUrls).toEqual(['/redirector'])

    lib.update(false)
    expect(window.XMLHttpRequest).toBe(ExistingXMLHttpRequest)
    expect(window.fetch).toBe(pageFetch)
    await window.fetch('/disabled')
    expect(pageFetch).toHaveBeenCalledTimes(3)
  })

  it('preserves page wrappers installed outside the proxy and disables the inner proxy', async () => {
    vi.stubGlobal('XMLHttpRequest', ExistingXMLHttpRequest)
    const originFetch = vi.fn(async () => new Response('page response'))
    vi.stubGlobal('window', {
      XMLHttpRequest: ExistingXMLHttpRequest,
      fetch: originFetch,
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      eval,
    })
    const { default: lib } = await import('../src/index')
    lib.update({
      global_on: true,
      mode: 'redirector',
      interceptor_matching_content: [],
      redirector_matching_content: [
        {
          switch_on: true,
          domain: '/api',
          redirect_url: '/mock',
        },
      ],
    })
    const proxyFetch = window.fetch
    const pageFetchWrapper = vi.fn((...args: Parameters<typeof window.fetch>) =>
      proxyFetch(...args)
    )
    window.fetch = pageFetchWrapper
    const ProxyXHR = window.XMLHttpRequest
    class PageXHRWrapper extends ProxyXHR {}
    window.XMLHttpRequest = PageXHRWrapper

    lib.update(false)
    expect(window.fetch).toBe(pageFetchWrapper)
    expect(window.XMLHttpRequest).toBe(PageXHRWrapper)
    await window.fetch('https://example.test/api')
    const request = new window.XMLHttpRequest()
    request.open('GET', 'https://example.test/api')

    expect(pageFetchWrapper).toHaveBeenCalledOnce()
    expect(originFetch).toHaveBeenCalledWith('https://example.test/api', undefined)
    expect(request.openedUrls).toEqual(['https://example.test/api'])

    lib.update(true)
    await window.fetch('https://example.test/api')
    const reenabledRequest = new window.XMLHttpRequest()
    reenabledRequest.open('GET', 'https://example.test/api')

    expect(originFetch.mock.calls.at(-1)?.[0]).toMatchObject({
      url: 'https://example.test/mock',
    })
    expect(reenabledRequest.openedUrls).toEqual(['https://example.test/mock'])
  })
})
