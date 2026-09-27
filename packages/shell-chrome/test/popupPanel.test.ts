import { afterEach, describe, expect, it, vi } from 'vitest'

type MockWindow = {
  id: number
  type: 'normal' | 'popup'
  state?: string
  left?: number
  top?: number
  width?: number
  height?: number
  focused?: boolean
  tabs?: Array<{ id: number; url?: string; active?: boolean; status?: string; discarded?: boolean }>
}

const panelUrl = 'chrome-extension://test-extension/panels/index.html'

function installChrome(
  initialWindows: MockWindow[] = [],
  initialTabs: Array<Record<string, unknown>> = []
) {
  let windows = initialWindows
  let tabs = initialTabs.length
    ? initialTabs
    : initialWindows.flatMap((window) =>
        (window.tabs ?? []).map((tab) => ({ ...tab, windowId: window.id }))
      )
  let nextWindowId = 100
  let lastError: { message: string } | undefined
  const windowsGetAll = vi.fn((_options: unknown, callback: (windows: MockWindow[]) => void) =>
    callback(windows)
  )
  const windowsCreate = vi.fn(
    (options: Record<string, unknown>, callback: (window: MockWindow) => void) => {
      const created: MockWindow = {
        id: nextWindowId++,
        type: options.type as 'normal' | 'popup',
        state: options.state as string,
        left: options.left as number,
        top: options.top as number,
        width: options.width as number,
        height: options.height as number,
        focused: options.focused as boolean,
        tabs: [
          { id: nextWindowId + 1000, url: options.url as string, active: true, status: 'complete' },
        ],
      }
      windows = [...windows, created]
      tabs = [...tabs, ...(created.tabs ?? []).map((tab) => ({ ...tab, windowId: created.id }))]
      callback(created)
    }
  )
  const windowsUpdate = vi.fn(
    (id: number, options: Record<string, unknown>, callback: (window?: MockWindow) => void) => {
      windows = windows.map((window) => (window.id === id ? { ...window, ...options } : window))
      callback(windows.find((window) => window.id === id))
    }
  )
  const windowsRemove = vi.fn((id: number, callback: () => void) => {
    windows = windows.filter((window) => window.id !== id)
    callback()
  })
  const tabsQuery = vi.fn(
    (_query: unknown, callback: (tabs: Array<Record<string, unknown>>) => void) => callback(tabs)
  )
  const tabsUpdate = vi.fn(
    (
      id: number,
      options: Record<string, unknown>,
      callback: (tab?: Record<string, unknown>) => void
    ) => {
      tabs = tabs.map((tab) => (tab.id === id ? { ...tab, ...options } : tab))
      callback(tabs.find((tab) => tab.id === id))
    }
  )
  const runtimeSendMessage = vi.fn(() => Promise.resolve(undefined))
  vi.stubGlobal('chrome', {
    runtime: {
      get lastError() {
        return lastError
      },
      getURL: (path: string) => `chrome-extension://test-extension/${path}`,
      sendMessage: runtimeSendMessage,
    },
    windows: {
      getAll: windowsGetAll,
      getLastFocused: vi.fn((_options: unknown, callback: (window: MockWindow) => void) =>
        callback(
          windows.find((window) => window.type === 'normal') ?? {
            id: 1,
            type: 'normal',
            left: 0,
            top: 0,
            width: 1280,
            height: 900,
          }
        )
      ),
      create: windowsCreate,
      update: windowsUpdate,
      remove: windowsRemove,
    },
    tabs: { query: tabsQuery, update: tabsUpdate },
  })
  return {
    windowsGetAll,
    windowsCreate,
    windowsUpdate,
    windowsRemove,
    tabsQuery,
    tabsUpdate,
    runtimeSendMessage,
    setWindows(value: MockWindow[]) {
      windows = value
      tabs = value.flatMap((window) =>
        (window.tabs ?? []).map((tab) => ({ ...tab, windowId: window.id }))
      )
    },
    setTabs(value: Array<Record<string, unknown>>) {
      tabs = value
    },
    setLastError(value?: { message: string }) {
      lastError = value
    },
    getWindows() {
      return windows
    },
  }
}

