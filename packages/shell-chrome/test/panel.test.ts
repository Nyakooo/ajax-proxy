import { afterEach, describe, expect, it, vi } from 'vitest'

type WindowLike = { id?: number; state?: string }

function installWindowsMock() {
  const getAll = vi.fn<(callback: (windows: WindowLike[]) => void) => void>()
  const create = vi.fn<(options: object, callback: (window?: WindowLike) => void) => void>()
  const update = vi.fn<(id: number, options: object) => void>()
  const remove = vi.fn<(id: number) => void>()
  const getCurrent = vi.fn<(callback: (window: WindowLike) => void) => void>()

  vi.stubGlobal('chrome', {
    windows: { getAll, create, update, remove, getCurrent },
  })

  return { getAll, create, update, remove, getCurrent }
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
  it('lets Chrome choose visible bounds when a small screen rejects fixed bounds', async () => {
    const windows = installWindowsMock()
    let fixedBounds = true
    Object.assign(chrome, {
      runtime: {
        get lastError() {
          return fixedBounds ? { message: 'Invalid value for bounds' } : undefined
        },
      },
    })
    windows.create.mockImplementation((_options, callback) => {
      if (fixedBounds) {
        callback(undefined)
        return
      }
      callback({ id: 42 })
    })
    windows.create
      .mockImplementationOnce((_options, callback) => {
        callback(undefined)
      })
      .mockImplementationOnce((_options, callback) => {
        fixedBounds = false
        callback({ id: 42 })
      })
    const panel = await loadPanel()
    await panel.createPanel('rule-2')
    expect(windows.create).toHaveBeenCalledTimes(2)
    expect(windows.create.mock.calls[1][0]).toEqual({
      url: 'panels/index.html?edit=rule-2',
      type: 'popup',
    })
  })

  it('opens a new editor using an encoded rule ID', async () => {
    const windows = installWindowsMock()
    windows.create.mockImplementation((_options, callback) => callback({ id: 41 }))
    const panel = await loadPanel()
    await panel.createPanel('rule /?1')
    expect(windows.create.mock.calls[0][0]).toMatchObject({
      url: 'panels/index.html?edit=rule%20%2F%3F1',
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

  it('creates the panel on first open and focuses it when its cached window exists', async () => {
    const windows = installWindowsMock()
    windows.create.mockImplementation((_options, callback) => callback({ id: 41 }))
    const panel = await loadPanel()

    await panel.createPanel()

    expect(windows.create).toHaveBeenCalledWith(
      {
        url: 'panels/index.html',
        type: 'popup',
        width: 1300,
        height: 750,
        top: 30,
        left: 150,
      },
      expect.any(Function)
    )
    expect(windows.update).not.toHaveBeenCalled()

    windows.getAll.mockImplementation((callback) => callback([{ id: 41 }]))
    await panel.createPanel()

    expect(windows.create).toHaveBeenCalledOnce()
    expect(windows.update).toHaveBeenCalledExactlyOnceWith(41, { focused: true })
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
