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
}))
const contentEventListeners = new Set<EventListener>()

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
  onLoadForDataConversion: (data: Record<string, unknown>) => ({
    changed: false,
    data,
    changeKeywords: [],
  }),
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

async function importContent() {
  await import('../src/content')
  await Promise.resolve()
}

function trackContentEventListeners() {
  const addEventListener = window.addEventListener.bind(window)
  return vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
    if (type === 'to-content' && typeof listener === 'function') {
      contentEventListeners.add(listener as EventListener)
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
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.resetModules()
  vi.clearAllMocks()
  document.documentElement.innerHTML = '<head></head><body></body>'
})

describe('content page-event bridge', () => {
  it('waits for storage initialization before registering listeners or sending notices', async () => {
    const storageReady = deferred<void>()
    mocks.initStorage.mockReturnValue(storageReady.promise)
    mocks.getStorageSnapshot.mockReturnValue({})
    const runtimeConnect = vi.fn()
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
    expect(mocks.onChangedAddListener).toHaveBeenCalledOnce()
    expect(addEventListener.mock.calls.some(([type]) => type === 'to-content')).toBe(true)
  })

  it('forwards valid legacy and V3 page events using their corresponding notice keys', async () => {
    mocks.initStorage.mockResolvedValue(undefined)
    mocks.getStorageSnapshot.mockReturnValue({})
    vi.stubGlobal('chrome', {
      runtime: {
        connect: vi.fn(),
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
        connect: vi.fn(),
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
