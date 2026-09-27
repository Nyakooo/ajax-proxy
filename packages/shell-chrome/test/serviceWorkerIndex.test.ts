import { afterEach, describe, expect, it, vi } from 'vitest'
import { NoticeFrom, NoticeKey, NoticeTo, StorageKey } from '@proxy/shared-utils'
import { V3PanelMessageKey } from '@proxy/protocol'
import { INIT_CURRENT_TITLE } from '../src/consts'

type MessageListener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse?: (response?: unknown) => void
) => unknown
type ActionClickListener = (tab: chrome.tabs.Tab) => void
type CommandListener = (command: string) => void
type StorageChangeListener = (
  changes: Record<string, { newValue?: unknown; oldValue?: unknown }>,
  areaName: string
) => void

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
  vi.doUnmock('@proxy/shared-utils')
  vi.doUnmock('../src/service-worker/notice')
  vi.doUnmock('../src/service-worker/init')
  vi.doUnmock('../src/service-worker/event')
  vi.doUnmock('../src/service-worker/badge')
  vi.doUnmock('../src/service-worker/v3Hit')
  vi.doUnmock('../src/service-worker/v3FunctionError')
  vi.doUnmock('../src/service-worker/v3NoMatch')
  vi.doUnmock('../src/service-worker/v3FetchOutcome')
  vi.doUnmock('../src/service-worker/v3XHROutcome')
  vi.doUnmock('../src/service-worker/v3Panel')
})

