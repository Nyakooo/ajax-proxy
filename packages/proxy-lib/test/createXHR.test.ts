import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RefGlobalState } from '../src/types'

class FakeXMLHttpRequest extends EventTarget {
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
  calls: string[] = []
  #onreadystatechange: ((event: Event) => void) | null = null
  #onreadystatechangeListener = (event: Event) => this.#onreadystatechange?.call(this, event)
  constructor() {
    super()
  }
  get onreadystatechange() {
    return this.#onreadystatechange
  }
  set onreadystatechange(listener: ((event: Event) => void) | null) {
    if (this.#onreadystatechange) {
      super.removeEventListener('readystatechange', this.#onreadystatechangeListener)
    }
    this.#onreadystatechange = listener
    if (listener) super.addEventListener('readystatechange', this.#onreadystatechangeListener)
  }
  open = (
    method: string,
    url: string | URL,
    async = true,
    username?: string | null,
    password?: string | null
  ) => {
    this.calls.push('open')
    this.requestHeaders = {}
    this.readyState = 1
    this.responseText = ''
    this.response = ''
    this.status = 0
    this.openArgs = [method, url.toString(), async, username, password]
    this.responseURL = url.toString()
    this.status = 200
    this.statusText = 'OK'
  }
  setRequestHeader = (name: string, value: string) => {
    this.calls.push(`header:${name.toLowerCase()}`)
    const key = name.toLowerCase()
    this.requestHeaders[key] = [...(this.requestHeaders[key] ?? []), value]
  }
  send = (body?: XMLHttpRequestBodyInit | null) => {
    this.calls.push('send')
    this.sentBody = body
    this.responseText = typeof body === 'string' ? body : 'original response'
    this.response = this.responseText
    this.readyState = 4
    this.dispatchEvent(new Event('loadstart'))
    this.dispatchEvent(new Event('readystatechange'))
    this.dispatchEvent(new Event('progress'))
    this.dispatchEvent(new Event('load'))
    this.dispatchEvent(new Event('loadend'))
  }
  abort = () => {}
  dispatchEvent = (event: Event) => {
    return super.dispatchEvent(event)
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('CustomXHR rule selection', () => {
  it('forwards registered XHR events with the proxy as the listener target', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest)
    vi.stubGlobal('window', { XMLHttpRequest: FakeXMLHttpRequest, eval })
    const { default: CustomXHR, initInterceptorXHRState } = await import('../src/createXHR')
    initInterceptorXHRState({
      value: {
        global_on: false,
        mode: 'interceptor',
        interceptor_matching_content: [],
        redirector_matching_content: [],
      },
    })

    const request = new CustomXHR()
    const observed: Array<{
      type: string
      thisIsProxy: boolean
      targetIsProxy: boolean
    }> = []
    const readystatechangeOrder: string[] = []
    request.onreadystatechange = function (this: XMLHttpRequest, event) {
      readystatechangeOrder.push('property')
      observed.push({
        type: event.type,
        thisIsProxy: this === request,
        targetIsProxy: event.target === request,
      })
    }
    const onLoad: EventListener = function (this: XMLHttpRequest, event) {
      if (event.type === 'readystatechange') readystatechangeOrder.push('listener')
      observed.push({
        type: event.type,
        thisIsProxy: this === request,
        targetIsProxy: event.target === request,
      })
    }
    const onLoadStart: EventListener = onLoad
    const onProgress: EventListener = onLoad
    const onLoadEnd = vi.fn()
    const removedLoadEnd = vi.fn()
    request.addEventListener('loadstart', onLoadStart)
    request.addEventListener('progress', onProgress)
    request.addEventListener('readystatechange', onLoad)
    request.addEventListener('load', onLoad)
    request.addEventListener('loadend', onLoadEnd, { once: true })
    request.addEventListener('loadend', removedLoadEnd)
    request.removeEventListener('loadend', removedLoadEnd)

    request.open('GET', 'https://example.test/api')
    request.send()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(observed).toEqual(
      ['loadstart', 'readystatechange', 'readystatechange', 'progress', 'load'].map((type) => ({
        type,
        thisIsProxy: true,
        targetIsProxy: true,
      }))
    )
    expect(readystatechangeOrder).toEqual(['property', 'listener'])
    expect(onLoadEnd).toHaveBeenCalledOnce()
    expect(removedLoadEnd).not.toHaveBeenCalled()
  })

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

  it('preserves JSON responseType semantics when replacing a legacy XHR response', async () => {
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
          { switch_on: true, match_url: '/api', override: '{"ok":true}', status_code: '201' },
        ],
        redirector_matching_content: [],
      },
    }
    initInterceptorXHRState(state)

    const request = new CustomXHR()
    request.responseType = 'json'
    request.open('GET', 'https://example.test/api')
    request.send()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(request.response).toEqual({ ok: true })
    expect(() => request.responseText).toThrow(
      expect.objectContaining({ name: 'InvalidStateError' })
    )

    state.value.interceptor_matching_content[0].override = 'not valid JSON'
    const invalidJsonRequest = new CustomXHR()
    invalidJsonRequest.responseType = 'json'
    invalidJsonRequest.open('GET', 'https://example.test/api')
    invalidJsonRequest.send()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(invalidJsonRequest.response).toBeNull()
    expect(() => invalidJsonRequest.responseText).toThrow(
      expect.objectContaining({ name: 'InvalidStateError' })
    )
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

  it('does not leak redirect headers when an XHR instance is reused', async () => {
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
            domain: '/first',
            redirect_url: '/target',
            headers: [{ key: 'x-rule', value: 'first' }],
          },
        ],
      },
    })
    const request = new CustomRedirectXHR()

    request.open('GET', 'https://example.test/first')
    request.setRequestHeader('x-rule', 'suppressed')
    request.send('first body')
    request.open('GET', 'https://example.test/second')
    request.setRequestHeader('x-rule', 'second')
    request.send('second body')

    expect(request.responseURL).toBe('https://example.test/second')
    expect(request.requestHeaders).toEqual({ 'x-rule': ['second'] })
    expect(request.sentBody).toBe('second body')
    expect(request.calls).toEqual([
      'open',
      'header:x-rule',
      'send',
      'open',
      'header:x-rule',
      'send',
    ])
  })

  it('resets interceptor override and hit notification state when an XHR instance is reused', async () => {
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
          { switch_on: true, match_url: '/api', override: 'intercepted', status_code: '201' },
        ],
        redirector_matching_content: [],
      },
    }
    initInterceptorXHRState(state)
    const request = new CustomXHR()
    const observedResponses: string[] = []
    request.onreadystatechange = () => {
      if (request.readyState === 4) observedResponses.push(request.responseText)
    }
    const waitFor = async (length: number) => {
      while (observedResponses.length < length) await Promise.resolve()
    }

    request.open('GET', 'https://example.test/api/first')
    request.send('first request')
    await waitFor(1)
    state.value.global_on = false
    request.open('GET', 'https://example.test/api/second')
    request.send('second request')
    await waitFor(2)

    expect(observedResponses).toEqual(['intercepted', 'second request'])
    expect(dispatchEvent).toHaveBeenCalledOnce()

    state.value.global_on = true
    request.open('GET', 'https://example.test/api/third')
    request.send('third request')
    await waitFor(3)

    expect(observedResponses).toEqual(['intercepted', 'second request', 'intercepted'])
    expect(dispatchEvent).toHaveBeenCalledTimes(2)
  })

  it('keeps the native XHR response and skips hit notification when a response function throws', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest)
    const dispatchEvent = vi.fn()
    vi.stubGlobal('window', {
      XMLHttpRequest: FakeXMLHttpRequest,
      dispatchEvent,
      eval,
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { default: CustomXHR, initInterceptorXHRState } = await import('../src/createXHR')
    initInterceptorXHRState({
      value: {
        global_on: true,
        mode: 'interceptor',
        interceptor_matching_content: [
          {
            switch_on: true,
            match_url: '/api',
            override_type: 'function',
            override_func: 'function() { throw new Error("failure") }',
          },
        ],
        redirector_matching_content: [],
      },
    })
    const request = new CustomXHR()
    const complete = new Promise<void>((resolve) => {
      request.onreadystatechange = () => {
        if (request.readyState === 4) resolve()
      }
    })

    request.open('GET', 'https://example.test/api')
    request.send('native response')
    await complete

    expect(request.responseText).toBe('native response')
    expect(request.status).toBe(200)
    expect(dispatchEvent).not.toHaveBeenCalled()
  })

  it('uses the original URL when a synchronous redirect function throws', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest)
    vi.stubGlobal('window', { XMLHttpRequest: FakeXMLHttpRequest, eval })
    vi.spyOn(console, 'error').mockImplementation(() => {})
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
            method: 'GET',
            redirect_type: 'function',
            redirect_func: 'function() { throw new Error("failure") }',
          },
        ],
      },
    })
    const request = new CustomRedirectXHR()

    request.open('GET', 'https://example.test/api')

    expect(request.responseURL).toBe('https://example.test/api')
  })
})
