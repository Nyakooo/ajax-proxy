import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JsonValue, V3Rule } from '@proxy/v3-domain'
import { createV3XHR } from '../../src/v3/xhr'
import type { V3XHRConstructor } from '../../src/v3/xhr'
import type { V3RuntimeHostOptions } from '../../src/v3/runtimeOptions'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  FakeXHR.failRedirectOpenTarget = false
  FakeXHR.sendFailure = undefined
  FakeXHR.sendCalls = 0
})

class FakeXHR extends EventTarget {
  static failRedirectOpenTarget = false
  static sendFailure: Error | undefined
  static sendCalls = 0
  readyState = 0
  responseType: XMLHttpRequestResponseType = ''
  status = 200
  statusText = 'OK'
  response: unknown = ''
  timeout = 0
  responseText = ''
  onreadystatechange: ((this: XMLHttpRequest, event: Event) => unknown) | null = null
  onload: ((this: XMLHttpRequest, event: Event) => unknown) | null = null
  onerror: ((this: XMLHttpRequest, event: Event) => unknown) | null = null
  openArgs: unknown[] = []
  requestHeaders: Array<[string, string]> = []
  sentBody: Document | XMLHttpRequestBodyInit | null | undefined

  constructor() {
    super()
  }

  open = vi.fn((...args: unknown[]) => {
    if (FakeXHR.failRedirectOpenTarget && args[1] === 'https://target.test/api') {
      throw new Error('native open failed')
    }
    this.openArgs = args
    this.requestHeaders = []
    this.readyState = 1
  })
  setRequestHeader = vi.fn((name: string, value: string) => {
    this.requestHeaders.push([name, value])
  })
  send = vi.fn((body?: Document | XMLHttpRequestBodyInit | null) => {
    FakeXHR.sendCalls += 1
    if (FakeXHR.sendFailure) throw FakeXHR.sendFailure
    this.sentBody = body
  })
  abort = vi.fn()

  complete(body: string) {
    this.readyState = 2
    this.dispatchEvent(new Event('readystatechange'))
    this.readyState = 3
    this.dispatchEvent(new Event('readystatechange'))
    this.readyState = 4
    this.responseText = body
    this.response = body
    this.dispatchEvent(new Event('readystatechange'))
    this.dispatchEvent(new Event('progress'))
    this.dispatchEvent(new Event('load'))
    this.dispatchEvent(new Event('loadend'))
  }

