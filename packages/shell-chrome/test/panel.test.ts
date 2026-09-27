import { afterEach, describe, expect, it, vi } from 'vitest'

type WindowLike = { id?: number; state?: string }
type TabLike = { id?: number; windowId?: number }

function installWindowsMock() {
  const getAll = vi.fn<(callback: (windows: WindowLike[]) => void) => void>()
  const create = vi.fn<(options: object, callback: (window?: WindowLike) => void) => void>()
  const update = vi.fn<
    (id: number, options: object, callback?: (window?: WindowLike) => void) => void
  >((_id, _options, callback) => callback?.())
  const remove = vi.fn<(id: number) => void>()
  const getCurrent = vi.fn<(callback: (window: WindowLike) => void) => void>()
  const tabsCreate = vi.fn<(options: object, callback: (tab?: TabLike) => void) => void>()
  const tabsUpdate =
    vi.fn<(id: number, options: object, callback: (tab?: TabLike) => void) => void>()
  const tabsRemove = vi.fn<(id: number) => void>()

  vi.stubGlobal('chrome', {
    windows: { getAll, create, update, remove, getCurrent },
    tabs: { create: tabsCreate, update: tabsUpdate, remove: tabsRemove },
  })

  return { getAll, create, update, remove, getCurrent, tabsCreate, tabsUpdate, tabsRemove }
}

