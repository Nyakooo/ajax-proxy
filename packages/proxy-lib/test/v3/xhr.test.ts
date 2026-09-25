import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JsonValue, V3Rule } from '@proxy/v3-domain'
import { createV3XHR } from '../../src/v3/xhr'
import type { V3XHRConstructor } from '../../src/v3/xhr'

afterEach(() => vi.restoreAllMocks())

class FakeXHR extends EventTarget {
  readyState = 0
  responseType: XMLHttpRequestResponseType = ''
  status = 200
  statusText = 'OK'
  response: unknown = ''
  responseText = ''
  openArgs: unknown[] = []
  requestHeaders: Array<[string, string]> = []
  sentBody: Document | XMLHttpRequestBodyInit | null | undefined

  constructor() {
    super()
  }

  open = vi.fn((...args: unknown[]) => {
    this.openArgs = args
    this.readyState = 1
  })
  setRequestHeader = vi.fn((name: string, value: string) => {
    this.requestHeaders.push([name, value])
  })
  send = vi.fn((body?: Document | XMLHttpRequestBodyInit | null) => {
    this.sentBody = body
  })

  complete(body: string) {
    this.readyState = 4
    this.responseText = body
    this.response = body
    this.dispatchEvent(new Event('loadend'))
  }
}

function rule(id: string, options: Partial<V3Rule> = {}): V3Rule {
  return {
    id,
    enabled: true,
    match: { url: '/api', method: 'POST' },
    request: { enabled: false, redirect: { url: 'https://unused.test/' } },
    response: { enabled: false, replace: {} },
    ...options,
  }
}

function makeXHR(
  rules: readonly V3Rule[],
  onMatched?: (rule: V3Rule, index: number, request: { url: string; method: string }) => void
) {
  const Constructor = createV3XHR(FakeXHR as unknown as V3XHRConstructor, {
    getRules: () => rules,
    onMatched,
  })
  return new Constructor() as unknown as XMLHttpRequest & FakeXHR
}

