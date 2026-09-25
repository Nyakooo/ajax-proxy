import { afterEach, describe, expect, it, vi } from 'vitest'

class ExistingXMLHttpRequest {
  readyState = 0
  responseText = ''
  response: unknown = ''
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
  it('layers over wrappers present at injection and restores them when disabled', async () => {
    vi.stubGlobal('XMLHttpRequest', ExistingXMLHttpRequest)
    const pageFetch = vi.fn(async () => new Response('page fetch'))
    vi.stubGlobal('window', {
      XMLHttpRequest: ExistingXMLHttpRequest,
      fetch: pageFetch,
      dispatchEvent: vi.fn(),
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
