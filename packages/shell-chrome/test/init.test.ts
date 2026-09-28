import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getRealStorage: vi.fn(),
  chromeBadge: vi.fn(),
  validateV3Backup: vi.fn(),
}))

vi.mock('@proxy/shared-utils', () => ({
  StorageKey: { GLOBAL_SWITCH: 'global-switch', V3_CONFIG: 'v3-config' },
  getRealStorage: mocks.getRealStorage,
}))

vi.mock('@proxy/v3-domain', () => ({ validateV3Backup: mocks.validateV3Backup }))

vi.mock('../src/service-worker/badge', () => ({ chromeBadge: mocks.chromeBadge }))

import { initDefaultSth } from '../src/service-worker/init'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('service worker default initialization', () => {
  it('uses the enabled V3 empty-config default and initializes the badge', async () => {
    const setIcon = vi.fn()
    vi.stubGlobal('chrome', { action: { setIcon } })
    mocks.getRealStorage.mockResolvedValueOnce(null)

    await initDefaultSth()

    expect(mocks.getRealStorage).toHaveBeenCalledExactlyOnceWith('v3-config', null)
    expect(setIcon).toHaveBeenCalledExactlyOnceWith({ path: 'icons/128.png' })
    expect(mocks.chromeBadge).toHaveBeenCalledOnce()
  })

  it('does not mark the toolbar or initialize the badge when storage cannot be read', async () => {
    const setIcon = vi.fn()
    vi.stubGlobal('chrome', { action: { setIcon } })
    mocks.getRealStorage.mockRejectedValueOnce(new Error('storage unavailable'))

    await expect(initDefaultSth()).rejects.toThrow('storage unavailable')

    expect(setIcon).not.toHaveBeenCalled()
    expect(mocks.chromeBadge).not.toHaveBeenCalled()
  })

  it('uses the V3 global switch when a valid V3 configuration exists', async () => {
    const setIcon = vi.fn()
    vi.stubGlobal('chrome', { action: { setIcon } })
    mocks.getRealStorage.mockResolvedValueOnce({ settings: { globalEnabled: false } })
    mocks.validateV3Backup.mockReturnValueOnce({
      ok: true,
      data: { settings: { globalEnabled: false } },
    })

    await initDefaultSth()

    expect(mocks.getRealStorage).toHaveBeenCalledExactlyOnceWith('v3-config', null)
    expect(setIcon).toHaveBeenCalledExactlyOnceWith({ path: 'icons/128g.png' })
    expect(mocks.chromeBadge).toHaveBeenCalledOnce()
  })
})
