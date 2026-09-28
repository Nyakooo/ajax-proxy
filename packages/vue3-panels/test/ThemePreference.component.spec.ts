import { defineComponent, h, nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useThemePreference } from '../src/services/useThemePreference.js'

const STORAGE_KEY = 'ajax-proxy:ui:theme'

function createMediaQuery(initial = false) {
  const listeners = new Set<(event: { matches: boolean }) => void>()
  const query = {
    matches: initial,
    addEventListener: vi.fn((_type: string, listener: (event: { matches: boolean }) => void) =>
      listeners.add(listener)
    ),
    removeEventListener: vi.fn((_type: string, listener: (event: { matches: boolean }) => void) =>
      listeners.delete(listener)
    ),
    change(matches: boolean) {
      query.matches = matches
      listeners.forEach((listener) => listener({ matches }))
    },
  }
  return query
}

function mountPreference() {
  let preference!: ReturnType<typeof useThemePreference>
  const wrapper = mount(
    defineComponent({
      setup() {
        preference = useThemePreference()
        return () => h('div')
      },
    })
  )
  return { wrapper, preference }
}

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
  document.documentElement.classList.remove('app-dark')
})

describe('useThemePreference', () => {
  it('defaults to system mode and follows system color changes', async () => {
    const media = createMediaQuery(false)
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => media)
    )
    const { wrapper, preference } = mountPreference()
    await flushPromises()

    expect(preference.themeMode.value).toBe('system')
    expect(preference.darkMode.value).toBe(false)
    media.change(true)
    await nextTick()
    expect(preference.darkMode.value).toBe(true)
    expect(document.documentElement.classList.contains('app-dark')).toBe(true)
    wrapper.unmount()
    expect(media.removeEventListener).toHaveBeenCalled()
  })

  it('lets a manual choice override later system changes', async () => {
    const media = createMediaQuery(false)
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => media)
    )
    const { wrapper, preference } = mountPreference()
    preference.setThemeMode('dark')
    media.change(false)
    await nextTick()
    expect(preference.darkMode.value).toBe(true)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark')
    preference.setThemeMode('light')
    await nextTick()
    expect(preference.darkMode.value).toBe(false)
    wrapper.unmount()
  })

  it('uses localStorage events to synchronize another page', async () => {
    const { wrapper, preference } = mountPreference()
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: 'dark' }))
    await nextTick()
    expect(preference.themeMode.value).toBe('dark')
    expect(preference.darkMode.value).toBe(true)
    wrapper.unmount()
  })

  it('uses chrome storage and synchronizes storage changes', async () => {
    let changed: ((changes: Record<string, { newValue: string }>, area: string) => void) | undefined
    const chromeStorage = {
      get: vi.fn().mockResolvedValue({ [STORAGE_KEY]: 'light' }),
      set: vi.fn().mockResolvedValue(undefined),
      onChanged: {
        addListener: vi.fn((listener) => {
          changed = listener
        }),
        removeListener: vi.fn(),
      },
    }
    vi.stubGlobal('chrome', {
      storage: { local: chromeStorage, onChanged: chromeStorage.onChanged },
    })
    const { wrapper, preference } = mountPreference()
    await flushPromises()
    expect(preference.themeMode.value).toBe('light')
    changed?.({ [STORAGE_KEY]: { newValue: 'dark' } }, 'local')
    await nextTick()
    expect(preference.themeMode.value).toBe('dark')
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    wrapper.unmount()
    expect(chromeStorage.onChanged.removeListener).toHaveBeenCalled()
  })

  it('ignores storage read and write failures', async () => {
    const chromeStorage = {
      get: vi.fn(() => {
        throw new Error('read failed')
      }),
      set: vi.fn(() => {
        throw new Error('write failed')
      }),
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    }
    vi.stubGlobal('chrome', {
      storage: { local: chromeStorage, onChanged: chromeStorage.onChanged },
    })
    const { wrapper, preference } = mountPreference()
    preference.setThemeMode('dark')
    await flushPromises()
    expect(preference.themeMode.value).toBe('dark')
    wrapper.unmount()
  })
})