async function loadPanel() {
  vi.resetModules()
  return import('../src/service-worker/panel')
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('service worker panel window controls', () => {
  it('retries a rejected maximized popup and keeps it open if the fallback cannot maximize', async () => {
    const windows = installWindowsMock()
    let createStage: 'maximized' | 'fallback' | 'maximize-update' = 'maximized'
    Object.assign(chrome, {
      runtime: {
        get lastError() {
          if (createStage === 'maximized') return { message: 'Invalid value for state' }
          if (createStage === 'maximize-update') return { message: 'Unable to maximize popup' }
          return undefined
        },
      },
    })
    windows.create
      .mockImplementationOnce((_options, callback) => {
        callback(undefined)
      })
      .mockImplementationOnce((_options, callback) => {
        createStage = 'fallback'
        callback({ id: 42 })
      })
    windows.update.mockImplementationOnce((_id, _options, callback) => {
      createStage = 'maximize-update'
      callback?.()
    })
    const panel = await loadPanel()
    await panel.createPanel('rule-2')
    expect(windows.create).toHaveBeenCalledTimes(2)
    expect(windows.create.mock.calls[0][0]).toEqual({
      url: 'panels/index.html?edit=rule-2',
      type: 'popup',
      state: 'maximized',
      focused: true,
    })
    expect(windows.create.mock.calls[1][0]).toEqual({
      url: 'panels/index.html?edit=rule-2',
      type: 'popup',
      focused: true,
    })
    expect(windows.update).toHaveBeenCalledExactlyOnceWith(
      42,
      { state: 'maximized', focused: true },
      expect.any(Function)
    )
  })

  it('opens a new editor using an encoded rule ID', async () => {
    const windows = installWindowsMock()
    windows.create.mockImplementation((_options, callback) => callback({ id: 41 }))
    const panel = await loadPanel()
    await panel.createPanel('rule /?1')
    expect(windows.create.mock.calls[0][0]).toMatchObject({
      url: 'panels/index.html?edit=rule+%2F%3F1',
    })
  })

  it('deep-links to a specific action when the popup filters combined rules', async () => {
    const windows = installWindowsMock()
    windows.create.mockImplementation((_options, callback) => callback({ id: 41 }))
    const panel = await loadPanel()
    await panel.createPanel('rule-2', 'redirect')
    expect(windows.create.mock.calls[0][0]).toMatchObject({
      url: 'panels/index.html?edit=rule-2&action=redirect',
    })
  })

  it('opens the panel in a tab if Chrome rejects both popup window attempts', async () => {
    const windows = installWindowsMock()
    let stage = 'maximized-window'
    Object.assign(chrome, {
      runtime: {
        get lastError() {
          return stage === 'tab' ? undefined : { message: 'Window creation is unavailable' }
        },
        getURL: (path: string) => `chrome-extension://test-extension/${path}`,
        sendMessage: vi.fn().mockResolvedValue(undefined),
      },
    })
    windows.create
      .mockImplementationOnce((_options, callback) => {
        callback(undefined)
      })
      .mockImplementationOnce((_options, callback) => {
        callback(undefined)
      })
    windows.tabsCreate.mockImplementation((_options, callback) => {
      stage = 'tab'
      callback({ id: 81, windowId: 12 })
    })
    const panel = await loadPanel()

    await panel.createPanel('rule-2', 'redirect')

    expect(windows.tabsCreate).toHaveBeenCalledWith(
      {
        url: 'chrome-extension://test-extension/panels/index.html?edit=rule-2&action=redirect',
        active: true,
      },
      expect.any(Function)
    )
  })

  it('focuses and closes the fallback tab on later requests', async () => {
    const windows = installWindowsMock()
    Object.assign(chrome, {
      runtime: {
        getURL: (path: string) => `chrome-extension://test-extension/${path}`,
        sendMessage: vi.fn().mockResolvedValue(undefined),
      },
    })
    windows.create
      .mockImplementationOnce((_options, callback) => callback(undefined))
      .mockImplementationOnce((_options, callback) => callback(undefined))
    windows.tabsCreate.mockImplementation((_options, callback) =>
      callback({ id: 81, windowId: 12 })
    )
    windows.tabsUpdate.mockImplementation((id, _options, callback) =>
      callback({ id, windowId: 12 })
    )
    const panel = await loadPanel()

    await panel.createPanel()
    await panel.createPanel('rule-3')
    await panel.closePanel()

    expect(windows.tabsUpdate).toHaveBeenCalledWith(81, { active: true }, expect.any(Function))
    expect(windows.update).toHaveBeenCalledWith(12, { focused: true }, expect.any(Function))
    expect(windows.tabsRemove).toHaveBeenCalledExactlyOnceWith(81)
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'ajax-proxy:edit-rule',
      ruleId: 'rule-3',
    })
  })

  it('focuses an existing panel and asks it to edit without reloading it', async () => {
    const windows = installWindowsMock()
    const sendMessage = vi.fn().mockResolvedValue(undefined)
    Object.assign(chrome, { runtime: { sendMessage } })
    windows.create.mockImplementation((_options, callback) => callback({ id: 41 }))
    windows.getAll.mockImplementation((callback) => callback([{ id: 41 }]))
    const panel = await loadPanel()
    await panel.createPanel()
    await panel.createPanel('rule-2')
    expect(windows.create).toHaveBeenCalledOnce()
    expect(sendMessage).toHaveBeenCalledWith({ type: 'ajax-proxy:edit-rule', ruleId: 'rule-2' })
  })

  it('preserves the selected action when focusing an existing panel', async () => {
    const windows = installWindowsMock()
    const sendMessage = vi.fn().mockResolvedValue(undefined)
    Object.assign(chrome, { runtime: { sendMessage } })
    windows.create.mockImplementation((_options, callback) => callback({ id: 41 }))
    windows.getAll.mockImplementation((callback) => callback([{ id: 41 }]))
    const panel = await loadPanel()
    await panel.createPanel()
    await panel.createPanel('rule-2', 'redirect')
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'ajax-proxy:edit-rule',
      ruleId: 'rule-2',
      action: 'redirect',
    })
  })

  it('creates the panel on first open and focuses it when its cached window exists', async () => {
    const windows = installWindowsMock()
    windows.create.mockImplementation((_options, callback) => callback({ id: 41 }))
    const panel = await loadPanel()

    await panel.createPanel()

    expect(windows.create).toHaveBeenCalledWith(
      {
        url: 'panels/index.html',
        type: 'popup',
        state: 'maximized',
        focused: true,
      },
      expect.any(Function)
    )
    expect(windows.update).not.toHaveBeenCalled()

    windows.getAll.mockImplementation((callback) => callback([{ id: 41 }]))
    windows.update.mockClear()
    await panel.createPanel()

    expect(windows.create).toHaveBeenCalledOnce()
    expect(windows.update).toHaveBeenCalledExactlyOnceWith(
      41,
      { focused: true },
      expect.any(Function)
    )
  })

  it('restores a minimized panel before focusing it', async () => {
    const windows = installWindowsMock()
    windows.create.mockImplementation((_options, callback) => callback({ id: 41 }))
    windows.getAll.mockImplementation((callback) => callback([{ id: 41, state: 'minimized' }]))
    const panel = await loadPanel()

    await panel.createPanel()
    await panel.createPanel()

    expect(windows.update).toHaveBeenCalledExactlyOnceWith(
      41,
      { state: 'normal', focused: true },
      expect.any(Function)
    )
    expect(windows.create).toHaveBeenCalledOnce()
  })

  it('recreates the panel if focusing the cached window fails', async () => {
    const windows = installWindowsMock()
    let focusFails = false
    Object.assign(chrome, {
      runtime: {
        get lastError() {
          return focusFails ? { message: 'Window is not available' } : undefined
        },
      },
    })
    windows.create
      .mockImplementationOnce((_options, callback) => callback({ id: 41 }))
      .mockImplementationOnce((_options, callback) => {
        focusFails = false
        callback({ id: 42 })
      })
    windows.getAll.mockImplementation((callback) => callback([{ id: 41, state: 'normal' }]))
    windows.update.mockImplementationOnce((_id, _options, callback) => {
      focusFails = true
      callback?.()
    })
    const panel = await loadPanel()

    await panel.createPanel()
    await panel.createPanel()

    expect(windows.update).toHaveBeenCalledOnce()
    expect(windows.create).toHaveBeenCalledTimes(2)
  })

  it('recreates the panel when the cached window has been closed', async () => {
    const windows = installWindowsMock()
    windows.create
      .mockImplementationOnce((_options, callback) => callback({ id: 41 }))
      .mockImplementationOnce((_options, callback) => callback({ id: 42 }))
    windows.getAll.mockImplementation((callback) => callback([{ id: 99 }]))
    const panel = await loadPanel()

    await panel.createPanel()
    await panel.createPanel()

    expect(windows.create).toHaveBeenCalledTimes(2)
    expect(windows.update).not.toHaveBeenCalled()
  })

  it('closes the cached panel and creates a new one on the next open', async () => {
    const windows = installWindowsMock()
    windows.create
      .mockImplementationOnce((_options, callback) => callback({ id: 41 }))
      .mockImplementationOnce((_options, callback) => callback({ id: 42 }))
    const panel = await loadPanel()

    await panel.createPanel()
    await panel.closePanel()
    await panel.createPanel()

    expect(windows.remove).toHaveBeenCalledExactlyOnceWith(41)
    expect(windows.create).toHaveBeenCalledTimes(2)
  })

  it('toggles fullscreen and normal only for the active panel window', async () => {
    const windows = installWindowsMock()
    windows.create.mockImplementation((_options, callback) => callback({ id: 41 }))
    let state = 'fullscreen'
    windows.getCurrent.mockImplementation((callback) => callback({ id: 41, state }))
    windows.update.mockImplementation((_id, options) => {
      state = (options as { state: string }).state
    })
    const panel = await loadPanel()

    await panel.createPanel()
    await panel.fullScreenPanel()
    await panel.fullScreenPanel()

    expect(windows.update.mock.calls).toEqual([
      [41, { state: 'normal' }],
      [41, { state: 'fullscreen' }],
    ])

    windows.getCurrent.mockImplementation((callback) => callback({ id: 99, state: 'normal' }))
    await panel.fullScreenPanel()

    expect(windows.update).toHaveBeenCalledTimes(2)
  })

  it('cycles normal, maximized and fullscreen, ignoring a different current window', async () => {
    const windows = installWindowsMock()
    windows.create.mockImplementation((_options, callback) => callback({ id: 41 }))
    let state = 'normal'
    windows.getCurrent.mockImplementation((callback) => callback({ id: 41, state }))
    windows.update.mockImplementation((_id, options) => {
      state = (options as { state: string }).state
    })
    const panel = await loadPanel()

    await panel.createPanel()
    await panel.resizeWindow()
    await panel.resizeWindow()
    await panel.resizeWindow()

    expect(windows.update.mock.calls).toEqual([
      [41, { state: 'maximized' }],
      [41, { state: 'fullscreen' }],
      [41, { state: 'normal' }],
    ])

    windows.getCurrent.mockImplementation((callback) => callback({ id: 99, state: 'normal' }))
    await panel.resizeWindow()

    expect(windows.update).toHaveBeenCalledTimes(3)
  })

  it('ignores the resize shortcut while the current panel window is minimized', async () => {
    const windows = installWindowsMock()
    windows.create.mockImplementation((_options, callback) => callback({ id: 41 }))
    windows.getCurrent.mockImplementation((callback) => callback({ id: 41, state: 'minimized' }))
    const panel = await loadPanel()

    await panel.createPanel()
    await panel.resizeWindow()

    expect(windows.update).not.toHaveBeenCalled()
  })
})
