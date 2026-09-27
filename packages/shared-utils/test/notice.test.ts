import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('service worker content connections', () => {
  it('accepts only plain extension message envelopes', async () => {
    const { isMessageRecord } = await import('../src/notice')

    expect(isMessageRecord({ from: 'content', to: 'worker', key: 'title', value: 'page' })).toBe(
      true
    )
    expect(isMessageRecord({ from: 'content', to: 'worker', key: 'title', injected: true })).toBe(
      false
    )
    expect(
      isMessageRecord(Object.assign(Object.create({ inherited: true }), { from: 'content' }))
    ).toBe(false)
  })

  it('rejects non-extension and non-tab ports before forwarding them', async () => {
    type TestPort = {
      sender?: { id?: string; tab?: { id: number } }
      disconnect: () => void
      onDisconnect: { addListener: (callback: () => void) => void }
    }
    let listener: ((port: TestPort) => void) | undefined
    let disconnectListener: (() => void) | undefined
    const chrome = {
      runtime: {
        id: 'extension-id',
        onConnect: {
          addListener: (callback: (port: TestPort) => void) => {
            listener = callback
          },
        },
      },
    }
    vi.stubGlobal('chrome', chrome)
    const onConnectFn = vi.fn()
    const onDisconnectFn = vi.fn()
    const { onConnectByServiceWorker } = await import('../src/notice')
    onConnectByServiceWorker(onConnectFn, onDisconnectFn)

    const disconnect = vi.fn()
    const addDisconnectListener = vi.fn((callback: () => void) => {
      disconnectListener = callback
    })
    listener?.({
      sender: { id: 'other-extension', tab: { id: 1 } },
      disconnect,
      onDisconnect: { addListener: addDisconnectListener },
    })
    listener?.({
      sender: { id: 'extension-id' },
      disconnect,
      onDisconnect: { addListener: addDisconnectListener },
    })
    expect(disconnect).toHaveBeenCalledTimes(2)
    expect(onConnectFn).not.toHaveBeenCalled()

    const validPort = {
      sender: { id: 'extension-id', tab: { id: 1 } },
      disconnect,
      onDisconnect: { addListener: addDisconnectListener },
    }
    listener?.(validPort)
    expect(onConnectFn).toHaveBeenCalledWith(validPort)
    expect(addDisconnectListener).toHaveBeenCalledOnce()
    disconnectListener?.()
    expect(onDisconnectFn).toHaveBeenCalledOnce()
  })
})

describe('notice forwarding', () => {
  it('posts a content notice to the document with the extension envelope', async () => {
    const postMessage = vi.fn()
    vi.stubGlobal('window', { postMessage })
    const { noticeDocumentByContent } = await import('../src/notice')

    noticeDocumentByContent('request', { url: '/api' })

    expect(postMessage).toHaveBeenCalledWith({
      from: 'ajax-proxy:notice:from:content',
      to: 'ajax-proxy:notice:to:document',
      key: 'request',
      value: { url: '/api' },
    })
  })

  it.each([
    ['content to worker', 'noticeServiceWorkerByContent', false],
    ['panels to worker', 'noticeServiceWorkerByPanels', true],
    ['worker to panels', 'noticePanelsByServiceWorker', false],
  ] as const)(
    'sends the %s runtime payload and consumes rejected promises',
    async (_, fnName, withId) => {
      const sendMessage = vi.fn().mockRejectedValue(new Error('receiver unavailable'))
      const runtime = { id: 'extension-id', sendMessage }
      vi.stubGlobal('chrome', { runtime })
      const notices = await import('../src/notice')
      const notify = notices[fnName] as (key: string, value: unknown) => void

      notify('state', 42)
      await Promise.resolve()

      expect(sendMessage).toHaveBeenCalledWith(...(withId ? ['extension-id'] : []), {
        from:
          fnName === 'noticePanelsByServiceWorker'
            ? 'ajax-proxy:notice:from:service-worker'
            : fnName === 'noticeServiceWorkerByPanels'
              ? 'ajax-proxy:notice:from:panels'
              : 'ajax-proxy:notice:from:content',
        to:
          fnName === 'noticePanelsByServiceWorker'
            ? 'ajax-proxy:notice:to:panels'
            : 'ajax-proxy:notice:to:service-worker',
        key: 'state',
        value: 42,
      })
    }
  )

  it('does not use runtime messaging when chrome is unavailable at module import', async () => {
    vi.stubGlobal('chrome', undefined)
    const { noticeServiceWorkerByContent } = await import('../src/notice')

    expect(() => noticeServiceWorkerByContent('state', 1)).not.toThrow()
  })
})

describe('service worker notices to content', () => {
  it('posts an enveloped notice when a port exists', async () => {
    vi.stubGlobal('chrome', { runtime: {} })
    const { noticeContentByServiceWorker } = await import('../src/notice')
    const postMessage = vi.fn()

    noticeContentByServiceWorker({ postMessage } as never, 'state' as never, 42)

    expect(postMessage).toHaveBeenCalledWith({
      from: 'ajax-proxy:notice:from:service-worker',
      to: 'ajax-proxy:notice:to:content',
      key: 'state',
      value: 42,
    })
  })

  it('does nothing when the port is absent or disconnected', async () => {
    vi.stubGlobal('chrome', { runtime: {} })
    const { noticeContentByServiceWorker } = await import('../src/notice')
    const postMessage = vi.fn(() => {
      throw new Error('disconnected')
    })

    expect(() => noticeContentByServiceWorker(undefined, 'state' as never, 42)).not.toThrow()
    expect(() =>
      noticeContentByServiceWorker({ postMessage } as never, 'state' as never, 42)
    ).not.toThrow()
    expect(postMessage).toHaveBeenCalledOnce()
  })
})

describe('active tab notifications', () => {
  it('preserves HTTP and HTTPS tab titles and clears titles for other pages', async () => {
    let onActivated: ((info: { tabId: number }) => void) | undefined
    const tabs = new Map<number, { id: number; url: string; title: string }>([
      [1, { id: 1, url: 'http://example.test', title: 'HTTP title' }],
      [2, { id: 2, url: 'https://example.test', title: 'HTTPS title' }],
      [3, { id: 3, url: 'chrome://extensions', title: 'Browser title' }],
    ])
    vi.stubGlobal('chrome', {
      runtime: {},
      tabs: {
        onActivated: {
          addListener: (callback) => {
            onActivated = callback
          },
        },
        get: vi.fn((id: number) => Promise.resolve(tabs.get(id))),
      },
    })
    const { onCurrentTabChanged } = await import('../src/notice')
    const callback = vi.fn()
    onCurrentTabChanged(callback)

    onActivated?.({ tabId: 1 })
    onActivated?.({ tabId: 2 })
    onActivated?.({ tabId: 3 })
    await Promise.resolve()

    expect(callback.mock.calls.map(([tab]) => tab.title)).toEqual(['HTTP title', 'HTTPS title', ''])
  })

  it('does not call back when tabs.get rejects', async () => {
    let onActivated: ((info: { tabId: number }) => void) | undefined
    vi.stubGlobal('chrome', {
      runtime: {},
      tabs: {
        onActivated: {
          addListener: (callback) => {
            onActivated = callback
          },
        },
        get: vi.fn().mockRejectedValue(new Error('tab unavailable')),
      },
    })
    const { onCurrentTabChanged } = await import('../src/notice')
    const callback = vi.fn()
    onCurrentTabChanged(callback)

    onActivated?.({ tabId: 1 })
    await Promise.resolve()

    expect(callback).not.toHaveBeenCalled()
  })
})