async function loadPopupPanel() {
  vi.resetModules()
  return import('../src/service-worker/popupPanel')
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('independent popup panel windows', () => {
  it('creates a normal popup with an absolute URL and centered bounds on the supplied display', async () => {
    const chromeMock = installChrome()
    const panel = await loadPopupPanel()
    await panel.openPopupPanel('panels/index.html')
    expect(chromeMock.windowsCreate).toHaveBeenCalledWith(
      {
        url: panelUrl,
        type: 'popup',
        state: 'normal',
        focused: true,
        left: 16,
        top: 30,
        width: 1248,
        height: 840,
      },
      expect.any(Function)
    )
  })

  it('centers within a smaller display even when it is left of the primary display', async () => {
    const chromeMock = installChrome()
    const panel = await loadPopupPanel()
    await panel.openPopupPanel('panels/index.html', undefined, undefined, {
      left: -1920,
      top: -120,
      width: 1200,
      height: 800,
    })
    expect(chromeMock.windowsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        left: -1920 + 16,
        top: -120 + 16,
        width: 1168,
        height: 768,
      }),
      expect.any(Function)
    )
  })

  it('reuses its popup, restores it to normal bounds and activates its tab', async () => {
    const chromeMock = installChrome([
      {
        id: 12,
        type: 'popup',
        state: 'minimized',
        left: 20,
        top: 30,
        width: 700,
        height: 500,
        tabs: [{ id: 22, url: `${panelUrl}?edit=old`, status: 'complete' }],
      },
    ])
    const panel = await loadPopupPanel()
    await panel.openPopupPanel('panels/index.html', 'rule-1', 'redirect', {
      left: 100,
      top: 50,
      width: 1600,
      height: 1000,
    })
    expect(chromeMock.windowsCreate).not.toHaveBeenCalled()
    expect(chromeMock.windowsUpdate).toHaveBeenNthCalledWith(
      1,
      12,
      { state: 'normal', focused: true },
      expect.any(Function)
    )
    expect(chromeMock.windowsUpdate).toHaveBeenNthCalledWith(
      2,
      12,
      expect.objectContaining({
        focused: true,
        left: 260,
        top: 130,
        width: 1280,
        height: 840,
      }),
      expect.any(Function)
    )
    expect(chromeMock.tabsUpdate).toHaveBeenCalledWith(22, { active: true }, expect.any(Function))
  })

  it('does not reuse a normal browser tab containing the panel URL', async () => {
    const chromeMock = installChrome(
      [],
      [{ id: 7, windowId: 2, url: panelUrl, active: true, status: 'complete' }]
    )
    const panel = await loadPopupPanel()
    await panel.openPopupPanel('panels/index.html')
    expect(chromeMock.windowsCreate).toHaveBeenCalledOnce()
    expect(chromeMock.tabsUpdate).not.toHaveBeenCalled()
  })

  it('targets edits at the reused popup tab when it is ready', async () => {
    const chromeMock = installChrome([
      {
        id: 12,
        type: 'popup',
        state: 'normal',
        tabs: [{ id: 22, url: panelUrl, status: 'complete', discarded: false }],
      },
    ])
    const panel = await loadPopupPanel()
    await panel.openPopupPanel('panels/index.html', 'rule-9', 'redirect')
    expect(chromeMock.runtimeSendMessage).toHaveBeenCalledWith({
      type: 'ajax-proxy:edit-rule',
      ruleId: 'rule-9',
      action: 'redirect',
      targetTabId: 22,
    })
  })

  it('rediscovers and reuses its popup after service worker state is reset', async () => {
    const chromeMock = installChrome([
      {
        id: 12,
        type: 'popup',
        state: 'normal',
        left: 10,
        top: 20,
        width: 800,
        height: 600,
        tabs: [{ id: 22, url: panelUrl, status: 'complete' }],
      },
    ])
    let panel = await loadPopupPanel()
    await panel.openPopupPanel('panels/index.html')
    panel = await loadPopupPanel()
    await panel.openPopupPanel('panels/index.html')
    expect(chromeMock.windowsCreate).not.toHaveBeenCalled()
    expect(chromeMock.windowsUpdate).toHaveBeenCalledTimes(4)
    expect(chromeMock.windowsGetAll).toHaveBeenCalledWith(
      { windowTypes: ['normal', 'popup'] },
      expect.any(Function)
    )
    expect(chromeMock.tabsQuery).toHaveBeenCalledWith({}, expect.any(Function))
  })

  it('deduplicates concurrent opens', async () => {
    const chromeMock = installChrome()
    let release!: (window: MockWindow) => void
    chromeMock.windowsCreate.mockImplementationOnce((_options, callback) => {
      release = callback as (window: MockWindow) => void
    })
    const panel = await loadPopupPanel()
    const first = panel.openPopupPanel('panels/index.html')
    const second = panel.openPopupPanel('panels/index.html')
    await vi.waitFor(() => expect(chromeMock.windowsCreate).toHaveBeenCalledOnce())
    const created = {
      id: 40,
      type: 'popup' as const,
      state: 'normal',
      tabs: [{ id: 1041, url: panelUrl }],
    }
    chromeMock.setWindows([created])
    chromeMock.setTabs([{ id: 1041, windowId: 40, url: panelUrl, status: 'complete' }])
    release(created)
    await Promise.all([first, second])
    expect(chromeMock.windowsCreate).toHaveBeenCalledOnce()
  })

  it('propagates Chrome API failures without creating a normal tab', async () => {
    const chromeMock = installChrome()
    chromeMock.windowsCreate.mockImplementationOnce((_options, callback) => {
      chromeMock.setLastError({ message: 'window denied' })
      callback(undefined as unknown as MockWindow)
    })
    const panel = await loadPopupPanel()
    await expect(panel.openPopupPanel('panels/index.html')).rejects.toThrow('window denied')
    expect(chromeMock.tabsUpdate).not.toHaveBeenCalled()
  })

  it('uses a deep-link URL for loading or discarded editor tabs', async () => {
    const chromeMock = installChrome([
      {
        id: 12,
        type: 'popup',
        state: 'normal',
        tabs: [{ id: 22, url: panelUrl, status: 'loading', discarded: true }],
      },
    ])
    const panel = await loadPopupPanel()
    await panel.openPopupPanel('panels/index.html', 'rule /?1', 'response')
    expect(chromeMock.tabsUpdate).toHaveBeenCalledWith(
      22,
      {
        url: `${panelUrl}?edit=rule+%2F%3F1&action=response`,
        active: true,
      },
      expect.any(Function)
    )
    expect(chromeMock.runtimeSendMessage).not.toHaveBeenCalled()
  })

  it('closes only its own popup and reports whether it found one', async () => {
    const chromeMock = installChrome([
      { id: 12, type: 'popup', focused: true, tabs: [{ id: 22, url: panelUrl }] },
      {
        id: 13,
        type: 'popup',
        tabs: [{ id: 23, url: 'chrome-extension://test-extension/other.html' }],
      },
    ])
    const panel = await loadPopupPanel()
    await expect(panel.closePopupPanel('panels/index.html')).resolves.toBe(true)
    await expect(panel.closePopupPanel('panels/index.html')).resolves.toBe(false)
    expect(chromeMock.windowsRemove).toHaveBeenCalledOnce()
    expect(chromeMock.windowsRemove).toHaveBeenCalledWith(12, expect.any(Function))
  })

  it('changes size only for its own popup', async () => {
    const chromeMock = installChrome([
      { id: 12, type: 'popup', focused: true, tabs: [{ id: 22, url: panelUrl }] },
      { id: 13, type: 'normal', tabs: [{ id: 23, url: 'https://example.test' }] },
    ])
    const panel = await loadPopupPanel()
    await expect(panel.changePopupPanelSize('panels/index.html', true)).resolves.toBe(true)
    expect(chromeMock.windowsUpdate).toHaveBeenCalledOnce()
    expect(chromeMock.windowsUpdate).toHaveBeenCalledWith(
      12,
      { state: 'fullscreen' },
      expect.any(Function)
    )
    chromeMock.setWindows([
      { id: 13, type: 'normal', tabs: [{ id: 23, url: 'https://example.test' }] },
    ])
    await expect(panel.changePopupPanelSize('panels/index.html', false)).resolves.toBe(false)
    expect(chromeMock.windowsUpdate).toHaveBeenCalledOnce()
  })
})