  fail(type: 'abort' | 'error' | 'timeout' = 'error') {
    this.readyState = 4
    this.status = 0
    this.statusText = ''
    this.responseText = ''
    this.response = ''
    this.dispatchEvent(new Event('readystatechange'))
    this.dispatchEvent(new Event(type))
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
  onMatched?: V3RuntimeHostOptions['onMatched'],
  onNoMatch?: (request: { url: string; method: string }) => void,
  onXHROutcome?: V3RuntimeHostOptions['onXHROutcome'],
  armed = false,
  executeRedirectFunction?: V3RuntimeHostOptions['executeRedirectFunction']
) {
  const Constructor = createV3XHR(FakeXHR as unknown as V3XHRConstructor, {
    getRules: () => rules,
    onMatched,
    onNoMatch,
    onXHROutcome,
    isFetchOutcomeDiagnosticsArmed: () => armed,
    executeRedirectFunction,
  })
  return new Constructor() as unknown as XMLHttpRequest & FakeXHR
}

describe('createV3XHR', () => {
  it('keeps the original XHR when capture expansion exceeds the URL limit', () => {
    const original = 'https://example.test/' + 'a'.repeat(33000)
    const xhr = makeXHR([
      rule('oversized-capture', {
        match: { type: 'regex', url: '^https://example\\.test/(.*)$' },
        request: { enabled: true, redirect: { url: 'https://target.test/$1$1' } },
      }),
    ])
    xhr.open('GET', original)
    expect(xhr.openArgs[1]).toBe(original)
  })

  it('expands issue #59 regex captures and preserves the query in static redirects', () => {
    const original = 'https://www.jingxuesiyingyu.com/api/user/list?page=1'
    const selected = rule('issue59', {
      match: { type: 'regex', url: '^https://www\\.jingxuesiyingyu\\.com/api/(.*)' },
      request: { enabled: true, redirect: { url: 'https://api.prod.com/$1' } },
    })
    const xhr = makeXHR([selected])
    xhr.open('GET', original)
    expect(xhr.openArgs[1]).toBe('https://api.prod.com/user/list?page=1')
  })

  it('returns asynchronous mock JSON without calling native send and exposes status and headers', async () => {
    vi.useFakeTimers()
    const selected = rule('xhr-mock', {
      request: { enabled: true, redirect: { url: 'https://redirect.test/api' } },
      response: {
        enabled: true,
        mode: 'mock',
        replace: { status: 201, headers: { 'X-Mock': 'yes' }, body: { ok: true } },
      },
    })
    const onMatched = vi.fn()
    const xhr = makeXHR([selected], onMatched)
    xhr.responseType = 'json'
    const seen: string[] = []
    xhr.addEventListener('readystatechange', () => seen.push(`rs${xhr.readyState}`))
    xhr.addEventListener('loadstart', () => seen.push('loadstart'))
    xhr.addEventListener('progress', () => seen.push('progress'))
    xhr.addEventListener('load', () => seen.push('load'))
    xhr.addEventListener('loadend', () => seen.push('loadend'))

    xhr.open('POST', 'https://example.test/api', true)
    expect(xhr.readyState).toBe(1)
    expect(xhr.openArgs).toEqual(['POST', 'https://example.test/api', true])
    expect(onMatched).toHaveBeenCalledExactlyOnceWith(
      selected,
      0,
      {
        url: 'https://example.test/api',
        method: 'POST',
      },
      { responseMode: 'mock', status: 201, networkSkipped: true }
    )
    xhr.send()
    expect(FakeXHR.sendCalls).toBe(0)
    expect(seen).toEqual(['loadstart'])

    await vi.runAllTimersAsync()

    expect(seen).toEqual(['loadstart', 'rs2', 'rs3', 'rs4', 'progress', 'load', 'loadend'])
    expect(xhr.status).toBe(201)
    expect(xhr.statusText).toBe('Created')
    expect(xhr.response).toEqual({ ok: true })
    expect(xhr.getResponseHeader('x-MOCK')).toBe('yes')
    expect(xhr.getResponseHeader('content-type')).toBe('application/json')
    expect(xhr.getAllResponseHeaders()).toContain('X-Mock: yes\r\n')
  })

  it('covers mock response metadata, duplicate headers, and sends only once', async () => {
    vi.useFakeTimers()
    const xhr = makeXHR([
      rule('xhr-mock-metadata', {
        response: {
          enabled: true,
          mode: 'mock',
          replace: {
            status: 299,
            headers: { 'X-Repeat': 'first', 'x-repeat': 'second', 'Content-Type': 'text/plain' },
            body: 'payload',
          },
        },
      }),
    ])
    xhr.open('POST', 'https://example.test/api', true)

    expect(xhr.readyState).toBe(1)
    expect(xhr.status).toBe(0)
    expect(xhr.statusText).toBe('')
    expect(xhr.responseURL).toBe('')
    expect(xhr.response).toBeNull()
    expect(xhr.responseText).toBe('')
    expect(xhr.getResponseHeader('x-repeat')).toBeNull()
    expect(xhr.getAllResponseHeaders()).toBe('')
    expect(() => xhr.send()).not.toThrow()
    expect(() => xhr.send()).toThrowError(expect.objectContaining({ name: 'InvalidStateError' }))

    await vi.runAllTimersAsync()

    expect(xhr.status).toBe(299)
    expect(xhr.statusText).toBe('')
    expect(xhr.responseURL).toBe('https://example.test/api')
    expect(xhr.response).toBe('"payload"')
    expect(xhr.responseText).toBe('"payload"')
    expect(xhr.getResponseHeader('x-repeat')).toBe('first, second')
    expect(xhr.getResponseHeader('missing')).toBeNull()
    expect(xhr.getAllResponseHeaders()).toContain('X-Repeat: first, second\r\n')
    expect(xhr.getAllResponseHeaders()).toContain('Content-Type: text/plain\r\n')
    expect(FakeXHR.sendCalls).toBe(0)
  })

  it.each([
    ['', ''],
    ['json', null],
    ['arraybuffer', 0],
    ['blob', 0],
    ['document', null],
  ] as const)(
    'returns the right empty mock value for responseType %s',
    async (responseType, expected) => {
      vi.useFakeTimers()
      const xhr = makeXHR([
        rule(`xhr-empty-value-${responseType || 'default'}`, {
          response: { enabled: true, mode: 'mock', replace: {} },
        }),
      ])
      xhr.open('POST', 'https://example.test/api', true)
      xhr.responseType = responseType
      xhr.send()
      await vi.runAllTimersAsync()

      if (responseType === 'arraybuffer') {
        expect((xhr.response as ArrayBuffer).byteLength).toBe(expected)
      } else if (responseType === 'blob') {
        expect((xhr.response as Blob).size).toBe(expected)
      } else {
        expect(xhr.response).toBe(expected)
      }
    }
  )

  it('creates mock blobs and documents with supported content types', async () => {
    vi.useFakeTimers()
    const blobXhr = makeXHR([
      rule('xhr-mock-blob', {
        response: {
          enabled: true,
          mode: 'mock',
          replace: { body: 'blob body', headers: { 'content-type': 'text/plain; charset=utf-8' } },
        },
      }),
    ])
    blobXhr.open('POST', 'https://example.test/api', true)
    blobXhr.responseType = 'blob'
    blobXhr.send()
    await vi.runAllTimersAsync()
    expect(blobXhr.response).toBeInstanceOf(Blob)
    expect((blobXhr.response as Blob).type).toBe('text/plain; charset=utf-8')

    class ParserStub {
      parseFromString = vi.fn((body: string, type: DOMParserSupportedType) => ({ body, type }))
    }
    vi.stubGlobal('DOMParser', ParserStub)
    try {
      const documentXhr = makeXHR([
        rule('xhr-mock-document', {
          response: {
            enabled: true,
            mode: 'mock',
            replace: {
              body: '<p>hello</p>',
              headers: { 'content-type': 'Text/HTML; charset=utf-8' },
            },
          },
        }),
      ])
      documentXhr.open('POST', 'https://example.test/api', true)
      documentXhr.responseType = 'document'
      documentXhr.send()
      await vi.runAllTimersAsync()
      expect(documentXhr.response).toEqual({ body: '"<p>hello</p>"', type: 'text/html' })

      const unsupportedDocument = makeXHR([
        rule('xhr-mock-document-unsupported', {
          response: {
            enabled: true,
            mode: 'mock',
            replace: { body: 'body', headers: { 'content-type': 'application/octet-stream' } },
          },
        }),
      ])
      unsupportedDocument.open('POST', 'https://example.test/api', true)
      unsupportedDocument.responseType = 'document'
      unsupportedDocument.send()
      await vi.runAllTimersAsync()
      expect(unsupportedDocument.response).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('leaves native requests in place when mock configuration is invalid', () => {
    const invalidStatus = makeXHR([
      rule('xhr-mock-invalid-status', {
        response: { enabled: true, mode: 'mock', replace: { status: 199, body: 'mock' } },
      }),
    ])
    invalidStatus.open('POST', 'https://example.test/api', true)
    invalidStatus.send()
    expect(FakeXHR.sendCalls).toBe(1)

    const unsupportedType = makeXHR([
      rule('xhr-mock-unsupported-type', {
        response: { enabled: true, mode: 'mock', replace: { body: 'mock' } },
      }),
    ])
    unsupportedType.responseType = 'ms-stream' as XMLHttpRequestResponseType
    unsupportedType.open('POST', 'https://example.test/api', true)
    unsupportedType.send()
    expect(FakeXHR.sendCalls).toBe(2)

    const throwingBody = {
      toJSON() {
        throw new Error('cannot serialize mock')
      },
    }
    const unserializable = makeXHR([
      rule('xhr-mock-throwing-body', {
        response: { enabled: true, mode: 'mock', replace: { body: throwingBody as never } },
      }),
    ])
    unserializable.open('POST', 'https://example.test/api', true)
    unserializable.send()
    expect(FakeXHR.sendCalls).toBe(3)
  })

  it('forwards abort to native XHR outside an active mock request', async () => {
    const xhr = makeXHR([])
    const nativeAbort = vi.spyOn(xhr, 'abort')
    xhr.abort()
    expect(nativeAbort).toHaveBeenCalledOnce()
  })

  it('reports a skipped-network outcome after Mock completion only while armed', async () => {
    vi.useFakeTimers()
    const selected = rule('xhr-mock-outcome', {
      response: { enabled: true, mode: 'mock', replace: { status: 202, body: { ok: true } } },
    })
    const onXHROutcome = vi.fn()
    const xhr = makeXHR([selected], undefined, undefined, onXHROutcome, true)
    xhr.open('POST', 'https://example.test/api', true)
    xhr.send()
    await vi.runAllTimersAsync()

    expect(onXHROutcome).toHaveBeenCalledExactlyOnceWith(
      selected,
      expect.stringMatching(/^v3-xhr-/),
      'request',
      'applied',
      'mock-network-skipped'
    )

    const disarmedOutcome = vi.fn()
    const disarmed = makeXHR([selected], undefined, undefined, disarmedOutcome, false)
    disarmed.open('POST', 'https://example.test/api', true)
    disarmed.send()
    await vi.runAllTimersAsync()
    expect(disarmedOutcome).not.toHaveBeenCalled()
  })

  it('emits abort and timeout events asynchronously and never sends the native request', async () => {
    vi.useFakeTimers()
    const xhr = makeXHR([
      rule('xhr-mock-cancel', {
        response: { enabled: true, mode: 'mock', replace: { body: { ok: true } } },
      }),
    ])
    const seen: string[] = []
    xhr.addEventListener('readystatechange', () => seen.push(`rs${xhr.readyState}`))
    xhr.addEventListener('abort', () => seen.push('abort'))
    xhr.addEventListener('timeout', () => seen.push('timeout'))
    xhr.addEventListener('loadend', () => seen.push('loadend'))

    xhr.open('POST', 'https://example.test/api', true)
    xhr.send()
    xhr.abort()
    expect(seen).toEqual(['rs4', 'abort', 'loadend'])
    expect(xhr.status).toBe(0)
    await vi.runAllTimersAsync()
    expect(seen).toEqual(['rs4', 'abort', 'loadend'])

    xhr.open('POST', 'https://example.test/api', true)
    xhr.timeout = 2
    xhr.send()
    await vi.advanceTimersByTimeAsync(2)
    expect(seen.slice(-3)).toEqual(['rs4', 'timeout', 'loadend'])
    expect(xhr.status).toBe(0)
    expect(FakeXHR.sendCalls).toBe(0)
  })

  it('honors responseType configured after open', async () => {
    vi.useFakeTimers()
    const xhr = makeXHR([
      rule('xhr-mock-arraybuffer', {
        response: { enabled: true, mode: 'mock', replace: { body: 'data' } },
      }),
    ])
    xhr.open('POST', 'https://example.test/api', true)
    xhr.responseType = 'arraybuffer'
    xhr.send()
    await vi.runAllTimersAsync()

    expect(Array.from(new Uint8Array(xhr.response as ArrayBuffer))).toEqual([
      34, 100, 97, 116, 97, 34,
    ])
    expect(() => xhr.responseText).toThrowError(DOMException)
  })

  it.each([
    ['HEAD', 200],
    ['GET', 204],
    ['GET', 205],
    ['GET', 304],
  ] as const)('returns an empty mock body for %s status %s', async (method, status) => {
    vi.useFakeTimers()
    const xhr = makeXHR([
      rule(`xhr-mock-empty-${method}-${status}`, {
        match: { url: '/api', method },
        response: {
          enabled: true,
          mode: 'mock',
          replace: { status, body: { mustNotAppear: true } },
        },
      }),
    ])
    xhr.open(method, 'https://example.test/api', true)
    xhr.send()
    await vi.runAllTimersAsync()

    expect(xhr.status).toBe(status)
    expect(xhr.responseText).toBe('')
    expect(FakeXHR.sendCalls).toBe(0)
  })

  it('fails open without claiming mock success for unsupported response code and preserves native errors', () => {
    const selected = rule('xhr-mock-error', {
      response: {
        enabled: true,
        mode: 'mock',
        replace: { code: 'return { body: { ok: true } }' },
      },
    })
    const onMatched = vi.fn()
    const xhr = makeXHR([selected], onMatched)
    xhr.responseType = 'json'
    const onError = vi.fn()
    xhr.onerror = onError
    xhr.open('POST', 'https://example.test/api', true)
    xhr.send()
    xhr.fail('error')

    expect(onMatched).toHaveBeenCalledExactlyOnceWith(selected, 0, {
      url: 'https://example.test/api',
      method: 'POST',
    })
    expect(xhr.sentBody).toBeUndefined()
    expect(FakeXHR.sendCalls).toBe(1)
    expect(onError).toHaveBeenCalledOnce()
    expect(xhr.status).toBe(0)
    expect(xhr.response).toBe('')
  })

  it('overrides caller headers on static redirects and strips sensitive headers cross-origin', () => {
    const selectedRule = rule('static-redirect-headers', {
      request: {
        enabled: true,
        redirect: {
          url: 'https://target.test/api',
          headers: {
            'X-Override': 'configured',
            'X-Empty': '',
            authorization: 'configured-auth',
            'proxy-authorization': 'configured-proxy-auth',
            cookie: 'configured-cookie',
            cookie2: 'configured-cookie2',
          },
        },
      },
    })
    const xhr = makeXHR([selectedRule])

    xhr.open('POST', 'https://example.test/api', true)
    xhr.setRequestHeader('x-override', 'page-value')
    xhr.setRequestHeader('x-empty', 'page-value')
    xhr.setRequestHeader('X-Page', 'preserved')
    xhr.setRequestHeader('Authorization', 'page-auth')
    xhr.send()

    expect(xhr.openArgs).toEqual(['POST', 'https://target.test/api', true])
    expect(xhr.requestHeaders).toEqual([
      ['X-Page', 'preserved'],
      ['X-Override', 'configured'],
      ['X-Empty', ''],
    ])
  })

  it('keeps configured sensitive headers on same-origin redirects and resets them on open reuse', () => {
    const selectedRule = rule('same-origin-static-redirect-headers', {
      match: { url: '/api', method: 'POST' },
      request: {
        enabled: true,
        redirect: {
          url: 'https://example.test/redirected',
          headers: { authorization: 'configured-auth', cookie: '' },
        },
      },
    })
    const xhr = makeXHR([selectedRule])

    xhr.open('POST', 'https://example.test/api', true)
    xhr.setRequestHeader('Authorization', 'page-auth')
    xhr.send()
    expect(xhr.requestHeaders).toEqual([
      ['authorization', 'configured-auth'],
      ['cookie', ''],
    ])

    xhr.open('POST', 'https://example.test/elsewhere', true)
    xhr.setRequestHeader('Authorization', 'page-auth')
    xhr.send()
    expect(xhr.openArgs).toEqual(['POST', 'https://example.test/elsewhere', true])
    expect(xhr.requestHeaders).toEqual([['Authorization', 'page-auth']])
  })

  it('preserves synchronous open arguments without applying rules', () => {
    const onNoMatch = vi.fn()
    const xhr = makeXHR(
      [
        rule('sync', {
          request: { enabled: true, redirect: { url: 'https://target.test/' } },
        }),
      ],
      undefined,
      onNoMatch
    )

    xhr.open('POST', '/api', false, 'user', 'pass')

    expect(xhr.openArgs).toEqual(['POST', '/api', false, 'user', 'pass'])
    expect(onNoMatch).not.toHaveBeenCalled()
  })

  it('keeps dynamic redirects on the original XHR URL and still applies the response action', () => {
    const onXHROutcome = vi.fn()
    const executeRedirectFunction = vi.fn(async () => 'https://target.test/dynamic')
    const selectedRule = rule('dynamic-redirect-xhr', {
      request: {
        enabled: true,
        redirect: { type: 'function', code: 'return request.url' },
      },
      response: { enabled: true, replace: { body: { fallback: 'response' } } },
    })
    const xhr = makeXHR(
      [selectedRule],
      undefined,
      undefined,
      onXHROutcome,
      true,
      executeRedirectFunction
    )
    xhr.open('POST', 'https://example.test/api', true)
    expect(xhr.openArgs).toEqual(['POST', 'https://example.test/api', true])
    expect(executeRedirectFunction).not.toHaveBeenCalled()

    xhr.send()
    xhr.complete('native response')

    expect(xhr.responseText).toBe('{"fallback":"response"}')
    expect(onXHROutcome.mock.calls.map((call) => call.slice(2))).toEqual([
      ['request', 'fallback', 'redirect-target-unsupported'],
      ['response', 'applied', 'response-replacement-applied'],
    ])
  })

  it('resolves relative request URLs against the page location', () => {
    vi.stubGlobal('location', { href: 'https://example.test/page' })
    try {
      const onMatched = vi.fn()
      const xhr = makeXHR(
        [
          rule('page-relative', {
            match: { url: 'https://example.test/api', method: 'POST' },
            response: { enabled: true, replace: { body: 'replacement' } },
          }),
        ],
        onMatched
      )

      xhr.open('POST', '/api', true)

      expect(onMatched).toHaveBeenCalledOnce()
      expect(xhr.openArgs).toEqual(['POST', '/api', true])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('fails open with the original open arguments when rule selection throws', () => {
    const Constructor = createV3XHR(FakeXHR as unknown as V3XHRConstructor, {
      getRules: () => {
        throw new Error('configuration unavailable')
      },
    })
    const xhr = new Constructor() as unknown as XMLHttpRequest & FakeXHR

    xhr.open('POST', 'https://example.test/api', true, 'user', 'pass')

    expect(xhr.openArgs).toEqual(['POST', 'https://example.test/api', true, 'user', 'pass'])
  })

  it('reports only unmatched asynchronous opens without changing XHR open arguments', () => {
    const onNoMatch = vi.fn()
    const xhr = makeXHR([rule('other', { match: { url: '/else' } })], undefined, onNoMatch)

    xhr.open('GET', 'https://example.test/api?private=value', true)

    expect(xhr.openArgs).toEqual(['GET', 'https://example.test/api?private=value', true])
    expect(onNoMatch).toHaveBeenCalledExactlyOnceWith({
      url: 'https://example.test/api?private=value',
      method: 'GET',
    })
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

    expect(xhr.openArgs).toEqual(['POST', 'https://target.test/api', true, null, null])
    expect(onMatched).toHaveBeenCalledExactlyOnceWith(selectedRule, 0, {
      url: 'https://example.test/api/items',
      method: 'POST',
    })
    expect(xhr.status).toBe(201)
    expect(xhr.responseText).toBe('{"from":"first"}')
    // Native events and response headers are intentionally not synthesized or rewritten.
  })

  it('skips an excluded redirect and applies the next eligible XHR rule', () => {
    const excludedRule = rule('excluded', {
      request: {
        enabled: true,
        redirect: { url: 'https://wrong.test/', exclusions: ['skip=1'] },
      },
    })
    const nextRule = rule('next', {
      request: { enabled: true, redirect: { url: 'https://target.test/next' } },
    })
    const onMatched = vi.fn()
    const xhr = makeXHR([excludedRule, nextRule], onMatched)

    xhr.open('POST', 'https://example.test/api?skip=1', true)

    expect(xhr.openArgs).toEqual(['POST', 'https://target.test/next', true])
    expect(onMatched).toHaveBeenCalledExactlyOnceWith(nextRule, 1, {
      url: 'https://example.test/api?skip=1',
      method: 'POST',
    })
  })

  it('keeps an excluded composite XHR request native and applies its response action', () => {
    const compositeRule = rule('excluded-composite', {
      request: {
        enabled: true,
        redirect: { url: 'https://wrong.test/', exclusions: ['/health'] },
      },
      response: { enabled: true, replace: { status: 202, body: { source: 'response' } } },
    })
    const onMatched = vi.fn()
    const xhr = makeXHR([compositeRule], onMatched)

    xhr.open('POST', 'https://example.test/api/health', true)
    xhr.complete('native response')

    expect(xhr.openArgs).toEqual(['POST', 'https://example.test/api/health', true])
    expect(onMatched).toHaveBeenCalledExactlyOnceWith(compositeRule, 0, {
      url: 'https://example.test/api/health',
      method: 'POST',
    })
    expect(xhr.status).toBe(202)
    expect(xhr.responseText).toBe('{"source":"response"}')
  })

  it('reports no match and keeps native XHR arguments when every matching redirect is excluded', () => {
    const excludedRule = rule('only-excluded', {
      request: {
        enabled: true,
        redirect: { url: 'https://wrong.test/', exclusions: ['skip=1'] },
      },
    })
    const onMatched = vi.fn()
    const onNoMatch = vi.fn()
    const xhr = makeXHR([excludedRule], onMatched, onNoMatch)
    const url = 'https://example.test/api?skip=1'

    xhr.open('POST', url, true, 'user', 'pass')

    expect(xhr.openArgs).toEqual(['POST', url, true, 'user', 'pass'])
    expect(onMatched).not.toHaveBeenCalled()
    expect(onNoMatch).toHaveBeenCalledExactlyOnceWith({ url, method: 'POST' })
  })

  it('keeps the native request and response when the URL matches but the method does not', () => {
    const selectedRule = rule('post-only', {
      response: { enabled: true, replace: { status: 201, body: { mocked: true } } },
    })
    const onMatched = vi.fn()
    const onNoMatch = vi.fn()
    const xhr = makeXHR([selectedRule], onMatched, onNoMatch)

    xhr.open('GET', 'https://example.test/api/items', true)
    xhr.complete('native response')

    expect(xhr.openArgs).toEqual(['GET', 'https://example.test/api/items', true])
    expect(xhr.status).toBe(200)
    expect(xhr.responseText).toBe('native response')
    expect(onMatched).not.toHaveBeenCalled()
    expect(onNoMatch).toHaveBeenCalledExactlyOnceWith({
      url: 'https://example.test/api/items',
      method: 'GET',
    })
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

  it('preserves sensitive request headers when redirecting to another path on the same origin', () => {
    const xhr = makeXHR([
      rule('same-origin-redirect', {
        request: { enabled: true, redirect: { url: 'https://example.test/redirected' } },
      }),
    ])

    xhr.open('POST', 'https://example.test/api', true)
    xhr.setRequestHeader('Authorization', 'Bearer secret')
    xhr.setRequestHeader('Cookie', 'session=secret')
    xhr.setRequestHeader('X-Custom-Request', 'custom-value')

    expect(xhr.openArgs).toEqual(['POST', 'https://example.test/redirected', true])
    expect(xhr.requestHeaders).toEqual([
      ['Authorization', 'Bearer secret'],
      ['Cookie', 'session=secret'],
      ['X-Custom-Request', 'custom-value'],
    ])
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

  it('preserves EventListenerObject binding and wraps event targets with the public proxy', () => {
    const xhr = makeXHR([rule('event-listener-object')])
    const seen: Array<{
      thisIsListener: boolean
      targetIsProxy: boolean
      currentTargetIsProxy: boolean
    }> = []
    const listener: EventListenerObject = {
      handleEvent(event) {
        seen.push({
          thisIsListener: this === listener,
          targetIsProxy: event.target === xhr,
          currentTargetIsProxy: event.currentTarget === xhr,
        })
      },
    }

    xhr.addEventListener('loadend', listener)
    xhr.open('POST', 'https://example.test/api', true)
    xhr.complete('network response')

    expect(seen).toEqual([
      { thisIsListener: true, targetIsProxy: true, currentTargetIsProxy: true },
    ])
  })

  it('keeps event currentTarget native after dispatch and ignores null listeners', () => {
    const nativeAdd = vi.spyOn(FakeXHR.prototype, 'addEventListener')
    const nativeRemove = vi.spyOn(FakeXHR.prototype, 'removeEventListener')
    const xhr = makeXHR([rule('event-lifetime')])
    let capturedEvent: Event | undefined
    const listener: EventListener = (event) => {
      capturedEvent = event
    }

    xhr.addEventListener('loadend', listener)
    xhr.addEventListener('loadend', null)
    xhr.removeEventListener('loadend', null)
    xhr.open('POST', 'https://example.test/api', true)
    xhr.complete('network response')

    expect(capturedEvent?.target).toBe(xhr)
    expect(capturedEvent?.currentTarget).toBeNull()
    expect(nativeAdd.mock.calls.filter(([type]) => type === 'loadend')).toHaveLength(1)
    expect(nativeRemove.mock.calls.filter(([type]) => type === 'loadend')).toHaveLength(0)
  })

  it('maps boolean and object capture options to distinct native listener wrappers', () => {
    const nativeAdd = vi.spyOn(FakeXHR.prototype, 'addEventListener')
    const nativeRemove = vi.spyOn(FakeXHR.prototype, 'removeEventListener')
    const xhr = makeXHR([rule('capture-listener')])
    const listener = () => {}

    xhr.addEventListener('loadend', listener, false)
    xhr.addEventListener('loadend', listener, { capture: true })
    xhr.removeEventListener('loadend', listener, true)

    const wrappedListeners = nativeAdd.mock.calls
      .filter(([type]) => type === 'loadend')
      .map(([, wrappedListener]) => wrappedListener)
    expect(wrappedListeners).toHaveLength(2)
    expect(wrappedListeners[0]).not.toBe(wrappedListeners[1])
    expect(nativeRemove).toHaveBeenCalledExactlyOnceWith('loadend', wrappedListeners[1], true)
  })

  it('applies response replacements before readyState 4 and load handlers observe the response', () => {
    const selectedRule = rule('lifecycle', {
      response: { enabled: true, replace: { status: 201, body: { source: 'mock' } } },
    })
    const xhr = makeXHR([selectedRule])
    const observed: Array<[string, unknown, number]> = []
    xhr.onreadystatechange = function () {
      if (this.readyState === 4) {
        observed.push(['readystatechange', this.responseText, this.status])
      }
    }
    xhr.addEventListener('readystatechange', function (event) {
      if ((event.currentTarget as XMLHttpRequest).readyState === 4) {
        observed.push([
          'readystatechange-listener',
          (event.currentTarget as XMLHttpRequest).responseText,
          (event.currentTarget as XMLHttpRequest).status,
        ])
      }
    })
    xhr.onload = function () {
      observed.push(['load-handler', this.responseText, this.status])
    }
    xhr.addEventListener('load', function (event) {
      const target = event.currentTarget as XMLHttpRequest
      observed.push(['load-listener', target.responseText, target.status])
    })

    xhr.open('POST', 'https://example.test/api', true)
    xhr.complete('native response')

    expect(observed).toEqual([
      ['readystatechange', '{"source":"mock"}', 201],
      ['readystatechange-listener', '{"source":"mock"}', 201],
      ['load-handler', '{"source":"mock"}', 201],
      ['load-listener', '{"source":"mock"}', 201],
    ])
  })

  it('replaces and clears event handler properties without retaining stale callbacks', () => {
    const xhr = makeXHR([])
    const firstHandler = vi.fn()
    const replacementHandler = vi.fn()
    xhr.onload = firstHandler
    xhr.onload = replacementHandler
    expect(xhr.onload).toBe(replacementHandler)

    xhr.open('GET', 'https://example.test/api', true)
    xhr.complete('first response')

    expect(firstHandler).not.toHaveBeenCalled()
    expect(replacementHandler).toHaveBeenCalledOnce()

    xhr.onload = null
    expect(xhr.onload).toBeNull()
    xhr.open('GET', 'https://example.test/api', true)
    xhr.complete('second response')

    expect(firstHandler).not.toHaveBeenCalled()
    expect(replacementHandler).toHaveBeenCalledOnce()
  })

  it.each(['error', 'abort', 'timeout'] as const)(
    'preserves native failure status and response when an XHR request ends with %s',
    (eventType) => {
      const xhr = makeXHR([
        rule('failure', {
          response: { enabled: true, replace: { status: 200, body: { fake: true } } },
        }),
      ])
      const observed: Array<[string, number, string]> = []
      xhr.onreadystatechange = function () {
        if (this.readyState === 4)
          observed.push(['readystatechange', this.status, this.responseText])
      }
      xhr.addEventListener(eventType, function () {
        observed.push([eventType, this.status, this.responseText])
      })

      xhr.open('POST', 'https://example.test/api', true)
      xhr.fail(eventType)

      expect(observed).toEqual([
        ['readystatechange', 0, ''],
        [eventType, 0, ''],
      ])
    }
  )

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

  it('exposes text replacements and fails open when serializing a replacement throws', () => {
    const textXhr = makeXHR([
      rule('text-replacement', {
        response: { enabled: true, replace: { body: 'replacement text' } },
      }),
    ])
    textXhr.open('POST', 'https://example.test/api', true)
    textXhr.complete('native text')
    expect(textXhr.response).toBe('"replacement text"')

    const throwingBody = {
      toJSON() {
        throw new Error('cannot serialize replacement')
      },
    } as unknown as JsonValue
    const failedXhr = makeXHR([
      rule('throwing-replacement', {
        response: { enabled: true, replace: { body: throwingBody } },
      }),
    ])
    failedXhr.open('POST', 'https://example.test/api', true)
    failedXhr.complete('native text')
    expect(failedXhr.response).toBe('native text')
  })

  it('preserves the native responseText error for JSON responseType', () => {
    const selectedRule = rule('json-response-text', {
      response: { enabled: true, replace: { body: { answer: 42 } } },
    })
    const xhr = makeXHR([selectedRule])
    xhr.responseType = 'json'
    xhr.open('POST', 'https://example.test/api', true)
    xhr.complete('{"native":true}')

    expect(() => xhr.responseText).toThrow(expect.objectContaining({ name: 'InvalidStateError' }))
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

  it('fails open when a response action requests unsupported function code', () => {
    const outcome = vi.fn()
    const selectedRule = rule('function-code', {
      response: {
        enabled: true,
        replace: { code: 'return { body: "replacement" }', body: 'ignored' },
      },
    })
    const xhr = makeXHR([selectedRule], undefined, undefined, outcome, true)
    xhr.open('POST', 'https://example.test/api', true)
    xhr.send()
    xhr.complete('native response')

    expect(xhr.status).toBe(200)
    expect(xhr.responseText).toBe('native response')
    expect(outcome.mock.calls.map((call) => call.slice(2))).toEqual([
      ['response', 'unsupported', 'response-replacement-unsupported'],
    ])
  })

  it('fails open and reports failure for an invalid response replacement status', () => {
    const outcome = vi.fn()
    const selectedRule = rule('invalid-status', {
      response: { enabled: true, replace: { status: 199, body: 'ignored' } },
    })
    const xhr = makeXHR([selectedRule], undefined, undefined, outcome, true)
    xhr.open('POST', 'https://example.test/api', true)
    xhr.send()
    xhr.complete('native response')

    expect(xhr.status).toBe(200)
    expect(xhr.responseText).toBe('native response')
    expect(outcome.mock.calls.map((call) => call.slice(2))).toEqual([
      ['response', 'failed', 'response-replacement-failed'],
    ])
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

  it('keeps the native response when an enabled replacement has no overrides', () => {
    const outcome = vi.fn()
    const selectedRule = rule('empty-replacement', {
      response: { enabled: true, replace: {} },
    })
    const xhr = makeXHR([selectedRule], undefined, undefined, outcome, true)
    xhr.open('POST', 'https://example.test/api', true)
    xhr.send()
    xhr.complete('native response')

    expect(xhr.status).toBe(200)
    expect(xhr.responseText).toBe('native response')
    expect(outcome).not.toHaveBeenCalled()
  })

  it('fails open for malformed original URLs and malformed redirect URLs', () => {
    const invalidOriginalUrl = makeXHR([rule('original-url')])
    invalidOriginalUrl.open('POST', 'http://[', true)
    expect(invalidOriginalUrl.openArgs).toEqual(['POST', 'http://[', true])

    const invalidRedirect = makeXHR([
      rule('redirect-url', {
        request: { enabled: true, redirect: { url: 'http://[' } },
      }),
    ])
    invalidRedirect.open('POST', 'https://example.test/api', true)
    expect(invalidRedirect.openArgs).toEqual(['POST', 'https://example.test/api', true])
  })

  it('reports redirected async XHR only after send and keeps the notice private and opt-in', () => {
    const outcome = vi.fn()
    const selectedRule = rule('redirect', {
      request: { enabled: true, redirect: { url: 'https://target.test/api' } },
    })
    const xhr = makeXHR([selectedRule], undefined, undefined, outcome, true)

    xhr.open('POST', 'https://example.test/api?secret=query', true)
    expect(outcome).not.toHaveBeenCalled()
    expect(xhr.openArgs[1]).toBe('https://target.test/api')

    xhr.send('private body')
    expect(outcome).toHaveBeenCalledExactlyOnceWith(
      selectedRule,
      expect.stringMatching(/^v3-xhr-/),
      'request',
      'applied',
      'redirect-applied'
    )
    expect(JSON.stringify(outcome.mock.calls)).not.toContain('secret')
    expect(JSON.stringify(outcome.mock.calls)).not.toContain('private body')

    const unarmedOutcome = vi.fn()
    const unarmed = makeXHR([selectedRule], undefined, undefined, unarmedOutcome)
    unarmed.open('POST', 'https://example.test/api', true)
    unarmed.send()
    expect(unarmedOutcome).not.toHaveBeenCalled()
  })

  it('does not let XHR outcome reporting errors change native send behavior', () => {
    const selectedRule = rule('redirect', {
      request: { enabled: true, redirect: { url: 'https://target.test/api' } },
    })
    const onXHROutcome = vi.fn(() => {
      throw new Error('diagnostic callback failed')
    })
    const xhr = makeXHR([selectedRule], undefined, undefined, onXHROutcome, true)

    xhr.open('POST', 'https://example.test/api', true)
    expect(() => xhr.send('request body')).not.toThrow()

    expect(xhr.sentBody).toBe('request body')
    expect(onXHROutcome).toHaveBeenCalledOnce()
  })

  it('reports a redirect open fallback after successful send, and preserves synchronous send errors', () => {
    const outcome = vi.fn()
    const selectedRule = rule('redirect', {
      request: { enabled: true, redirect: { url: 'https://target.test/api' } },
    })
    const xhr = makeXHR([selectedRule], undefined, undefined, outcome, true)
    FakeXHR.failRedirectOpenTarget = true

    xhr.open('POST', 'https://example.test/api', true, 'alice', 'secret')
    expect(outcome).not.toHaveBeenCalled()
    expect(xhr.openArgs).toEqual(['POST', 'https://example.test/api', true, 'alice', 'secret'])
    xhr.send()
    expect(outcome.mock.calls[0]?.slice(2)).toEqual(['request', 'fallback', 'redirect-open-failed'])

    const sendError = new Error('native send failed')
    const failedOutcome = vi.fn()
    const failed = makeXHR([selectedRule], undefined, undefined, failedOutcome, true)
    failed.open('POST', 'https://example.test/api', true)
    FakeXHR.sendFailure = sendError
    expect(() => failed.send()).toThrow(sendError)
    expect(failedOutcome.mock.calls[0]?.slice(2)).toEqual(['request', 'failed', 'send-failed'])
  })

  it('preserves a synchronous send error without reporting an absent redirect outcome', () => {
    const outcome = vi.fn()
    const xhr = makeXHR([rule('no-redirect')], undefined, undefined, outcome, true)
    const sendError = new Error('native send failed')
    xhr.open('POST', 'https://example.test/api', true)
    FakeXHR.sendFailure = sendError

    expect(() => xhr.send()).toThrow(sendError)
    expect(outcome).not.toHaveBeenCalled()
  })

  it('reports response replacement only when a completed response getter returns it', () => {
    const outcome = vi.fn()
    const selectedRule = rule('replace', {
      response: { enabled: true, replace: { status: 202, body: { safe: true } } },
    })
    const xhr = makeXHR([selectedRule], undefined, undefined, outcome, true)
    xhr.open('POST', 'https://example.test/api', true)
    expect(outcome).not.toHaveBeenCalled()
    xhr.send()
    expect(outcome).not.toHaveBeenCalled()
    xhr.complete('native response')
    expect(outcome).not.toHaveBeenCalled()

    expect(xhr.status).toBe(202)
    expect(outcome).toHaveBeenCalledOnce()
    expect(outcome.mock.calls[0]?.slice(2)).toEqual([
      'response',
      'applied',
      'response-replacement-applied',
    ])
    expect(xhr.responseText).toBe('{"safe":true}')
    expect(outcome).toHaveBeenCalledOnce()
  })

  it('reports unsupported response actions after completion without reporting absent actions', () => {
    const outcome = vi.fn()
    const selectedRule = rule('unsupported', {
      response: {
        enabled: true,
        replace: { headers: { 'x-replacement': 'value' }, body: 'ignored' },
      },
    })
    const xhr = makeXHR([selectedRule], undefined, undefined, outcome, true)
    xhr.open('POST', 'https://example.test/api', true)
    xhr.send()
    xhr.complete('native response')
    expect(outcome).not.toHaveBeenCalled()
    expect(xhr.responseText).toBe('native response')
    expect(outcome.mock.calls[0]?.slice(2)).toEqual([
      'response',
      'unsupported',
      'response-replacement-unsupported',
    ])

    const noActionOutcome = vi.fn()
    const noAction = makeXHR([rule('no-action')], undefined, undefined, noActionOutcome, true)
    noAction.open('POST', 'https://example.test/api', true)
    noAction.send()
    noAction.complete('native response')
    void noAction.responseText
    expect(noActionOutcome).not.toHaveBeenCalled()
  })
})
