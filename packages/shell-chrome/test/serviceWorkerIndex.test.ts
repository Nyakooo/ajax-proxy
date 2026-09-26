import { afterEach, describe, expect, it, vi } from 'vitest'
import { NoticeFrom, NoticeKey, NoticeTo, StorageKey } from '@proxy/shared-utils'
import { INIT_CURRENT_TITLE } from '../src/consts'

type MessageListener = (message: unknown, sender: chrome.runtime.MessageSender) => unknown
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
  it('rejects tab-less content messages, isolates rejection, and routes XHR outcomes', async () => {
    const storageReady = deferred<void>()
    const runtimeListeners: MessageListener[] = []
    const noticePanelsByServiceWorker = vi.fn()
    const notifyV3FunctionError = vi.fn().mockRejectedValue(new Error('notification failed'))
    const notifyV3NoMatch = vi.fn().mockResolvedValue(undefined)
    const notifyV3FetchOutcome = vi.fn().mockResolvedValue(undefined)
    const notifyV3XHROutcome = vi.fn().mockResolvedValue(undefined)
    const chromeBadge = vi.fn()
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
      action: { setIcon: vi.fn() },
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
    vi.doMock('../src/service-worker/notice', () => ({ useCurrentTitle: vi.fn(() => '') }))
    vi.doMock('../src/service-worker/init', () => ({ initDefaultSth: vi.fn() }))
    vi.doMock('../src/service-worker/event', () => ({ injectEventListener: vi.fn() }))
    vi.doMock('../src/service-worker/badge', () => ({ chromeBadge }))
    vi.doMock('../src/service-worker/v3Hit', () => ({ chromeBadgeV3: vi.fn() }))
    vi.doMock('../src/service-worker/v3FunctionError', () => ({ notifyV3FunctionError }))
    vi.doMock('../src/service-worker/v3NoMatch', () => ({ notifyV3NoMatch }))
    vi.doMock('../src/service-worker/v3FetchOutcome', () => ({ notifyV3FetchOutcome }))
    vi.doMock('../src/service-worker/v3XHROutcome', () => ({ notifyV3XHROutcome }))
    vi.doMock('../src/service-worker/v3Panel', () => ({
      createV3PanelStartupMessageHandler: vi.fn(() => vi.fn(() => false)),
    }))

    await import('../src/service-worker/index')
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

    const contentSender = { id: 'test-extension', tab: { id: 1 } }
    const functionError = {
      rule_id: 'rule-a',
      match_url: '/api/items',
      method: 'POST',
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