describe('createV3XHR', () => {
  it('preserves synchronous open arguments without applying rules', () => {
    const xhr = makeXHR([
      rule('sync', {
        request: { enabled: true, redirect: { url: 'https://target.test/' } },
      }),
    ])

    xhr.open('POST', '/api', false, 'user', 'pass')

    expect(xhr.openArgs).toEqual(['POST', '/api', false, 'user', 'pass'])
  })

  it('selects once against the original URL, redirects statically, and retains that rule for response replacement', () => {
    const selectedRule = rule('first', {
      request: { enabled: true, redirect: { url: 'https://target.test/api' } },
      response: { enabled: true, replace: { status: 201, body: { from: 'first' } } },
    })
    const laterRule = rule('later', {
      response: { enabled: true, replace: { body: { from: 'later' } } },
    })
    const onMatched = vi.fn()
    const xhr = makeXHR([selectedRule, laterRule], onMatched)

    xhr.open('POST', 'https://example.test/api/items', true, 'alice', 'secret')
    xhr.complete('native response')

    expect(xhr.openArgs).toEqual(['POST', 'https://target.test/api', true, 'alice', 'secret'])
    expect(onMatched).toHaveBeenCalledExactlyOnceWith(selectedRule, 0, {
      url: 'https://example.test/api/items',
      method: 'POST',
    })
    expect(xhr.status).toBe(201)
    expect(xhr.responseText).toBe('{"from":"first"}')
    // Native events and response headers are intentionally not synthesized or rewritten.
  })

  it('passes request headers and body through native XHR methods', () => {
    const xhr = makeXHR([
      rule('redirect', {
        request: { enabled: true, redirect: { url: 'https://target.test/post' } },
      }),
    ])
    const body = new Blob(['payload'])

    xhr.open('POST', 'https://example.test/api', true)
    xhr.setRequestHeader('x-test', 'value')
    xhr.setRequestHeader('Authorization', 'Bearer secret')
    xhr.setRequestHeader('Cookie', 'session=secret')
    xhr.send(body)

    expect(xhr.requestHeaders).toEqual([['x-test', 'value']])
    expect(xhr.sentBody).toBe(body)
  })

  it('forwards event listener this, target and currentTarget to the public proxy', () => {
    const xhr = makeXHR([
      rule('response', { response: { enabled: true, replace: { body: 'mock' } } }),
    ])
    const seen: Array<{
      thisIsProxy: boolean
      targetIsProxy: boolean
      currentTargetIsProxy: boolean
    }> = []
    const listener: EventListener = function (this: XMLHttpRequest, event) {
      seen.push({
        thisIsProxy: this === xhr,
        targetIsProxy: event.target === xhr,
        currentTargetIsProxy: event.currentTarget === xhr,
      })
    }
    const removedListener = vi.fn()
    xhr.addEventListener('loadend', listener, { once: true })
    xhr.addEventListener('loadend', removedListener)
    xhr.removeEventListener('loadend', removedListener)

    xhr.open('POST', 'https://example.test/api', true)
    xhr.complete('network response')
    xhr.open('POST', 'https://example.test/api', true)
    xhr.complete('network response')

    expect(seen).toEqual([{ thisIsProxy: true, targetIsProxy: true, currentTargetIsProxy: true }])
    expect(removedListener).not.toHaveBeenCalled()
  })

  it('supports JSON responseType and fails open for unsupported types or malformed JSON replacement', () => {
    const selectedRule = rule('json', {
      response: { enabled: true, replace: { body: { answer: 42 } } },
    })
    const jsonXhr = makeXHR([selectedRule])
    jsonXhr.responseType = 'json'
    jsonXhr.open('POST', 'https://example.test/api', true)
    jsonXhr.complete('{"native":true}')
    expect(jsonXhr.response).toEqual({ answer: 42 })

    const blobXhr = makeXHR([selectedRule])
    blobXhr.responseType = 'blob'
    blobXhr.open('POST', 'https://example.test/api', true)
    blobXhr.complete('native blob marker')
    expect(blobXhr.response).toBe('native blob marker')

    const malformed = makeXHR([
      rule('bad-json', {
        response: {
          enabled: true,
          replace: { body: { toJSON: () => undefined } as unknown as JsonValue },
        },
      }),
    ])
    malformed.responseType = 'json'
    malformed.open('POST', 'https://example.test/api', true)
    malformed.complete('{"native":true}')
    expect(malformed.response).toBe('{"native":true}')
  })

  it('fails open when a response action requests header changes that XHR cannot expose', () => {
    const selectedRule = rule('headers', {
      response: {
        enabled: true,
        replace: { status: 201, headers: { 'x-replacement': 'value' }, body: 'replacement' },
      },
    })
    const xhr = makeXHR([selectedRule])
    xhr.open('POST', 'https://example.test/api', true)
    xhr.complete('native response')

    expect(xhr.status).toBe(200)
    expect(xhr.responseText).toBe('native response')
  })

  it('fails open for non-HTTP redirect targets and resets selection on repeated open', () => {
    const selectedRule = rule('unsafe', {
      request: { enabled: true, redirect: { url: 'javascript:alert(1)' } },
      response: { enabled: true, replace: { body: 'first response' } },
    })
    const onMatched = vi.fn()
    const xhr = makeXHR([selectedRule], onMatched)
    xhr.open('POST', 'https://example.test/api', true)
    expect(xhr.openArgs[1]).toBe('https://example.test/api')

    xhr.complete('original one')
    expect(xhr.responseText).toBe('"first response"')

    xhr.open('GET', 'https://example.test/other', true)
    xhr.complete('original two')
    expect(xhr.responseText).toBe('original two')
    expect(onMatched).toHaveBeenCalledOnce()
  })
})
