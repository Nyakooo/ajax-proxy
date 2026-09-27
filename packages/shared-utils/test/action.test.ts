import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('extension action helpers', () => {
  it('sets the badge color and displays a positive count with a plus prefix', async () => {
    const setBadgeBackgroundColor = vi.fn()
    const setBadgeText = vi.fn()
    vi.stubGlobal('chrome', {
      action: { setBadgeBackgroundColor, setBadgeText },
    })
    const { setBadge } = await import('../src/action')

    setBadge(4)

    expect(setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#006d75' })
    expect(setBadgeText).toHaveBeenCalledWith({ text: '+4' })
  })

  it.each([undefined, 0] as const)('clears the badge for count %s', async (count) => {
    const setBadgeBackgroundColor = vi.fn()
    const setBadgeText = vi.fn()
    vi.stubGlobal('chrome', {
      action: { setBadgeBackgroundColor, setBadgeText },
    })
    const { setBadge } = await import('../src/action')

    setBadge(count)

    expect(setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#006d75' })
    expect(setBadgeText).toHaveBeenCalledWith({ text: '' })
  })

  it('selects the enabled and disabled tab icons', async () => {
    const setIcon = vi.fn()
    vi.stubGlobal('chrome', { action: { setIcon } })
    const { setTabIcon } = await import('../src/action')

    setTabIcon(true)
    setTabIcon(false)

    expect(setIcon.mock.calls).toEqual([
      [{ path: '/icons/128.png' }],
      [{ path: '/icons/128g.png' }],
    ])
  })

  it('does nothing when the extension action API is unavailable', async () => {
    const setBadgeBackgroundColor = vi.fn()
    const setBadgeText = vi.fn()
    const setIcon = vi.fn()
    vi.stubGlobal('chrome', { runtime: {} })
    const { setBadge, setTabIcon } = await import('../src/action')

    expect(() => setBadge(2)).not.toThrow()
    expect(() => setTabIcon(true)).not.toThrow()
    expect(setBadgeBackgroundColor).not.toHaveBeenCalled()
    expect(setBadgeText).not.toHaveBeenCalled()
    expect(setIcon).not.toHaveBeenCalled()
  })
})
