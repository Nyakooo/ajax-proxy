import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getRealStorage: vi.fn(),
  chromeBadge: vi.fn(),
}))

vi.mock('@proxy/shared-utils', () => ({
  StorageKey: { GLOBAL_SWITCH: 'global-switch' },
  getRealStorage: mocks.getRealStorage,
}))

vi.mock('../src/service-worker/badge', () => ({ chromeBadge: mocks.chromeBadge }))

import { initDefaultSth } from '../src/service-worker/init'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('service worker default initialization', () => {
  it('sets the toolbar icon from the stored global switch and initializes the badge', async () => {
    const setIcon = vi.fn()
    vi.stubGlobal('chrome', { action: { setIcon } })
    mocks.getRealStorage.mockResolvedValueOnce(true).mockResolvedValueOnce(false)

    await initDefaultSth()
    await initDefaultSth()

    expect(mocks.getRealStorage.mock.calls).toEqual([
      ['global-switch', false],
      ['global-switch', false],
    ])
    expect(setIcon.mock.calls).toEqual([[{ path: 'icons/128.png' }], [{ path: 'icons/128g.png' }]])
    expect(mocks.chromeBadge).toHaveBeenCalledTimes(2)
  })

  it('does not mark the toolbar or initialize the badge when storage cannot be read', async () => {
    const setIcon = vi.fn()
    vi.stubGlobal('chrome', { action: { setIcon } })
    mocks.getRealStorage.mockRejectedValueOnce(new Error('storage unavailable'))

    await expect(initDefaultSth()).rejects.toThrow('storage unavailable')

    expect(setIcon).not.toHaveBeenCalled()
    expect(mocks.chromeBadge).not.toHaveBeenCalled()
  })
})
