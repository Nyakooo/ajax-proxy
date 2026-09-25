import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ createPanel: vi.fn() }))

vi.mock('@proxy/shared-utils', () => ({
  NoticeKey: {},
  onConnectByServiceWorker: vi.fn(),
  noticePanelsByServiceWorker: vi.fn(),
  noticeContentByServiceWorker: vi.fn(),
  onCurrentTabChanged: vi.fn(),
}))

vi.mock('../src/service-worker/panel', () => ({ createPanel: mocks.createPanel }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
  vi.clearAllMocks()
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
})
