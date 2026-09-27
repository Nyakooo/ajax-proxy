import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createPanel: vi.fn(),
  onConnectByServiceWorker: vi.fn(),
  noticePanelsByServiceWorker: vi.fn(),
  noticeContentByServiceWorker: vi.fn(),
  onCurrentTabChanged: vi.fn(),
}))

vi.mock('@proxy/shared-utils', () => ({
  NoticeKey: { GET_CURRENT_TITLE: 'get-current-title' },
  onConnectByServiceWorker: mocks.onConnectByServiceWorker,
  noticePanelsByServiceWorker: mocks.noticePanelsByServiceWorker,
  noticeContentByServiceWorker: mocks.noticeContentByServiceWorker,
  onCurrentTabChanged: mocks.onCurrentTabChanged,
}))

vi.mock('../src/service-worker/panel', () => ({ createPanel: mocks.createPanel }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.resetModules()
  vi.clearAllMocks()
})

beforeEach(() => {
  vi.stubGlobal('chrome', {
    runtime: {
      getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
      lastError: undefined,
    },
    notifications: {
      create: vi.fn(),
      clear: vi.fn(),
      onClicked: { addListener: vi.fn() },
    },
  })
})

describe('Chrome native notifications', () => {
  it('creates an extension notification and opens the panel when it is clicked', async () => {
    const clickListeners: Array<(notificationId: string) => void> = []
    const create = vi.fn()
    const clear = vi.fn()
    const getURL = vi.fn((path: string) => `chrome-extension://test/${path}`)
    vi.stubGlobal('chrome', {
      runtime: { getURL, lastError: undefined },
      notifications: {
        create,
        clear,
        onClicked: { addListener: (listener) => clickListeners.push(listener) },
      },
    })
    const { chromeNativeNotice } = await import('../src/service-worker/notice')

    chromeNativeNotice({ title: 'Too many interceptions', message: '/api/items' })

    const [notificationId, options] = create.mock.calls[0]
    expect(notificationId).toMatch(/^ajax-proxy:hit-limit:/)
    expect(options).toEqual({
      type: 'basic',
      iconUrl: 'chrome-extension://test/icons/128.png',
      title: 'Too many interceptions',
      message: '/api/items',
    })
    expect(clickListeners).toHaveLength(1)

    clickListeners[0](notificationId)

    expect(clear).toHaveBeenCalledWith(notificationId)
    expect(mocks.createPanel).toHaveBeenCalledOnce()
  })

  it('tracks matching ports and forwards content notices through the current port', async () => {
    const { CONNECT_NAME } = await import('../src/consts')
    const { noticeContent, useCurrentTitle } = await import('../src/service-worker/notice')
    const onConnect = mocks.onConnectByServiceWorker.mock.calls[0][0]
    const matchingPort = { name: CONNECT_NAME, sender: { tab: { title: 'Current page' } } }
    const otherPort = { name: 'another-port', sender: { tab: { title: 'Other page' } } }

    onConnect(matchingPort)
    expect(useCurrentTitle()).toBe('Current page')
    noticeContent('refresh', { id: 7 })
    expect(mocks.noticeContentByServiceWorker).toHaveBeenLastCalledWith(matchingPort, 'refresh', {
      id: 7,
    })

    onConnect(otherPort)
    expect(useCurrentTitle()).toBe('Current page')
    noticeContent('refresh', 'again')
    expect(mocks.noticeContentByServiceWorker).toHaveBeenLastCalledWith(
      matchingPort,
      'refresh',
      'again'
    )
  })

  it('clears the current title on disconnect and forwards current tab title changes', async () => {
    const { NoticeKey } = await import('@proxy/shared-utils')
    const { CONNECT_NAME } = await import('../src/consts')
    const { useCurrentTitle } = await import('../src/service-worker/notice')
    const onConnect = mocks.onConnectByServiceWorker.mock.calls[0][0]
    const onDisconnect = mocks.onConnectByServiceWorker.mock.calls[0][1]
    const onTabChanged = mocks.onCurrentTabChanged.mock.calls[0][0]

    onConnect({ name: CONNECT_NAME, sender: { tab: { title: 'Before disconnect' } } })
    expect(useCurrentTitle()).toBe('Before disconnect')
    onDisconnect()
    expect(useCurrentTitle()).toBeUndefined()
    expect(mocks.noticePanelsByServiceWorker).toHaveBeenCalledWith(NoticeKey.GET_CURRENT_TITLE, '')

    onTabChanged({ title: 'New active tab' })
    expect(mocks.noticePanelsByServiceWorker).toHaveBeenLastCalledWith(
      NoticeKey.GET_CURRENT_TITLE,
      'New active tab'
    )
  })

  it('ignores clicks for unrelated notifications', async () => {
    const clickListeners: Array<(notificationId: string) => void> = []
    const clear = vi.fn()
    vi.stubGlobal('chrome', {
      runtime: { getURL: vi.fn(), lastError: undefined },
      notifications: {
        create: vi.fn(),
        clear,
        onClicked: { addListener: (listener) => clickListeners.push(listener) },
      },
    })
    await import('../src/service-worker/notice')

    clickListeners[0]('browser-notification:unrelated')

    expect(clear).not.toHaveBeenCalled()
    expect(mocks.createPanel).not.toHaveBeenCalled()
  })

  it('logs a runtime error reported by the notification creation callback', async () => {
    const callbacks: Array<() => void> = []
    const runtime = {
      getURL: vi.fn(() => 'chrome-extension://test/icons/128.png'),
      lastError: undefined as { message: string } | undefined,
    }
    vi.stubGlobal('chrome', {
      runtime,
      notifications: {
        create: vi.fn((_id, _options, callback) => callbacks.push(callback)),
        clear: vi.fn(),
        onClicked: { addListener: vi.fn() },
      },
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { chromeNativeNotice } = await import('../src/service-worker/notice')

    chromeNativeNotice({ title: 'Failed notice', message: 'Failure case' })
    runtime.lastError = { message: 'permission denied' }
    callbacks[0]()

    expect(error).toHaveBeenCalledWith(
      '[AjaxProxy] Could not create notification',
      'permission denied'
    )
  })
})
