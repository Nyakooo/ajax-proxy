// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  updateInterceptors: vi.fn(),
  updateRedirectors: vi.fn(),
  updateV3: vi.fn(),
  updateV3DiagnosticsArmed: vi.fn(),
  updateV3FetchOutcomeDiagnosticsArmed: vi.fn(),
  isValidGlobalState: vi.fn((value: unknown) => typeof value === 'object' && value !== null),
  isValidMode: vi.fn((value: unknown) => value === 'interceptor' || value === 'redirector'),
}))
const messageListeners = new Set<EventListener>()

vi.mock('@proxy/lib', () => ({
  default: {
    update: mocks.update,
    updateInterceptors: mocks.updateInterceptors,
    updateRedirectors: mocks.updateRedirectors,
    updateV3: mocks.updateV3,
    updateV3DiagnosticsArmed: mocks.updateV3DiagnosticsArmed,
    updateV3FetchOutcomeDiagnosticsArmed: mocks.updateV3FetchOutcomeDiagnosticsArmed,
  },
  isValidGlobalState: mocks.isValidGlobalState,
  isValidMode: mocks.isValidMode,
}))

vi.mock('@proxy/shared-utils', () => ({
  NoticeFrom: { CONTENT: 'from-content' },
  NoticeTo: { DOCUMENT: 'to-document' },
  NoticeKey: {
    GLOBAL_SWITCH: 'global-switch',
    MODE: 'mode',
    INTERCEPT_LIST: 'intercept-list',
    REDIRECT_LIST: 'redirect-list',
    V3_CONFIG: 'v3-config',
    V3_DIAGNOSTICS_ARMED: 'diagnostics-armed',
    V3_FETCH_OUTCOMES_ARMED: 'fetch-outcomes-armed',
  },
  StorageKey: {
    GLOBAL_SWITCH: 'global-switch',
    MODE: 'mode',
    INTERCEPT_LIST: 'intercept-list',
    REDIRECT_LIST: 'redirect-list',
  },
}))

function trackMessageListener() {
  const addEventListener = window.addEventListener.bind(window)
  vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
    if (type === 'message' && typeof listener === 'function') {
      messageListeners.add(listener as EventListener)
    }
    addEventListener(type, listener, options)
  })
}

function envelope(key: string, value?: unknown, extra: Record<string, unknown> = {}) {
  return { from: 'from-content', to: 'to-document', key, value, ...extra }
}

function dispatchMessage(data: unknown, overrides: MessageEventInit = {}) {
  window.dispatchEvent(
    new MessageEvent('message', {
      data,
      origin: window.location.origin,
      source: window,
      ...overrides,
    })
  )
}

async function importDocumentBridge() {
  await import('../src/document')
}

afterEach(() => {
  for (const listener of messageListeners) window.removeEventListener('message', listener)
  messageListeners.clear()
  vi.restoreAllMocks()
  vi.resetModules()
  vi.clearAllMocks()
  mocks.isValidGlobalState.mockReturnValue(true)
})

describe('MAIN-world content message bridge', () => {
  it('routes valid same-window, same-origin V2 and V3 messages to the proxy library', async () => {
    trackMessageListener()
    await importDocumentBridge()

    const refresh = {
      'global-switch': true,
      mode: 'redirector',
      'intercept-list': [{ url: '/api/items' }],
      'redirect-list': [{ url: '/api/other', redirect_url: 'https://target.test/' }],
    }
    dispatchMessage(envelope('ajax-proxy:notice:refresh:global-state', refresh))
    dispatchMessage(envelope('global-switch', false))
    dispatchMessage(envelope('mode', 'interceptor'))
    const interceptors = [{ url: '/api/profile' }]
    const redirectors = [{ url: '/api/legacy', redirect_url: 'https://target.test/' }]
    dispatchMessage(envelope('intercept-list', interceptors))
    dispatchMessage(envelope('redirect-list', redirectors))
    const v3Config = { format: 'ajax-proxy-backup', formatVersion: 7 }
    dispatchMessage(envelope('v3-config', v3Config))
    dispatchMessage(envelope('diagnostics-armed', true))
    dispatchMessage(envelope('fetch-outcomes-armed', false))

    expect(mocks.update).toHaveBeenNthCalledWith(1, {
      global_on: true,
      mode: 'redirector',
      interceptor_matching_content: refresh['intercept-list'],
      redirector_matching_content: refresh['redirect-list'],
    })
    expect(mocks.update).toHaveBeenNthCalledWith(2, false)
    expect(mocks.update).toHaveBeenNthCalledWith(3, 'interceptor')
    expect(mocks.updateInterceptors).toHaveBeenCalledExactlyOnceWith(interceptors)
    expect(mocks.updateRedirectors).toHaveBeenCalledExactlyOnceWith(redirectors)
    expect(mocks.updateV3).toHaveBeenCalledExactlyOnceWith(v3Config)
    expect(mocks.updateV3DiagnosticsArmed).toHaveBeenCalledExactlyOnceWith(true)
    expect(mocks.updateV3FetchOutcomeDiagnosticsArmed).toHaveBeenCalledExactlyOnceWith(false)
  })

  it('ignores messages with an untrusted source, origin, prototype, envelope, or refresh state', async () => {
    trackMessageListener()
    await importDocumentBridge()

    const trustedGlobalSwitch = envelope('global-switch', true)
    const inheritedEnvelope = Object.assign(Object.create({ inherited: true }), trustedGlobalSwitch)
    const invalidRefreshes = [
      envelope('ajax-proxy:notice:refresh:global-state', null),
      envelope('ajax-proxy:notice:refresh:global-state', []),
    ]
    const invalidMessages = [
      { data: trustedGlobalSwitch, origin: window.location.origin, source: null },
      { data: trustedGlobalSwitch, origin: 'https://foreign.test', source: window },
      { data: null, origin: window.location.origin, source: window },
      { data: [], origin: window.location.origin, source: window },
      { data: inheritedEnvelope, origin: window.location.origin, source: window },
      {
        data: envelope('global-switch', true, { private_url: 'https://secret.test/?token=secret' }),
        origin: window.location.origin,
        source: window,
      },
      { data: envelope('global-switch', 'true'), origin: window.location.origin, source: window },
      { data: envelope('mode', 'unknown'), origin: window.location.origin, source: window },
      ...invalidRefreshes.map((data) => ({ data, origin: window.location.origin, source: window })),
    ]

    for (const message of invalidMessages) {
      dispatchMessage(message.data, { origin: message.origin, source: message.source })
    }
    mocks.isValidGlobalState.mockReturnValue(false)
    dispatchMessage(envelope('ajax-proxy:notice:refresh:global-state', { 'global-switch': true }))

    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.updateInterceptors).not.toHaveBeenCalled()
    expect(mocks.updateRedirectors).not.toHaveBeenCalled()
    expect(mocks.updateV3).not.toHaveBeenCalled()
    expect(mocks.updateV3DiagnosticsArmed).not.toHaveBeenCalled()
    expect(mocks.updateV3FetchOutcomeDiagnosticsArmed).not.toHaveBeenCalled()
  })
})
