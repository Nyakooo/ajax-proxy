import { afterEach, describe, expect, it, vi } from 'vitest'
import { isV3FunctionError, NoticeTo } from '@proxy/protocol'
import { createV3RuntimeController } from '../../src/v3/runtimeController'

afterEach(() => vi.unstubAllGlobals())

const backup = {
  format: 'ajax-proxy-backup',
  formatVersion: 3,
  settings: { globalEnabled: true, mode: 'interceptor', language: 'en' },
  tags: [],
  rules: [],
}

class RuntimeXHR extends EventTarget {
  readyState = 0
  responseType: XMLHttpRequestResponseType = ''
  status = 200
  statusText = 'OK'
  response: unknown = ''
  responseText = ''

  open() {
    this.readyState = 1
  }

  send() {}

  complete(body: string) {
    this.readyState = 4
    this.responseText = body
    this.response = body
    this.dispatchEvent(new Event('loadend'))
  }
}

class RuntimeSandboxFrame {
  src = 'chrome-extension://test-extension/v3-sandbox/sandbox.html'
  contentWindow = { postMessage: vi.fn() } as unknown as Window
  remove = vi.fn()
}

describe('createV3RuntimeController', () => {
  it('owns V3 configuration lifecycle and retains active state on invalid updates', () => {
    const host = {
      location: { origin: 'https://example.test' },
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Window
    const controller = createV3RuntimeController(
      host,
      vi.fn(async () => new Response('native')) as typeof window.fetch,
      class {} as unknown as typeof window.XMLHttpRequest
    )

    expect(controller.backup).toBeNull()
    expect(controller.update(backup)).toEqual({ ok: true, status: 'updated' })
    const active = controller.backup
    expect(active).toEqual({ ...backup, formatVersion: 7, disabledOrigins: [] })

    const invalidUpdate = controller.update({ ...backup, formatVersion: 2 })
    expect(invalidUpdate).toMatchObject({
      ok: false,
      issues: [{ path: 'formatVersion' }],
    })
    expect(controller.backup).toBe(active)

    expect(
      controller.update({ ...backup, settings: { ...backup.settings, globalEnabled: false } })
    ).toEqual({ ok: true, status: 'updated' })
    expect(controller.backup?.settings.globalEnabled).toBe(false)

    expect(controller.update(null)).toEqual({ ok: true, status: 'cleared' })
    expect(controller.backup).toBeNull()
  })

  it('keeps Fetch native before a V3 backup is configured', async () => {
    const dispatchEvent = vi.fn()
    const nativeResponse = new Response('native')
    const fetcher = vi.fn(async () => nativeResponse)
    const host = {
      location: { origin: 'https://example.test' },
      dispatchEvent,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Window
    const controller = createV3RuntimeController(
      host,
      fetcher as typeof window.fetch,
      class {} as unknown as typeof window.XMLHttpRequest
    )

    const response = await controller.fetch('https://example.test/api')

    expect(response).toBe(nativeResponse)
    expect(fetcher).toHaveBeenCalledOnce()
    expect(dispatchEvent).not.toHaveBeenCalled()
  })

  it('keeps Fetch and XHR native when the global V3 switch is off', async () => {
    const dispatchEvent = vi.fn()
    const nativeResponse = new Response('native')
    const fetcher = vi.fn(async () => nativeResponse)
    const open = vi.spyOn(RuntimeXHR.prototype, 'open')
    const send = vi.spyOn(RuntimeXHR.prototype, 'send')
    const host = {
      location: { origin: 'https://example.test' },
      dispatchEvent,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Window
    const controller = createV3RuntimeController(
      host,
      fetcher as typeof window.fetch,
      RuntimeXHR as unknown as typeof window.XMLHttpRequest
    )
    controller.update({
      ...backup,
      settings: { ...backup.settings, globalEnabled: false },
      rules: [
        {
          id: 'global-off-rule',
          enabled: true,
          match: { url: '/api', method: 'GET' },
          response: { enabled: true, replace: { body: { intercepted: true } } },
        },
      ],
    })
    controller.setDiagnosticsArmed(true)
    controller.setFetchOutcomeDiagnosticsArmed(true)

    const response = await controller.fetch('https://example.test/api')
    expect(response).toBe(nativeResponse)
    expect(fetcher).toHaveBeenCalledOnce()

    const xhr = new controller.xhr() as unknown as RuntimeXHR
    xhr.open('GET', 'https://example.test/api')
    xhr.send()
    xhr.complete('native XHR body')

    expect(open).toHaveBeenCalledOnce()
    expect(open).toHaveBeenCalledWith('GET', 'https://example.test/api')
    expect(send).toHaveBeenCalledOnce()
    expect(xhr.status).toBe(200)
    expect(xhr.responseText).toBe('native XHR body')
    expect(xhr.response).toBe('native XHR body')
    expect(dispatchEvent).not.toHaveBeenCalled()
  })

  it('leaves a disabled exact origin native without changing the configured rules', async () => {
    const host = {
      location: { origin: 'https://example.test' },
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Window
    const fetcher = vi.fn(async () => new Response('native'))
    const controller = createV3RuntimeController(
      host,
      fetcher as typeof window.fetch,
      class {} as unknown as typeof window.XMLHttpRequest
    )
    const configuredBackup = {
      ...backup,
      formatVersion: 5,
      disabledOrigins: ['https://example.test'],
      rules: [
        {
          id: 'site-rule',
          enabled: true,
          match: { url: '/api', method: 'GET' },
          response: { enabled: true, replace: { body: { intercepted: true } } },
        },
      ],
    }
    controller.update(configuredBackup)
    controller.setDiagnosticsArmed(true)

    const native = await controller.fetch('https://example.test/api')
    expect(await native.text()).toBe('native')
    expect(fetcher).toHaveBeenCalledOnce()
    expect(host.dispatchEvent).not.toHaveBeenCalled()
    expect(controller.backup?.rules).toEqual(configuredBackup.rules)
    expect(controller.backup?.disabledOrigins).toEqual(['https://example.test'])

    expect(controller.update({ ...configuredBackup, disabledOrigins: [] })).toEqual({
      ok: true,
      status: 'updated',
    })
    const intercepted = await controller.fetch('https://example.test/api')
    expect(await intercepted.text()).toBe('{"intercepted":true}')
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(host.dispatchEvent).toHaveBeenCalledOnce()
  })

  it('keeps Fetch native and skips diagnostics when the host origin cannot be read', async () => {
    const dispatchEvent = vi.fn()
    const fetcher = vi.fn(async () => new Response('native'))
    const host = {
      get location() {
        throw new Error('origin unavailable')
      },
      dispatchEvent,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Window
    const controller = createV3RuntimeController(
      host,
      fetcher as typeof window.fetch,
      class {} as unknown as typeof window.XMLHttpRequest
    )
    controller.update({
      ...backup,
      rules: [
        {
          id: 'matching-rule',
          enabled: true,
          match: { url: '/api', method: 'GET' },
          response: { enabled: true, replace: { body: { mocked: true } } },
        },
      ],
    })
    controller.setDiagnosticsArmed(true)

    const response = await controller.fetch('https://example.test/api')

    expect(await response.text()).toBe('native')
    expect(fetcher).toHaveBeenCalledOnce()
    expect(dispatchEvent).not.toHaveBeenCalled()
  })

  it('emits a privacy-limited function error event when a sandbox result is invalid', async () => {
    vi.stubGlobal('HTMLIFrameElement', RuntimeSandboxFrame)
    const frame = new RuntimeSandboxFrame()
    const dispatchEvent = vi.fn()
    const fetcher = vi.fn(async () => new Response('native'))
    let onMessage: ((event: MessageEvent) => void) | undefined
    const host = {
      location: { origin: 'https://example.test' },
      document: { getElementById: vi.fn(() => frame) },
      dispatchEvent,
      addEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') onMessage = listener as (event: MessageEvent) => void
      }),
      removeEventListener: vi.fn(),
      crypto: { randomUUID: () => 'invalid-function-result-id' },
    } as unknown as Window
    const controller = createV3RuntimeController(
      host,
      fetcher as typeof window.fetch,
      class {} as unknown as typeof window.XMLHttpRequest
    )
    controller.update({
      ...backup,
      rules: [
        {
          id: 'function-rule',
          enabled: true,
          match: { url: '/api', method: 'POST' },
          response: { enabled: true, replace: { code: 'return { unknown: true }' } },
        },
      ],
    })

    const responsePromise = controller.fetch('https://example.test/api?token=secret', {
      method: 'POST',
    })
    onMessage?.({
      origin: 'null',
      source: frame.contentWindow,
      data: { channel: 'ajax-proxy-v3-function-sandbox', type: 'ready' },
    } as MessageEvent)
    await vi.waitFor(() => expect(frame.contentWindow.postMessage).toHaveBeenCalledOnce())
    const [runMessage] = vi.mocked(frame.contentWindow.postMessage).mock.calls[0] ?? []
    onMessage?.({
      origin: 'null',
      source: frame.contentWindow,
      data: {
        channel: 'ajax-proxy-v3-function-sandbox',
        type: 'result',
        id: runMessage.id,
        ok: true,
        result: { unknown: true },
      },
    } as MessageEvent)

    const response = await responsePromise
    expect(await response.text()).toBe('native')
    expect(fetcher).toHaveBeenCalledOnce()
    const functionErrorEvent = dispatchEvent.mock.calls
      .map(([event]) => event as CustomEvent)
      .find((event) => isV3FunctionError(event.detail))
    expect(functionErrorEvent?.type).toBe(NoticeTo.CONTENT)
    expect(functionErrorEvent?.detail).toEqual({
      rule_id: 'function-rule',
      match_url: '/api',
      method: 'POST',
      action: 'response',
      code: 'invalid-result',
    })
    expect(isV3FunctionError(functionErrorEvent?.detail)).toBe(true)
    expect(JSON.stringify(functionErrorEvent?.detail)).not.toContain('token=secret')
  })

  it('emits privacy-limited diagnostics only while armed and leaves fetch native', async () => {
    const dispatchEvent = vi.fn()
    const host = {
      location: { origin: 'https://example.test' },
      dispatchEvent,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Window
    const fetcher = vi.fn(async () => new Response('native'))
    const controller = createV3RuntimeController(
      host,
      fetcher as typeof window.fetch,
      class {} as unknown as typeof window.XMLHttpRequest
    )
    const configuredBackup = {
      ...backup,
      rules: [
        {
          id: 'rule-a',
          enabled: true,
          match: { url: '/expected', method: 'GET' },
          request: { enabled: false, redirect: { url: 'https://unused.test/' } },
          response: { enabled: true, replace: { body: { mocked: true } } },
        },
      ],
    }
    controller.update(configuredBackup)

    await controller.fetch('https://example.test/private?token=secret')
    expect(dispatchEvent).not.toHaveBeenCalled()

    controller.setDiagnosticsArmed(true)
    await controller.fetch('https://example.test/private?token=secret')
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(dispatchEvent).toHaveBeenCalledOnce()
    const event = dispatchEvent.mock.calls[0][0] as CustomEvent
    expect(event.detail).toEqual({
      kind: 'v3-no-match',
      method: 'GET',
      rules: [{ rule_id: 'rule-a', reason: 'url-mismatch' }],
      truncated: false,
    })
    expect(JSON.stringify(event.detail)).not.toContain('private')
    expect(JSON.stringify(event.detail)).not.toContain('secret')
  })

  it('keeps Fetch native when dispatching a no-match diagnostic throws', async () => {
    const dispatchEvent = vi.fn(() => {
      throw new Error('content event dispatch unavailable')
    })
    const host = {
      location: { origin: 'https://example.test' },
      dispatchEvent,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Window
    const nativeResponse = new Response('native')
    const fetcher = vi.fn(async () => nativeResponse)
    const controller = createV3RuntimeController(
      host,
      fetcher as typeof window.fetch,
      class {} as unknown as typeof window.XMLHttpRequest
    )
    controller.update({
      ...backup,
      rules: [
        {
          id: 'expected-rule',
          enabled: true,
          match: { url: '/expected', method: 'GET' },
          response: { enabled: true, replace: { body: { mocked: true } } },
        },
      ],
    })
    controller.setDiagnosticsArmed(true)

    const response = await controller.fetch('https://example.test/private?token=secret')

    expect(response).toBe(nativeResponse)
    expect(fetcher).toHaveBeenCalledOnce()
    expect(dispatchEvent).toHaveBeenCalledOnce()
  })

  it('keeps a matched response replacement when dispatching its hit notification throws', async () => {
    const dispatchEvent = vi.fn(() => {
      throw new Error('content event dispatch unavailable')
    })
    const host = {
      location: { origin: 'https://example.test' },
      dispatchEvent,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Window
    const fetcher = vi.fn(async () => new Response('native'))
    const controller = createV3RuntimeController(
      host,
      fetcher as typeof window.fetch,
      class {} as unknown as typeof window.XMLHttpRequest
    )
    controller.update({
      ...backup,
      rules: [
        {
          id: 'response-rule',
          enabled: true,
          match: { url: '/api', method: 'GET' },
          response: { enabled: true, replace: { body: { mocked: true } } },
        },
      ],
    })

    const response = await controller.fetch('https://example.test/api')

    expect(await response.text()).toBe('{"mocked":true}')
    expect(fetcher).toHaveBeenCalledOnce()
    expect(dispatchEvent).toHaveBeenCalledOnce()
  })

  it('truncates no-match diagnostics after 100 rules', async () => {
    const dispatchEvent = vi.fn()
    const fetcher = vi.fn(async () => new Response('native'))
    const host = {
      location: { origin: 'https://example.test' },
      dispatchEvent,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Window
    const controller = createV3RuntimeController(
      host,
      fetcher as typeof window.fetch,
      class {} as unknown as typeof window.XMLHttpRequest
    )
    controller.update({
      ...backup,
      rules: Array.from({ length: 101 }, (_, index) => ({
        id: `rule-${index}`,
        enabled: true,
        match: { url: `/expected-${index}`, method: 'GET' },
        response: { enabled: true, replace: { body: { intercepted: true } } },
      })),
    })
    controller.setDiagnosticsArmed(true)

    const response = await controller.fetch('https://example.test/private')

    expect(await response.text()).toBe('native')
    expect(fetcher).toHaveBeenCalledOnce()
    expect(dispatchEvent).toHaveBeenCalledOnce()
    const event = dispatchEvent.mock.calls[0][0] as CustomEvent
    expect(event.detail).toMatchObject({
      kind: 'v3-no-match',
      method: 'GET',
      truncated: true,
    })
    expect(event.detail.rules).toHaveLength(100)
    expect(event.detail.rules[0]).toEqual({ rule_id: 'rule-0', reason: 'url-mismatch' })
    expect(event.detail.rules[99]).toEqual({ rule_id: 'rule-99', reason: 'url-mismatch' })
    expect(event.detail.rules).not.toContainEqual({ rule_id: 'rule-100', reason: 'url-mismatch' })
  })

  it('dispatches correlated Fetch outcomes only under their independent opt-in gate', async () => {
    const dispatchEvent = vi.fn()
    const host = {
      location: { origin: 'https://example.test' },
      dispatchEvent,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Window
    const fetcher = vi.fn(async () => new Response('native'))
    const controller = createV3RuntimeController(
      host,
      fetcher as typeof window.fetch,
      class {} as unknown as typeof window.XMLHttpRequest
    )
    const configuredBackup = {
      ...backup,
      rules: [
        {
          id: 'rule-a',
          enabled: true,
          match: { url: '/api', method: 'GET' },
          request: { enabled: true, redirect: { url: 'https://target.test/api' } },
          response: { enabled: true, replace: { body: { mocked: true } } },
        },
      ],
    }
    controller.update(configuredBackup)

    await controller.fetch('https://example.test/api')
    expect(
      dispatchEvent.mock.calls.map(([event]) => (event as CustomEvent).detail.kind)
    ).not.toContain('v3-fetch-outcome')
    expect(controller.fetchOutcomeDiagnosticsArmed).toBe(false)

    controller.setFetchOutcomeDiagnosticsArmed(true)
    await controller.fetch('https://example.test/api')

    const events = dispatchEvent.mock.calls
      .map(([event]) => (event as CustomEvent).detail)
      .filter(({ kind }) => kind === 'v3-fetch-outcome')
    expect(events).toHaveLength(2)
    expect(
      events.map(({ kind, rule_id, stage, outcome, reason }) => ({
        kind,
        rule_id,
        stage,
        outcome,
        reason,
      }))
    ).toEqual([
      {
        kind: 'v3-fetch-outcome',
        rule_id: 'rule-a',
        stage: 'request',
        outcome: 'applied',
        reason: 'redirect-applied',
      },
      {
        kind: 'v3-fetch-outcome',
        rule_id: 'rule-a',
        stage: 'response',
        outcome: 'applied',
        reason: 'response-replacement-applied',
      },
    ])
    expect(events[0].correlation_id).toBe(events[1].correlation_id)
    expect(events[0].correlation_id).toMatch(/^v3-fetch-[a-z0-9]+-[a-z0-9]+-\d+$/)
    await controller.fetch('https://example.test/api')
    const laterEvents = dispatchEvent.mock.calls
      .map(([event]) => (event as CustomEvent).detail)
      .filter(({ kind }) => kind === 'v3-fetch-outcome')
    expect(laterEvents).toHaveLength(4)
    expect(laterEvents[2].correlation_id).not.toBe(events[0].correlation_id)
    expect(JSON.stringify(events)).not.toContain('https://example.test')
  })

  it('suppresses a pending Fetch outcome after diagnostics are disarmed', async () => {
    const dispatchEvent = vi.fn()
    const host = {
      location: { origin: 'https://example.test' },
      dispatchEvent,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Window
    let resolveNativeResponse!: (response: Response) => void
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveNativeResponse = resolve
        })
    )
    const controller = createV3RuntimeController(
      host,
      fetcher as typeof window.fetch,
      class {} as unknown as typeof window.XMLHttpRequest
    )
    controller.update({
      ...backup,
      rules: [
        {
          id: 'pending-fetch-rule',
          enabled: true,
          match: { url: '/api', method: 'GET' },
          response: { enabled: true, replace: { body: { mocked: true } } },
        },
      ],
    })
    controller.setFetchOutcomeDiagnosticsArmed(true)

    const responsePromise = controller.fetch('https://example.test/api')
    expect(fetcher).toHaveBeenCalledOnce()
    controller.setFetchOutcomeDiagnosticsArmed(false)
    resolveNativeResponse(new Response('native'))

    const response = await responsePromise
    expect(await response.text()).toBe('{"mocked":true}')
    expect(
      dispatchEvent.mock.calls.map(([event]) => (event as CustomEvent).detail.kind)
    ).not.toContain('v3-fetch-outcome')
  })

  it('dispatches a distinct XHR outcome notice only after a replacement is observed', () => {
    const dispatchEvent = vi.fn()
    const host = {
      location: { origin: 'https://example.test' },
      dispatchEvent,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Window
    const controller = createV3RuntimeController(
      host,
      vi.fn(async () => new Response('native')) as typeof window.fetch,
      RuntimeXHR as unknown as typeof window.XMLHttpRequest
    )
    controller.update({
      ...backup,
      rules: [
        {
          id: 'xhr-rule',
          enabled: true,
          match: { url: '/api', method: 'GET' },
          request: { enabled: false, redirect: { url: 'https://unused.test/' } },
          response: { enabled: true, replace: { body: 'replacement' } },
        },
      ],
    })
    controller.setFetchOutcomeDiagnosticsArmed(true)
    const xhr = new controller.xhr() as unknown as RuntimeXHR
    xhr.open('GET', 'https://example.test/api')
    xhr.send()
    xhr.complete('native')

    expect(
      dispatchEvent.mock.calls.map(([event]) => (event as CustomEvent).detail.kind)
    ).not.toContain('v3-xhr-outcome')
    expect(xhr.responseText).toBe('"replacement"')
    const event = dispatchEvent.mock.calls
      .map(([item]) => (item as CustomEvent).detail)
      .find(({ kind }) => kind === 'v3-xhr-outcome')
    expect(event).toMatchObject({
      kind: 'v3-xhr-outcome',
      rule_id: 'xhr-rule',
      stage: 'response',
      outcome: 'applied',
      reason: 'response-replacement-applied',
    })
    expect(event.correlation_id).toMatch(/^v3-xhr-/)
    expect(JSON.stringify(event)).not.toContain('https://example.test')
  })

  it('suppresses a pending XHR outcome after diagnostics are disarmed', () => {
    const dispatchEvent = vi.fn()
    const host = {
      location: { origin: 'https://example.test' },
      dispatchEvent,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Window
    const controller = createV3RuntimeController(
      host,
      vi.fn(async () => new Response('native')) as typeof window.fetch,
      RuntimeXHR as unknown as typeof window.XMLHttpRequest
    )
    controller.update({
      ...backup,
      rules: [
        {
          id: 'pending-xhr-rule',
          enabled: true,
          match: { url: '/api', method: 'GET' },
          response: { enabled: true, replace: { body: 'replacement' } },
        },
      ],
    })
    controller.setFetchOutcomeDiagnosticsArmed(true)
    const xhr = new controller.xhr() as unknown as RuntimeXHR
    xhr.open('GET', 'https://example.test/api')
    xhr.send()
    controller.setFetchOutcomeDiagnosticsArmed(false)
    xhr.complete('native')

    expect(xhr.responseText).toBe('"replacement"')
    expect(
      dispatchEvent.mock.calls.map(([event]) => (event as CustomEvent).detail.kind)
    ).not.toContain('v3-xhr-outcome')
  })
})
