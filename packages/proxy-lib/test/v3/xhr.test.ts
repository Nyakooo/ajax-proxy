import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JsonValue, V3Rule } from '@proxy/v3-domain'
import { createV3XHR } from '../../src/v3/xhr'
import type { V3XHRConstructor } from '../../src/v3/xhr'
import type { V3RuntimeHostOptions } from '../../src/v3/runtimeOptions'

afterEach(() => {
  vi.restoreAllMocks()
  FakeXHR.failRedirectOpenTarget = false
  FakeXHR.sendFailure = undefined
})

class FakeXHR extends EventTarget {
  static failRedirectOpenTarget = false
  static sendFailure: Error | undefined
  readyState = 0
  responseType: XMLHttpRequestResponseType = ''
  status = 200
  statusText = 'OK'
  response: unknown = ''
  responseText = ''
  onreadystatechange: ((this: XMLHttpRequest, event: Event) => unknown) | null = null
  onload: ((this: XMLHttpRequest, event: Event) => unknown) | null = null
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
    this.readyState = 1
  })
  setRequestHeader = vi.fn((name: string, value: string) => {
    this.requestHeaders.push([name, value])
  })
  send = vi.fn((body?: Document | XMLHttpRequestBodyInit | null) => {
    if (FakeXHR.sendFailure) throw FakeXHR.sendFailure
    this.sentBody = body
  })

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
  onMatched?: (rule: V3Rule, index: number, request: { url: string; method: string }) => void,
  onNoMatch?: (request: { url: string; method: string }) => void,
  onXHROutcome?: V3RuntimeHostOptions['onXHROutcome'],
  armed = false
) {
  const Constructor = createV3XHR(FakeXHR as unknown as V3XHRConstructor, {
    getRules: () => rules,
    onMatched,
    onNoMatch,
    onXHROutcome,
    isFetchOutcomeDiagnosticsArmed: () => armed,
  })
  return new Constructor() as unknown as XMLHttpRequest & FakeXHR
}

describe('createV3XHR', () => {
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

  it('reports a redirect open fallback after successful send, and preserves synchronous send errors', () => {
    const outcome = vi.fn()
    const selectedRule = rule('redirect', {
      request: { enabled: true, redirect: { url: 'https://target.test/api' } },
    })
    const xhr = makeXHR([selectedRule], undefined, undefined, outcome, true)
    FakeXHR.failRedirectOpenTarget = true

    xhr.open('POST', 'https://example.test/api', true)
    expect(outcome).not.toHaveBeenCalled()
    expect(xhr.openArgs[1]).toBe('https://example.test/api')
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
