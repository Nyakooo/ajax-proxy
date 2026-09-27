import { afterEach, describe, expect, it, vi } from 'vitest'

type WindowLike = {
  id: number
  type?: string
  state?: string
  focused?: boolean
}
type TabLike = {
  id: number
  windowId: number
  url?: string
  active?: boolean
  status?: string
  discarded?: boolean
}

function installChromeMock({
  windows = [{ id: 1, type: 'normal', state: 'normal', focused: true }],
  tabs = [] as TabLike[],
  lastFocusedId,
  lastFocusedError = false,
}: {
  windows?: WindowLike[]
  tabs?: TabLike[]
  lastFocusedId?: number
  lastFocusedError?: boolean
} = {}) {
  let nextTabId = 100
  let nextWindowId = 200
  let callbackError: { message: string } | undefined
  const getAll = vi.fn((_options: object, callback: (value: WindowLike[]) => void) =>
    callback(windows)
  )
  const getLastFocused = vi.fn((_options: object, callback: (value: WindowLike) => void) => {
    if (lastFocusedError) callbackError = { message: 'No last-focused window available' }
    callback(windows.find((window) => window.id === lastFocusedId) ?? windows[0])
  })
  const query = vi.fn((_query: object, callback: (value: TabLike[]) => void) => callback(tabs))
  const updateTab = vi.fn((id: number, options: object, callback: (value: TabLike) => void) => {
    const tab = tabs.find((item) => item.id === id)!
    Object.assign(tab, options)
    tabs.forEach((item) => {
      item.active = item.id === id
    })
    callback(tab)
  })
  const createTab = vi.fn(
    (
      options: { url: string; windowId: number; active?: boolean },
      callback: (value: TabLike) => void
    ) => {
      const tab = {
        id: nextTabId++,
        windowId: options.windowId,
        url: options.url,
        active: options.active,
      }
      tabs.push(tab)
      callback(tab)
    }
  )
  const removeTab = vi.fn((id: number, callback: () => void) => {
    const index = tabs.findIndex((item) => item.id === id)
    if (index >= 0) tabs.splice(index, 1)
    callback()
  })
  const updateWindow = vi.fn(
    (id: number, options: object, callback: (value: WindowLike) => void) => {
      const window = windows.find((item) => item.id === id)!
      Object.assign(window, options)
      callback(window)
    }
  )
  const createWindow = vi.fn((options: object, callback: (value: WindowLike) => void) => {
    const window = { id: nextWindowId++, type: 'normal', state: 'normal', focused: true }
    windows.push(window)
    callback(window)
  })
  const sendMessage = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('chrome', {
    runtime: {
      get lastError() {
        const error = callbackError
        callbackError = undefined
        return error
      },
      getURL: (path: string) => `chrome-extension://test-extension/${path}`,
      sendMessage,
    },
    windows: { getAll, getLastFocused, update: updateWindow, create: createWindow },
    tabs: { query, update: updateTab, create: createTab, remove: removeTab },
  })
  return {
    windows,
    tabs,
    getAll,
    getLastFocused,
    query,
    updateTab,
    createTab,
    removeTab,
    updateWindow,
    createWindow,
    sendMessage,
  }
}

