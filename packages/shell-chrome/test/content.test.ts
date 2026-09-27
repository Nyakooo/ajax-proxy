// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  initStorage: vi.fn(),
  getStorage: vi.fn(),
  getStorageSnapshot: vi.fn(),
  setStorage: vi.fn(),
  removeStorage: vi.fn(),
  noticeDocumentByContent: vi.fn(),
  noticeServiceWorkerByContent: vi.fn(),
  onChangedAddListener: vi.fn(),
  onLoadForDataConversion: vi.fn((data: Record<string, unknown>) => ({
    changed: false,
    data,
    changeKeywords: [],
  })),
}))
const contentEventListeners = new Set<EventListener>()
const pageShowEventListeners = new Set<EventListener>()

vi.mock('@proxy/shared-utils', () => ({
  initStorage: mocks.initStorage,
  NoticeTo: { CONTENT: 'to-content' },
  NoticeKey: {
    BADGE_STATUS: 'badge-status',
    V3_CONFIG: 'v3-config',
    V3_DIAGNOSTICS_ARMED: 'diagnostics-armed',
    V3_FETCH_OUTCOMES_ARMED: 'fetch-outcomes-armed',
    V3_HIT: 'v3-hit',
    V3_FUNCTION_ERROR: 'v3-function-error',
    V3_NO_MATCH: 'v3-no-match',
    V3_FETCH_OUTCOME: 'v3-fetch-outcome',
  },
  StorageKey: {
    GLOBAL_SWITCH: 'global-switch',
    MODE: 'mode',
    INTERCEPT_LIST: 'intercept-list',
    REDIRECT_LIST: 'redirect-list',
    V3_CONFIG: 'v3-config',
    V3_DIAGNOSTICS_ARMED: 'diagnostics-armed',
    V3_FETCH_OUTCOMES_ARMED: 'fetch-outcomes-armed',
  },
  noticeDocumentByContent: mocks.noticeDocumentByContent,
  noticeServiceWorkerByContent: mocks.noticeServiceWorkerByContent,
  getStorage: mocks.getStorage,
  getStorageSnapshot: mocks.getStorageSnapshot,
  setStorage: mocks.setStorage,
  removeStorage: mocks.removeStorage,
}))

