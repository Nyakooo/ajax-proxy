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
  onreadystatechange: ((event: Event) => void) | null = null
  open = (method: string, url: string | URL) => {
    this.responseURL = url.toString()
    this.status = 200
    this.statusText = 'OK'
  }
  send = (body?: XMLHttpRequestBodyInit | null) => {
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
    await request.open('POST', 'https://example.test/api/users')

    expect(request.responseURL).toBe('https://target.test/second/users')
  })
})