describe('service worker message entry', () => {
  it('returns the V3 panel startup handler result from the first runtime listener', async () => {
    const storageReady = deferred<void>()
    const runtimeListeners: MessageListener[] = []
    const storageChangeListeners: StorageChangeListener[] = []
    const startupHandler = vi.fn(() => true)
    const createStartupHandler = vi.fn(() => startupHandler)
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'test-extension',
        getURL: vi.fn(() => 'chrome-extension://test-extension/'),
        onMessage: {
          addListener: vi.fn((listener: MessageListener) => runtimeListeners.push(listener)),
        },
      },
      storage: {
        onChanged: {
          addListener: vi.fn((listener: StorageChangeListener) =>
            storageChangeListeners.push(listener)
          ),
        },
      },
      action: { onClicked: { addListener: vi.fn() } },
      commands: { onCommand: { addListener: vi.fn() } },
    })
    vi.doMock('@proxy/shared-utils', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@proxy/shared-utils')>()
      return { ...actual, initStorage: vi.fn(() => storageReady.promise) }
    })
    vi.doMock('../src/service-worker/event', () => ({ injectEventListener: vi.fn() }))
    vi.doMock('../src/service-worker/notice', () => ({ useCurrentTitle: vi.fn() }))
    vi.doMock('../src/service-worker/init', () => ({ initDefaultSth: vi.fn() }))
    vi.doMock('../src/service-worker/badge', () => ({ chromeBadge: vi.fn() }))
    vi.doMock('../src/service-worker/v3Hit', () => ({ chromeBadgeV3: vi.fn() }))
    vi.doMock('../src/service-worker/v3FunctionError', () => ({ notifyV3FunctionError: vi.fn() }))
    vi.doMock('../src/service-worker/v3NoMatch', () => ({ notifyV3NoMatch: vi.fn() }))
    vi.doMock('../src/service-worker/v3FetchOutcome', () => ({ notifyV3FetchOutcome: vi.fn() }))
    vi.doMock('../src/service-worker/v3XHROutcome', () => ({ notifyV3XHROutcome: vi.fn() }))
    vi.doMock('../src/service-worker/v3Panel', () => ({
      createV3PanelStartupMessageHandler: createStartupHandler,
    }))

    await import('../src/service-worker/index')
    expect(runtimeListeners).toHaveLength(1)
    const message = { type: 'v3-panel-startup' }
    const sender = { id: 'test-extension' } as chrome.runtime.MessageSender
    const sendResponse = vi.fn()
    expect(runtimeListeners[0](message, sender, sendResponse)).toBe(true)
    expect(startupHandler).toHaveBeenCalledExactlyOnceWith(message, sender, sendResponse)

    startupHandler.mockReturnValue(false)
    expect(runtimeListeners[0](message, sender, sendResponse)).toBe(false)
    expect(startupHandler).toHaveBeenCalledTimes(2)

    storageReady.resolve()
    await vi.waitFor(() => {
      expect(runtimeListeners).toHaveLength(2)
      expect(storageChangeListeners).toHaveLength(1)
    })
  })

  it('logs storage initialization rejection without running successful initialization', async () => {
    const storageFailure = new Error('storage unavailable')
    const runtimeListeners: MessageListener[] = []
    const storageChangeListeners: StorageChangeListener[] = []
    const initDefaultSth = vi.fn()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'test-extension',
        getURL: vi.fn(() => 'chrome-extension://test-extension/'),
        onMessage: {
          addListener: vi.fn((listener: MessageListener) => runtimeListeners.push(listener)),
        },
      },
      storage: {
        onChanged: {
          addListener: vi.fn((listener: StorageChangeListener) =>
            storageChangeListeners.push(listener)
          ),
        },
      },
      action: { onClicked: { addListener: vi.fn() } },
      commands: { onCommand: { addListener: vi.fn() } },
    })
    vi.doMock('@proxy/shared-utils', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@proxy/shared-utils')>()
      return { ...actual, initStorage: vi.fn().mockRejectedValue(storageFailure) }
    })
    vi.doMock('../src/service-worker/event', () => ({ injectEventListener: vi.fn() }))
    vi.doMock('../src/service-worker/notice', () => ({ useCurrentTitle: vi.fn() }))
    vi.doMock('../src/service-worker/init', () => ({ initDefaultSth }))
    vi.doMock('../src/service-worker/badge', () => ({ chromeBadge: vi.fn() }))
    vi.doMock('../src/service-worker/v3Hit', () => ({ chromeBadgeV3: vi.fn() }))
    vi.doMock('../src/service-worker/v3FunctionError', () => ({ notifyV3FunctionError: vi.fn() }))
    vi.doMock('../src/service-worker/v3NoMatch', () => ({ notifyV3NoMatch: vi.fn() }))
    vi.doMock('../src/service-worker/v3FetchOutcome', () => ({ notifyV3FetchOutcome: vi.fn() }))
    vi.doMock('../src/service-worker/v3XHROutcome', () => ({ notifyV3XHROutcome: vi.fn() }))

    await import('../src/service-worker/index')
    await vi.waitFor(() =>
      expect(consoleError).toHaveBeenCalledExactlyOnceWith(
        '[AjaxProxy] Service worker storage initialization failed',
        storageFailure
      )
    )
    expect(runtimeListeners).toHaveLength(1)
    expect(storageChangeListeners).toHaveLength(0)
    expect(initDefaultSth).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('validates and routes content hit and outcome messages', async () => {
    const storageReady = deferred<void>()
    const runtimeListeners: MessageListener[] = []
    const noticePanelsByServiceWorker = vi.fn()
    const useCurrentTitle = vi.fn(() => 'Current page title')
    const notifyV3FunctionError = vi.fn().mockRejectedValue(new Error('notification failed'))
    const notifyV3NoMatch = vi.fn().mockResolvedValue(undefined)
    const notifyV3FetchOutcome = vi.fn().mockResolvedValue(undefined)
    const notifyV3XHROutcome = vi.fn().mockResolvedValue(undefined)
    const chromeBadge = vi.fn()
    const chromeBadgeV3 = vi.fn()
    const actionClickListeners: ActionClickListener[] = []
    const commandListeners: CommandListener[] = []
    const storageChangeListeners: StorageChangeListener[] = []
    const chromeMock = {
      runtime: {
        id: 'test-extension',
        getURL: vi.fn((path: string) => `chrome-extension://test-extension/${path}`),
        onMessage: {
          addListener: vi.fn((listener: MessageListener) => runtimeListeners.push(listener)),
        },
      },
      storage: {
        onChanged: {
          addListener: vi.fn((listener: StorageChangeListener) =>
            storageChangeListeners.push(listener)
          ),
        },
      },
      action: {
        onClicked: {
          addListener: vi.fn((listener: ActionClickListener) =>
            actionClickListeners.push(listener)
          ),
        },
        setIcon: vi.fn(),
      },
      commands: {
        onCommand: {
          addListener: vi.fn((listener: CommandListener) => commandListeners.push(listener)),
        },
      },
      windows: { create: vi.fn() },
    }
    vi.stubGlobal('chrome', chromeMock)

    vi.doMock('@proxy/shared-utils', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@proxy/shared-utils')>()
      return {
        ...actual,
        initStorage: vi.fn(() => storageReady.promise),
        noticePanelsByServiceWorker,
      }
    })
    vi.doMock('../src/service-worker/notice', () => ({ useCurrentTitle }))
    vi.doMock('../src/service-worker/init', () => ({ initDefaultSth: vi.fn() }))
    vi.doMock('../src/service-worker/badge', () => ({ chromeBadge }))
    vi.doMock('../src/service-worker/v3Hit', () => ({ chromeBadgeV3 }))
    vi.doMock('../src/service-worker/v3FunctionError', () => ({ notifyV3FunctionError }))
    vi.doMock('../src/service-worker/v3NoMatch', () => ({ notifyV3NoMatch }))
    vi.doMock('../src/service-worker/v3FetchOutcome', () => ({ notifyV3FetchOutcome }))
    vi.doMock('../src/service-worker/v3XHROutcome', () => ({ notifyV3XHROutcome }))
    vi.doMock('../src/service-worker/v3Panel', () => ({
      createV3PanelStartupMessageHandler: vi.fn(() => vi.fn(() => false)),
    }))

    await import('../src/service-worker/index')
    expect(actionClickListeners).toHaveLength(1)
    expect(commandListeners).toHaveLength(1)
    actionClickListeners[0]({} as chrome.tabs.Tab)
    expect(chromeMock.windows.create).toHaveBeenCalledOnce()
    chromeMock.windows.create.mockClear()
    commandListeners[0]('open_panel')
    expect(chromeMock.windows.create).toHaveBeenCalledOnce()

    storageReady.resolve()
    await vi.waitFor(() => expect(runtimeListeners).toHaveLength(2))
    await vi.waitFor(() => expect(storageChangeListeners).toHaveLength(1))

    const onStorageChanged = storageChangeListeners[0]
    onStorageChanged({ [StorageKey.V3_CONFIG]: { newValue: {} } }, 'local')
    onStorageChanged({ [StorageKey.V3_HITS]: { newValue: {} } }, 'local')
    expect(chromeBadge).toHaveBeenCalledTimes(2)

    chromeBadge.mockClear()
    onStorageChanged({ [StorageKey.V3_CONFIG]: { newValue: {} } }, 'sync')
    onStorageChanged({ unrelated: { newValue: true } }, 'local')
    expect(chromeBadge).not.toHaveBeenCalled()

    const listener = runtimeListeners[1]
    const globalSwitchMessage = {
      from: NoticeFrom.PANELS,
      to: NoticeTo.SERVICE_WORKER,
      key: NoticeKey.GLOBAL_SWITCH,
      value: false,
    }
    listener(globalSwitchMessage, {
      id: 'other-extension',
      url: 'chrome-extension://test-extension/panels/index.html',
    } as chrome.runtime.MessageSender)
    listener(globalSwitchMessage, {
      id: 'test-extension',
      url: 'https://example.test/panels/index.html',
    } as chrome.runtime.MessageSender)
    expect(chromeMock.action.setIcon).not.toHaveBeenCalled()
    expect(chromeBadge).not.toHaveBeenCalled()

    listener(globalSwitchMessage, {
      id: 'test-extension',
      url: 'chrome-extension://test-extension/panels/index.html',
    } as chrome.runtime.MessageSender)
    expect(chromeMock.action.setIcon).toHaveBeenCalledExactlyOnceWith({ path: 'icons/128g.png' })
    expect(chromeBadge).toHaveBeenCalledOnce()

    chromeBadge.mockClear()
    chromeMock.action.setIcon.mockClear()
    listener(
      {
        from: NoticeFrom.PANELS,
        to: NoticeTo.SERVICE_WORKER,
        key: NoticeKey.GLOBAL_SWITCH,
        value: true,
      },
      {
        id: 'test-extension',
        url: 'chrome-extension://test-extension/panels/index.html',
      } as chrome.runtime.MessageSender
    )
    expect(chromeMock.action.setIcon).toHaveBeenCalledExactlyOnceWith({ path: 'icons/128.png' })
    expect(chromeBadge).toHaveBeenCalledOnce()

    chromeBadge.mockClear()
    chromeMock.action.setIcon.mockClear()
    const trustedPanelSender = {
      id: 'test-extension',
      url: 'chrome-extension://test-extension/panels/index.html',
    } as chrome.runtime.MessageSender
    const v3PanelSnapshotRequest = {
      from: NoticeFrom.PANELS,
      to: NoticeTo.SERVICE_WORKER,
      key: V3PanelMessageKey.GET_SNAPSHOT,
    }
    listener(v3PanelSnapshotRequest, trustedPanelSender)
    expect(chromeBadge).not.toHaveBeenCalled()
    expect(useCurrentTitle).not.toHaveBeenCalled()
    expect(noticePanelsByServiceWorker).not.toHaveBeenCalled()

    for (const [key, value] of [
      [NoticeKey.BADGE_STATUS, null],
      [NoticeKey.MODE, 'interceptor'],
      [NoticeKey.INTERCEPT_LIST, [{ match_url: '/api', switch_on: true }]],
      [
        NoticeKey.REDIRECT_LIST,
        [{ domain: 'example.test', redirect_url: '/new', switch_on: true }],
      ],
    ] as const) {
      listener(
        { from: NoticeFrom.PANELS, to: NoticeTo.SERVICE_WORKER, key, value },
        trustedPanelSender
      )
    }
    expect(chromeBadge).toHaveBeenCalledTimes(4)
    expect(chromeBadge.mock.calls).toEqual([[], [], [], []])
    expect(chromeMock.action.setIcon).not.toHaveBeenCalled()

    chromeBadge.mockClear()
    const invalidPanelMessages = [
      { key: NoticeKey.MODE, value: 'invalid-mode' },
      { key: NoticeKey.INTERCEPT_LIST, value: [{ match_url: '/api', switch_on: 'yes' }] },
      {
        key: NoticeKey.REDIRECT_LIST,
        value: [{ domain: 'example.test', redirect_url: '', switch_on: true }],
      },
      { key: NoticeKey.GLOBAL_SWITCH, value: 'true' },
    ]
    for (const { key, value } of invalidPanelMessages) {
      listener(
        { from: NoticeFrom.PANELS, to: NoticeTo.SERVICE_WORKER, key, value },
        trustedPanelSender
      )
    }
    expect(chromeBadge).not.toHaveBeenCalled()
    expect(chromeMock.action.setIcon).not.toHaveBeenCalled()

    useCurrentTitle.mockClear()
    noticePanelsByServiceWorker.mockClear()
    listener(
      {
        from: NoticeFrom.PANELS,
        to: NoticeTo.SERVICE_WORKER,
        key: NoticeKey.GET_CURRENT_TITLE,
        value: undefined,
      },
      trustedPanelSender
    )
    expect(useCurrentTitle).toHaveBeenCalledOnce()
    expect(noticePanelsByServiceWorker).toHaveBeenCalledExactlyOnceWith(
      NoticeKey.GET_CURRENT_TITLE,
      'Current page title'
    )
    noticePanelsByServiceWorker.mockClear()

    const contentSender = { id: 'test-extension', tab: { id: 1 } }
    chromeBadge.mockClear()

    const pageBadgeHit = { match_url: '/api/items', method: 'GET', url: '/api/items/1' }
    const v3Hit = {
      kind: 'v3-hit',
      rule_id: 'rule-a',
      match_url: '/api/items',
      method: 'GET',
      url: '/api/items/1',
    }
    const v3NoMatch = {
      kind: 'v3-no-match',
      method: 'GET',
      rules: [{ rule_id: 'rule-a', reason: 'method-mismatch' }],
      truncated: false,
    }
    const fetchOutcome = {
      kind: 'v3-fetch-outcome',
      correlation_id: 'fetch-1',
      rule_id: 'rule-a',
      stage: 'request',
      outcome: 'applied',
      reason: 'redirect-applied',
    }

    listener(
      {
        from: NoticeFrom.CONTENT,
        to: NoticeTo.SERVICE_WORKER,
        key: NoticeKey.BADGE_STATUS,
        value: pageBadgeHit,
      },
      contentSender
    )
    listener(
      {
        from: NoticeFrom.CONTENT,
        to: NoticeTo.SERVICE_WORKER,
        key: NoticeKey.V3_HIT,
        value: v3Hit,
      },
      contentSender
    )
    expect(chromeBadge).toHaveBeenCalledExactlyOnceWith(pageBadgeHit)
    expect(chromeBadgeV3).toHaveBeenCalledExactlyOnceWith(v3Hit)

    chromeBadge.mockClear()
    chromeBadgeV3.mockClear()
    listener(
      {
        from: NoticeFrom.CONTENT,
        to: NoticeTo.SERVICE_WORKER,
        key: NoticeKey.BADGE_STATUS,
        value: { ...pageBadgeHit, unexpected: true },
      },
      contentSender
    )
    listener(
      {
        from: NoticeFrom.CONTENT,
        to: NoticeTo.SERVICE_WORKER,
        key: NoticeKey.V3_HIT,
        value: { ...v3Hit, unexpected: true },
      },
      contentSender
    )
    listener(
      {
        from: NoticeFrom.CONTENT,
        to: NoticeTo.SERVICE_WORKER,
        key: NoticeKey.V3_HIT,
        value: { ...v3Hit, method: 'get' },
      },
      contentSender
    )
    expect(chromeBadge).not.toHaveBeenCalled()
    expect(chromeBadgeV3).not.toHaveBeenCalled()

    listener(
      {
        from: NoticeFrom.CONTENT,
        to: NoticeTo.SERVICE_WORKER,
        key: NoticeKey.V3_NO_MATCH,
        value: v3NoMatch,
      },
      contentSender
    )
    listener(
      {
        from: NoticeFrom.CONTENT,
        to: NoticeTo.SERVICE_WORKER,
        key: NoticeKey.V3_FETCH_OUTCOME,
        value: fetchOutcome,
      },
      contentSender
    )
    await vi.waitFor(() => expect(notifyV3NoMatch).toHaveBeenCalledExactlyOnceWith(v3NoMatch))
    await vi.waitFor(() =>
      expect(notifyV3FetchOutcome).toHaveBeenCalledExactlyOnceWith(fetchOutcome)
    )
    notifyV3NoMatch.mockClear()
    notifyV3FetchOutcome.mockClear()

    const functionError = {
      rule_id: 'rule-a',
      match_url: '/api/items',
      method: 'POST',
      action: 'response',
      code: 'execution-failed',
    }

    listener(
      {
        from: NoticeFrom.CONTENT,
        to: NoticeTo.SERVICE_WORKER,
        key: NoticeKey.V3_FUNCTION_ERROR,
        value: functionError,
      },
      { id: 'test-extension' } as chrome.runtime.MessageSender
    )
    expect(notifyV3FunctionError).not.toHaveBeenCalled()
    expect(notifyV3NoMatch).not.toHaveBeenCalled()
    expect(notifyV3FetchOutcome).not.toHaveBeenCalled()
    expect(notifyV3XHROutcome).not.toHaveBeenCalled()
    expect(noticePanelsByServiceWorker).not.toHaveBeenCalled()

    listener(
      {
        from: NoticeFrom.CONTENT,
        to: NoticeTo.SERVICE_WORKER,
        key: NoticeKey.V3_FUNCTION_ERROR,
        value: functionError,
      },
      contentSender
    )
    await vi.waitFor(() =>
      expect(notifyV3FunctionError).toHaveBeenCalledExactlyOnceWith(functionError)
    )

    listener(
      {
        from: NoticeFrom.CONTENT,
        to: NoticeTo.SERVICE_WORKER,
        key: INIT_CURRENT_TITLE,
        value: 'After rejection',
      },
      contentSender
    )

    expect(noticePanelsByServiceWorker).toHaveBeenCalledExactlyOnceWith(
      NoticeKey.GET_CURRENT_TITLE,
      'After rejection'
    )

    listener(
      {
        from: NoticeFrom.CONTENT,
        to: NoticeTo.SERVICE_WORKER,
        key: INIT_CURRENT_TITLE,
        value: 'a'.repeat(8192),
      },
      contentSender
    )
    expect(noticePanelsByServiceWorker).toHaveBeenNthCalledWith(
      2,
      NoticeKey.GET_CURRENT_TITLE,
      'a'.repeat(8192)
    )

    listener(
      {
        from: NoticeFrom.CONTENT,
        to: NoticeTo.SERVICE_WORKER,
        key: INIT_CURRENT_TITLE,
        value: 'a'.repeat(8193),
      },
      contentSender
    )
    expect(noticePanelsByServiceWorker).toHaveBeenCalledTimes(2)

    const xhrOutcome = {
      kind: 'v3-xhr-outcome',
      correlation_id: 'xhr-1',
      rule_id: 'rule-a',
      stage: 'request',
      outcome: 'applied',
      reason: 'redirect-applied',
    }
    listener(
      {
        from: NoticeFrom.CONTENT,
        to: NoticeTo.SERVICE_WORKER,
        key: NoticeKey.V3_FETCH_OUTCOME,
        value: xhrOutcome,
      },
      contentSender
    )
    await vi.waitFor(() => expect(notifyV3XHROutcome).toHaveBeenCalledExactlyOnceWith(xhrOutcome))
    expect(notifyV3FetchOutcome).not.toHaveBeenCalled()
    await Promise.resolve()
  })
})