vi.mock('@proxy/v2-compatibility', () => ({
  onLoadForDataConversion: mocks.onLoadForDataConversion,
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function createRuntimePort() {
  const disconnectListeners: Array<() => void> = []
  return {
    disconnect: vi.fn(() => disconnectListeners.forEach((listener) => listener())),
    onDisconnect: {
      addListener: vi.fn((listener: () => void) => disconnectListeners.push(listener)),
    },
  }
}

async function importContent() {
  await import('../src/content')
  await Promise.resolve()
}

function trackContentEventListeners() {
  const addEventListener = window.addEventListener.bind(window)
  return vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
    if (typeof listener === 'function') {
      if (type === 'to-content') contentEventListeners.add(listener as EventListener)
      if (type === 'pageshow') pageShowEventListeners.add(listener as EventListener)
    }
    addEventListener(type, listener, options)
  })
}

function dispatchContentEvent(detail: unknown) {
  window.dispatchEvent(new CustomEvent('to-content', { detail }))
}

const validEvents = [
  [{ match_url: '/api/items', method: 'GET' }, 'badge-status'],
  [{ kind: 'v3-hit', rule_id: 'rule-a', match_url: '/api/items', method: 'GET' }, 'v3-hit'],
  [
    {
      rule_id: 'rule-a',
      match_url: '/api/items',
      method: 'POST',
      action: 'response',
      code: 'execution-failed',
    },
    'v3-function-error',
  ],
  [
    {
      kind: 'v3-no-match',
      method: 'GET',
      rules: [{ rule_id: 'rule-a', reason: 'url-mismatch' }],
      truncated: false,
    },
    'v3-no-match',
  ],
  [
    {
      kind: 'v3-fetch-outcome',
      correlation_id: 'fetch-1',
      rule_id: 'rule-a',
      stage: 'request',
      outcome: 'applied',
      reason: 'redirect-applied',
    },
    'v3-fetch-outcome',
  ],
  [
    {
      kind: 'v3-xhr-outcome',
      correlation_id: 'xhr-1',
      rule_id: 'rule-a',
      stage: 'request',
      outcome: 'applied',
      reason: 'redirect-applied',
    },
    'v3-fetch-outcome',
  ],
] as const

afterEach(() => {
  for (const listener of contentEventListeners) window.removeEventListener('to-content', listener)
  contentEventListeners.clear()
  for (const listener of pageShowEventListeners) window.removeEventListener('pageshow', listener)
  pageShowEventListeners.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.resetModules()
  vi.clearAllMocks()
  document.documentElement.innerHTML = '<head></head><body></body>'
})

describe('content page-event bridge', () => {
  it('reconnects once when a page is restored from BFCache', async () => {
    mocks.initStorage.mockResolvedValue(undefined)
    mocks.getStorageSnapshot.mockReturnValue({})
    const runtimeConnect = vi.fn(() => createRuntimePort())
    vi.stubGlobal('chrome', {
      runtime: { connect: runtimeConnect, getURL: (path: string) => path },
      storage: { onChanged: { addListener: mocks.onChangedAddListener } },
    })
    trackContentEventListeners()

    await importContent()
    await vi.waitFor(() => expect(runtimeConnect).toHaveBeenCalledOnce())
    const pageshow = new Event('pageshow')
    Object.defineProperty(pageshow, 'persisted', { value: true })
    window.dispatchEvent(pageshow)

    expect(runtimeConnect).toHaveBeenCalledTimes(2)
    window.dispatchEvent(new Event('pageshow'))
    expect(runtimeConnect).toHaveBeenCalledTimes(2)
  })

  it('waits for storage initialization before registering listeners or sending notices', async () => {
    const storageReady = deferred<void>()
    mocks.initStorage.mockReturnValue(storageReady.promise)
    mocks.getStorageSnapshot.mockReturnValue({})
    const runtimeConnect = vi.fn(() => createRuntimePort())
    const runtimeGetURL = vi.fn((path: string) => `chrome-extension://test/${path}`)
    vi.stubGlobal('chrome', {
      runtime: { connect: runtimeConnect, getURL: runtimeGetURL },
      storage: { onChanged: { addListener: mocks.onChangedAddListener } },
    })
    const addEventListener = trackContentEventListeners()

    await importContent()

    expect(mocks.onChangedAddListener).not.toHaveBeenCalled()
    expect(addEventListener.mock.calls.some(([type]) => type === 'to-content')).toBe(false)
    expect(runtimeConnect).not.toHaveBeenCalled()
    expect(mocks.noticeDocumentByContent).not.toHaveBeenCalled()
    expect(mocks.noticeServiceWorkerByContent).not.toHaveBeenCalled()

    storageReady.resolve()
    await vi.waitFor(() => expect(runtimeConnect).toHaveBeenCalledOnce())
    expect(runtimeConnect).toHaveBeenCalledWith({ name: 'ajax-proxy:connect:custom:name' })
    expect(mocks.onChangedAddListener).toHaveBeenCalledOnce()
    expect(addEventListener.mock.calls.some(([type]) => type === 'to-content')).toBe(true)
  })

  it('does not initialize the bridge after storage initialization fails', async () => {
    mocks.initStorage.mockRejectedValue(new Error('storage unavailable'))
    const runtimeConnect = vi.fn(() => createRuntimePort())
    vi.stubGlobal('chrome', {
      runtime: {
        connect: runtimeConnect,
        getURL: (path: string) => `chrome-extension://test/${path}`,
      },
      storage: { onChanged: { addListener: mocks.onChangedAddListener } },
    })
    const addEventListener = trackContentEventListeners()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await importContent()
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledOnce())

    expect(mocks.onChangedAddListener).not.toHaveBeenCalled()
    expect(addEventListener.mock.calls.some(([type]) => type === 'to-content')).toBe(false)
    expect(runtimeConnect).not.toHaveBeenCalled()
    expect(mocks.getStorageSnapshot).not.toHaveBeenCalled()
    expect(mocks.noticeDocumentByContent).not.toHaveBeenCalled()
    expect(mocks.noticeServiceWorkerByContent).not.toHaveBeenCalled()
  })

  it('forwards local storage changes and manages the V3 function sandbox lifecycle', async () => {
    mocks.initStorage.mockResolvedValue(undefined)
    const enabledFunctionConfig = {
      settings: { globalEnabled: true },
      rules: [
        {
          enabled: true,
          response: { enabled: true, replace: { code: 'return { body: "ok" }' } },
        },
      ],
    }
    const storedValues: Record<string, unknown> = {
      'global-switch': true,
      mode: 'interceptor',
      'intercept-list': [{ url: '/api/items' }],
      'redirect-list': [],
      'v3-config': enabledFunctionConfig,
      'diagnostics-armed': true,
      'fetch-outcomes-armed': false,
    }
    mocks.getStorage.mockImplementation((key: string, fallback: unknown) =>
      Object.hasOwn(storedValues, key) ? storedValues[key] : fallback
    )
    vi.stubGlobal('chrome', {
      runtime: {
        connect: vi.fn(() => createRuntimePort()),
        getURL: (path: string) => `chrome-extension://test/${path}`,
      },
      storage: { onChanged: { addListener: mocks.onChangedAddListener } },
    })
    trackContentEventListeners()

    await importContent()
    await vi.waitFor(() => expect(mocks.onChangedAddListener).toHaveBeenCalledOnce())
    const onChanged = mocks.onChangedAddListener.mock.calls[0][0]
    mocks.noticeDocumentByContent.mockClear()

    onChanged({ 'global-switch': { newValue: true } }, 'sync')
    expect(mocks.noticeDocumentByContent).not.toHaveBeenCalled()

    onChanged({ 'global-switch': { newValue: true } }, 'local')
    expect(mocks.noticeDocumentByContent).toHaveBeenCalledWith(
      'ajax-proxy:notice:refresh:global-state',
      {
        'global-switch': true,
        mode: 'interceptor',
        'intercept-list': [{ url: '/api/items' }],
        'redirect-list': [],
      }
    )

    onChanged({ 'v3-config': { newValue: enabledFunctionConfig } }, 'local')
    expect(document.getElementById('ajax-proxy-v3-function-sandbox')?.getAttribute('src')).toBe(
      'chrome-extension://test/v3-sandbox/sandbox.html'
    )
    expect(mocks.noticeDocumentByContent).toHaveBeenCalledWith('v3-config', enabledFunctionConfig)

    storedValues['v3-config'] = null
    onChanged({ 'v3-config': { newValue: null } }, 'local')
    expect(document.getElementById('ajax-proxy-v3-function-sandbox')).toBeNull()
    expect(mocks.noticeDocumentByContent).toHaveBeenCalledWith('v3-config', null)

    onChanged({ 'diagnostics-armed': { newValue: true } }, 'local')
    onChanged({ 'fetch-outcomes-armed': { newValue: false } }, 'local')
    expect(mocks.noticeDocumentByContent).toHaveBeenCalledWith('diagnostics-armed', true)
    expect(mocks.noticeDocumentByContent).toHaveBeenCalledWith('fetch-outcomes-armed', false)
  })

  it('restores the V3 function sandbox iframe when the page removes or changes it', async () => {
    mocks.initStorage.mockResolvedValue(undefined)
    mocks.getStorageSnapshot.mockReturnValue({})
    mocks.getStorage.mockReturnValue(null)
    vi.stubGlobal('chrome', {
      runtime: {
        connect: vi.fn(() => createRuntimePort()),
        getURL: (path: string) => `chrome-extension://test/${path}`,
      },
      storage: { onChanged: { addListener: mocks.onChangedAddListener } },
    })
    trackContentEventListeners()

    await importContent()
    await vi.waitFor(() => expect(mocks.onChangedAddListener).toHaveBeenCalledOnce())

    const onChanged = mocks.onChangedAddListener.mock.calls[0][0]
    const enabledFunctionConfig = {
      settings: { globalEnabled: true },
      rules: [
        {
          enabled: true,
          request: {
            enabled: true,
            redirect: { type: 'function', code: 'return url' },
          },
        },
      ],
    }
    mocks.getStorage.mockReturnValue(enabledFunctionConfig)
    onChanged({ 'v3-config': { newValue: enabledFunctionConfig } }, 'local')

    const originalFrame = document.getElementById('ajax-proxy-v3-function-sandbox')
    expect(originalFrame?.getAttribute('src')).toBe(
      'chrome-extension://test/v3-sandbox/sandbox.html'
    )
    originalFrame?.remove()

    await vi.waitFor(() => {
      const restoredFrame = document.getElementById('ajax-proxy-v3-function-sandbox')
      expect(restoredFrame).not.toBeNull()
      expect(restoredFrame).not.toBe(originalFrame)
      expect(restoredFrame?.getAttribute('src')).toBe(
        'chrome-extension://test/v3-sandbox/sandbox.html'
      )
    })

    const restoredFrame = document.getElementById('ajax-proxy-v3-function-sandbox')
    restoredFrame?.setAttribute('src', 'https://example.test/forged-frame.html')

    await vi.waitFor(() => {
      const trustedFrame = document.getElementById('ajax-proxy-v3-function-sandbox')
      expect(trustedFrame).not.toBeNull()
      expect(trustedFrame).not.toBe(restoredFrame)
      expect(trustedFrame?.getAttribute('src')).toBe(
        'chrome-extension://test/v3-sandbox/sandbox.html'
      )
    })

    mocks.getStorage.mockReturnValue(null)
    onChanged({ 'v3-config': { newValue: null } }, 'local')
    const disabledFrame = document.getElementById('ajax-proxy-v3-function-sandbox')
    expect(disabledFrame).toBeNull()

    await Promise.resolve()
    expect(document.getElementById('ajax-proxy-v3-function-sandbox')).toBeNull()
  })

  it('mounts the function sandbox for request redirects without an enabled response action', async () => {
    mocks.initStorage.mockResolvedValue(undefined)
    mocks.getStorageSnapshot.mockReturnValue({})
    mocks.getStorage.mockReturnValue(null)
    vi.stubGlobal('chrome', {
      runtime: {
        connect: vi.fn(() => createRuntimePort()),
        getURL: (path: string) => `chrome-extension://test/${path}`,
      },
      storage: { onChanged: { addListener: mocks.onChangedAddListener } },
    })
    trackContentEventListeners()

    await importContent()
    await vi.waitFor(() => expect(mocks.onChangedAddListener).toHaveBeenCalledOnce())

    const onChanged = mocks.onChangedAddListener.mock.calls[0][0]
    const redirectFunctionConfig = {
      settings: { globalEnabled: true },
      rules: [
        {
          enabled: true,
          request: {
            enabled: true,
            redirect: { type: 'function', code: 'return url' },
          },
          response: { enabled: false, replace: { code: 'return { body: "unused" }' } },
        },
      ],
    }
    mocks.getStorage.mockReturnValue(redirectFunctionConfig)
    onChanged({ 'v3-config': { newValue: redirectFunctionConfig } }, 'local')

    expect(document.getElementById('ajax-proxy-v3-function-sandbox')?.getAttribute('src')).toBe(
      'chrome-extension://test/v3-sandbox/sandbox.html'
    )

    const disabledFunctionConfig = {
      ...redirectFunctionConfig,
      rules: [
        {
          ...redirectFunctionConfig.rules[0],
          request: {
            enabled: false,
            redirect: { type: 'function', code: 'return url' },
          },
        },
      ],
    }
    mocks.getStorage.mockReturnValue(disabledFunctionConfig)
    onChanged({ 'v3-config': { newValue: disabledFunctionConfig } }, 'local')
    expect(document.getElementById('ajax-proxy-v3-function-sandbox')).toBeNull()
  })

  it('persists converted V2 state and removes only its legacy storage keys', async () => {
    mocks.initStorage.mockResolvedValue(undefined)
    const legacySnapshot = {
      globalSwitchOn: true,
      mode: 'redirector',
      proxy_routes: [{ match: '/old-api' }],
      redirect: [{ redirect: 'https://target.test/' }],
    }
    const convertedState = {
      global_on: true,
      mode: 'redirector',
      interceptor_matching_content: [{ match_url: '/old-api' }],
      redirector_matching_content: [{ redirect_url: 'https://target.test/' }],
    }
    const legacyKeys = ['globalSwitchOn', 'mode', 'proxy_routes', 'redirect']
    mocks.getStorageSnapshot.mockReturnValue(legacySnapshot)
    mocks.onLoadForDataConversion.mockReturnValueOnce({
      changed: true,
      data: convertedState,
      changeKeywords: legacyKeys,
    })
    vi.stubGlobal('chrome', {
      runtime: {
        connect: vi.fn(() => createRuntimePort()),
        getURL: (path: string) => `chrome-extension://test/${path}`,
      },
      storage: { onChanged: { addListener: mocks.onChangedAddListener } },
    })
    trackContentEventListeners()

    await importContent()
    await vi.waitFor(() => expect(mocks.setStorage).toHaveBeenCalledTimes(4))

    expect(mocks.onLoadForDataConversion).toHaveBeenCalledExactlyOnceWith(legacySnapshot)
    expect(mocks.setStorage.mock.calls).toEqual([
      ['global-switch', true],
      ['mode', 'redirector'],
      ['intercept-list', convertedState.interceptor_matching_content],
      ['redirect-list', convertedState.redirector_matching_content],
    ])
    expect(mocks.removeStorage).toHaveBeenCalledExactlyOnceWith(legacyKeys)
  })

  it('forwards valid legacy and V3 page events using their corresponding notice keys', async () => {
    mocks.initStorage.mockResolvedValue(undefined)
    mocks.getStorageSnapshot.mockReturnValue({})
    vi.stubGlobal('chrome', {
      runtime: {
        connect: vi.fn(() => createRuntimePort()),
        getURL: (path: string) => `chrome-extension://test/${path}`,
      },
      storage: { onChanged: { addListener: mocks.onChangedAddListener } },
    })
    trackContentEventListeners()

    await importContent()
    await vi.waitFor(() => expect(mocks.noticeServiceWorkerByContent).toHaveBeenCalled())
    mocks.noticeServiceWorkerByContent.mockClear()

    for (const [detail] of validEvents) dispatchContentEvent(detail)

    expect(mocks.noticeServiceWorkerByContent.mock.calls).toEqual(
      validEvents.map(([detail, key]) => [key, detail])
    )
  })

  it('does not forward malformed or forged page events', async () => {
    mocks.initStorage.mockResolvedValue(undefined)
    mocks.getStorageSnapshot.mockReturnValue({})
    vi.stubGlobal('chrome', {
      runtime: {
        connect: vi.fn(() => createRuntimePort()),
        getURL: (path: string) => `chrome-extension://test/${path}`,
      },
      storage: { onChanged: { addListener: mocks.onChangedAddListener } },
    })
    trackContentEventListeners()

    await importContent()
    await vi.waitFor(() => expect(mocks.noticeServiceWorkerByContent).toHaveBeenCalled())
    mocks.noticeServiceWorkerByContent.mockClear()

    const getterPayload = Object.defineProperty({}, 'match_url', {
      enumerable: true,
      get() {
        throw new Error('page getter must not escape validation')
      },
    })
    const proxyPayload = new Proxy(
      { kind: 'v3-hit', rule_id: 'rule-a', match_url: '/api', method: 'GET' },
      {
        ownKeys() {
          throw new Error('forged proxy payload')
        },
      }
    )
    const malformed = [
      null,
      getterPayload,
      { match_url: '/api', method: 'get' },
      { kind: 'v3-hit', rule_id: 'rule-a', match_url: '/api', method: 'get' },
      { ...validEvents[2][0], private_url: 'https://secret.test/?token=secret' },
      { ...validEvents[3][0], rules: [{ rule_id: 'rule-a', reason: 'unknown-reason' }] },
      { ...validEvents[4][0], unexpected: 'forged' },
      proxyPayload,
    ]

    for (const detail of malformed) dispatchContentEvent(detail)

    expect(mocks.noticeServiceWorkerByContent).not.toHaveBeenCalled()
  })
})
