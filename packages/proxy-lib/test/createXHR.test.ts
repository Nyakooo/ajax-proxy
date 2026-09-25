import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RefGlobalState } from '../src/types'

class FakeXMLHttpRequest {
  readyState = 0
  responseText = ''
  response: unknown = ''
  responseURL = ''
  responseType = ''
  status = 0
  statusText = ''
  requestHeaders: Record<string, string[]> = {}
  openArgs: unknown[] = []
  sentBody: XMLHttpRequestBodyInit | null | undefined
  onreadystatechange: ((event: Event) => void) | null = null
  open = (
    method: string,
    url: string | URL,
    async = true,
    username?: string | null,
    password?: string | null
  ) => {
    this.openArgs = [method, url.toString(), async, username, password]
    this.responseURL = url.toString()
    this.status = 200
    this.statusText = 'OK'
  }
  setRequestHeader = (name: string, value: string) => {
    const key = name.toLowerCase()
    this.requestHeaders[key] = [...(this.requestHeaders[key] ?? []), value]
  }
  send = (body?: XMLHttpRequestBodyInit | null) => {
    this.sentBody = body
    this.responseText = typeof body === 'string' ? body : 'original response'
    this.response = this.responseText
    this.readyState = 4
    this.onreadystatechange?.(new Event('readystatechange'))
  }
  abort = () => {}
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('CustomXHR rule selection', () => {
  it('applies and reports only the first matching response rule', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest)
    const dispatchEvent = vi.fn()
    vi.stubGlobal('window', {
      XMLHttpRequest: FakeXMLHttpRequest,
      dispatchEvent,
      eval,
    })
    const { default: CustomXHR, initInterceptorXHRState } = await import('../src/createXHR')
    const state: RefGlobalState = {
      value: {
        global_on: true,
        mode: 'interceptor',
        interceptor_matching_content: [
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
        redirector_matching_content: [],
      },
    }
    initInterceptorXHRState(state)

    const request = new CustomXHR()
    const complete = new Promise<void>((resolve) => {
      request.onreadystatechange = () => {
        if (request.readyState === 4) resolve()
      }
    })
    request.open('POST', 'https://example.test/api/original')
    request.send('request body')
    await complete

    expect(request.responseText).toBe('first rule')
    expect(request.status).toBe(200)
    expect(dispatchEvent).toHaveBeenCalledOnce()
    expect(dispatchEvent.mock.calls[0][0].detail).toMatchObject({
      match_url: '/api',
      method: 'POST',
      rule_index: 0,
    })
  })

  it('continues past a redirect method mismatch and opens the first matching target', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest)
    vi.stubGlobal('window', { XMLHttpRequest: FakeXMLHttpRequest, eval })
    const { default: CustomRedirectXHR, initRedirectXHRState } = await import('../src/redirectXHR')
    const state: RefGlobalState = {
      value: {
        global_on: true,
        mode: 'redirector',
        interceptor_matching_content: [],
        redirector_matching_content: [
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
        ],
      },
    }
    initRedirectXHRState(state)

    const request = new CustomRedirectXHR()
    const openResult = request.open('POST', 'https://example.test/api/users')

    expect(openResult).toBeUndefined()
    expect(request.responseURL).toBe('https://target.test/second/users')
  })

  it('keeps open synchronous and preserves native arguments while redirecting', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest)
    vi.stubGlobal('window', { XMLHttpRequest: FakeXMLHttpRequest, eval })
    const { default: CustomRedirectXHR, initRedirectXHRState } = await import('../src/redirectXHR')
    initRedirectXHRState({
      value: {
        global_on: true,
        mode: 'redirector',
        interceptor_matching_content: [],
        redirector_matching_content: [
          {
            switch_on: true,
            domain: 'https://example.test/api',
            redirect_url: 'https://target.test/api',
            method: 'POST',
            headers: [{ key: 'x-rule', value: 'applied' }],
          },
        ],
      },
    })
    const request = new CustomRedirectXHR()

    const result = request.open('POST', 'https://example.test/api/users', false, 'alice', 'secret')
    request.setRequestHeader('x-rule', 'original')
    request.setRequestHeader('x-other', 'preserved')
    request.send('request body')

    expect(result).toBeUndefined()
    expect(request.openArgs).toEqual([
      'POST',
      'https://target.test/api/users',
      false,
      'alice',
      'secret',
    ])
    expect(request.requestHeaders).toEqual({ 'x-rule': ['applied'], 'x-other': ['preserved'] })
    expect(request.sentBody).toBe('request body')
  })

  it('falls back synchronously for Promise-based XHR redirect functions', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest)
    vi.stubGlobal('window', { XMLHttpRequest: FakeXMLHttpRequest, eval })
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { default: CustomRedirectXHR, initRedirectXHRState } = await import('../src/redirectXHR')
    initRedirectXHRState({
      value: {
        global_on: true,
        mode: 'redirector',
        interceptor_matching_content: [],
        redirector_matching_content: [
          {
            switch_on: true,
            domain: 'https://example.test/api',
            redirect_url: '',
            method: 'POST',
            redirect_type: 'function',
            redirect_func: 'async function(req) { return { url: "https://target.test/api" } }',
          },
        ],
      },
    })
    const request = new CustomRedirectXHR()

    const result = request.open('POST', 'https://example.test/api/users')

    expect(result).toBeUndefined()
    expect(request.responseURL).toBe('https://example.test/api/users')
    expect(warning).toHaveBeenCalledOnce()
  })

  it('applies callback-based redirect functions when they complete synchronously', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest)
    vi.stubGlobal('window', { XMLHttpRequest: FakeXMLHttpRequest, eval })
    const { default: CustomRedirectXHR, initRedirectXHRState } = await import('../src/redirectXHR')
    initRedirectXHRState({
      value: {
        global_on: true,
        mode: 'redirector',
        interceptor_matching_content: [],
        redirector_matching_content: [
          {
            switch_on: true,
            domain: 'https://example.test/api',
            redirect_url: '',
            method: 'POST',
            redirect_type: 'function',
            redirect_func:
              'function(req, next) { next({ url: req.url.replace("/api", "/mock") }) }',
          },
        ],
      },
    })
    const request = new CustomRedirectXHR()

    request.open('POST', 'https://example.test/api/users')

    expect(request.responseURL).toBe('https://example.test/mock/users')
  })
})