async function loadTabPanel() {
  vi.resetModules()
  return import('../src/service-worker/tabPanel')
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('V3 tab panel', () => {
  it('creates an active panel tab in the last focused normal window and focuses that window', async () => {
    const mock = installChromeMock({
      windows: [
        { id: 1, type: 'normal', state: 'normal' },
        { id: 2, type: 'normal', state: 'normal' },
      ],
      lastFocusedId: 2,
    })
    const panel = await loadTabPanel()

    await panel.openTabPanel('panels/v3/index.html')

    expect(mock.createTab).toHaveBeenCalledWith(
      {
        url: 'chrome-extension://test-extension/panels/v3/index.html',
        windowId: 2,
        active: true,
      },
      expect.any(Function)
    )
    expect(mock.updateTab).toHaveBeenCalledWith(100, { active: true }, expect.any(Function))
    expect(mock.updateWindow).toHaveBeenCalledWith(2, { focused: true }, expect.any(Function))
  })

  it('ignores an old panel tab in a popup window', async () => {
    const mock = installChromeMock({
      windows: [
        { id: 1, type: 'normal', state: 'normal', focused: true },
        { id: 2, type: 'popup', state: 'normal' },
      ],
      tabs: [
        {
          id: 5,
          windowId: 2,
          url: 'chrome-extension://test-extension/panels/v3/index.html',
          active: true,
        },
      ],
    })
    const panel = await loadTabPanel()

    await panel.openTabPanel('panels/v3/index.html')

    expect(mock.createTab).toHaveBeenCalledOnce()
    expect(mock.createTab.mock.calls[0][0]).toMatchObject({ windowId: 1, active: true })
    expect(mock.updateTab).not.toHaveBeenCalledWith(5, expect.anything(), expect.anything())
  })

  it('rediscovers an existing normal panel tab after module reload and focuses it', async () => {
    const mock = installChromeMock({
      windows: [{ id: 1, type: 'normal', state: 'normal', focused: true }],
      tabs: [
        {
          id: 7,
          windowId: 1,
          url: 'chrome-extension://test-extension/panels/v3/index.html?old=1',
          active: false,
          status: 'complete',
        },
      ],
    })
    const firstModule = await loadTabPanel()
    await firstModule.openTabPanel('panels/v3/index.html')
    vi.resetModules()
    const reloadedModule = await import('../src/service-worker/tabPanel')

    await reloadedModule.openTabPanel('panels/v3/index.html', 'rule /?1', 'redirect')

    expect(mock.createTab).not.toHaveBeenCalled()
    expect(mock.updateTab).toHaveBeenCalledWith(7, { active: true }, expect.any(Function))
    expect(mock.updateWindow).toHaveBeenCalledWith(1, { focused: true }, expect.any(Function))
    expect(mock.sendMessage).toHaveBeenCalledWith({
      type: 'ajax-proxy:edit-rule',
      ruleId: 'rule /?1',
      action: 'redirect',
    })
  })

  it('restores a minimized normal window before focusing the panel tab', async () => {
    const mock = installChromeMock({
      windows: [{ id: 3, type: 'normal', state: 'minimized', focused: false }],
      tabs: [
        {
          id: 8,
          windowId: 3,
          url: 'chrome-extension://test-extension/panels/v3/index.html',
          active: true,
        },
      ],
    })
    const panel = await loadTabPanel()

    await panel.openTabPanel('panels/v3/index.html')

    expect(mock.updateWindow).toHaveBeenCalledWith(
      3,
      { state: 'normal', focused: true },
      expect.any(Function)
    )
  })

  it.each([
    ['discarded', { discarded: true, status: 'complete' }],
    ['still loading', { status: 'loading' }],
  ])('navigates an existing %s tab to the edit deep link', async (_label, state) => {
    const mock = installChromeMock({
      windows: [{ id: 5, type: 'normal', state: 'normal', focused: true }],
      tabs: [
        {
          id: 10,
          windowId: 5,
          url: 'chrome-extension://test-extension/panels/v3/index.html',
          active: false,
          ...state,
        },
      ],
    })
    const panel = await loadTabPanel()

    await panel.openTabPanel('panels/v3/index.html', 'rule /?1', 'redirect')

    expect(mock.updateTab).toHaveBeenCalledWith(
      10,
      {
        url: 'chrome-extension://test-extension/panels/v3/index.html?edit=rule+%2F%3F1&action=redirect',
        active: true,
      },
      expect.any(Function)
    )
    expect(mock.sendMessage).not.toHaveBeenCalled()
    expect(mock.createTab).not.toHaveBeenCalled()
  })

  it('serializes simultaneous opens so they create only one panel tab', async () => {
    const mock = installChromeMock()
    const panel = await loadTabPanel()

    await Promise.all([
      panel.openTabPanel('panels/v3/index.html'),
      panel.openTabPanel('panels/v3/index.html'),
    ])

    expect(mock.createTab).toHaveBeenCalledOnce()
    expect(
      mock.tabs.filter((tab) =>
        tab.url?.startsWith('chrome-extension://test-extension/panels/v3/index.html')
      )
    ).toHaveLength(1)
  })

  it('falls back to the focused normal window when getLastFocused reports an error', async () => {
    const mock = installChromeMock({
      windows: [
        { id: 11, type: 'normal', state: 'normal', focused: false },
        { id: 12, type: 'normal', state: 'normal', focused: true },
      ],
      lastFocusedError: true,
    })
    const panel = await loadTabPanel()

    await panel.openTabPanel('panels/v3/index.html')

    expect(mock.getLastFocused).toHaveBeenCalledOnce()
    expect(mock.createTab.mock.calls[0][0]).toMatchObject({ windowId: 12, active: true })
  })

  it('puts an encoded edit deep link in the first panel tab URL', async () => {
    const mock = installChromeMock()
    const panel = await loadTabPanel()

    await panel.openTabPanel('panels/v3/index.html', 'rule /?1', 'redirect')

    const url = new URL(mock.createTab.mock.calls[0][0].url)
    expect(url.searchParams.get('edit')).toBe('rule /?1')
    expect(url.searchParams.get('action')).toBe('redirect')
    expect(mock.createTab.mock.calls[0][0].url).toContain('edit=rule+%2F%3F1')
  })

  it('closes only the panel tab and leaves its normal browser window open', async () => {
    const mock = installChromeMock({
      windows: [{ id: 4, type: 'normal', state: 'normal' }],
      tabs: [
        {
          id: 9,
          windowId: 4,
          url: 'chrome-extension://test-extension/panels/v3/index.html',
          active: true,
        },
      ],
    })
    const panel = await loadTabPanel()

    await panel.closeTabPanel('panels/v3/index.html')

    expect(mock.removeTab).toHaveBeenCalledWith(9, expect.any(Function))
    expect(mock.windows).toHaveLength(1)
    expect(mock.createWindow).not.toHaveBeenCalled()
  })

  it('creates a normal browser window when Chrome has no normal windows', async () => {
    const mock = installChromeMock({ windows: [{ id: 2, type: 'popup', state: 'normal' }] })
    const panel = await loadTabPanel()

    await panel.openTabPanel('panels/v3/index.html')

    expect(mock.createWindow).toHaveBeenCalledWith(
      {
        url: 'chrome-extension://test-extension/panels/v3/index.html',
        type: 'normal',
        focused: true,
      },
      expect.any(Function)
    )
    expect(mock.createTab).not.toHaveBeenCalled()
  })
})
