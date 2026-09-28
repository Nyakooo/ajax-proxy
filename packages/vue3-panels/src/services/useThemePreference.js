import { computed, onUnmounted, ref, watch } from 'vue'

const STORAGE_KEY = 'ajax-proxy:ui:theme'
const THEME_MODES = new Set(['system', 'light', 'dark'])

function getChromeStorage() {
  try {
    return globalThis.chrome?.storage?.local ?? null
  } catch {
    return null
  }
}

function readStoredMode() {
  const storage = getChromeStorage()
  if (storage) {
    try {
      return Promise.resolve(storage.get(STORAGE_KEY))
        .then((result) => result?.[STORAGE_KEY])
        .catch(() => undefined)
    } catch {
      return Promise.resolve(undefined)
    }
  }

  try {
    const value = globalThis.localStorage?.getItem(STORAGE_KEY)
    return Promise.resolve(value)
  } catch {
    return Promise.resolve(undefined)
  }
}

function persistMode(mode) {
  const storage = getChromeStorage()
  if (storage) {
    try {
      Promise.resolve(storage.set({ [STORAGE_KEY]: mode })).catch(() => {})
    } catch {
      // Storage can be unavailable in restricted extension contexts.
    }
    return
  }

  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, mode)
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

export function useThemePreference() {
  const themeMode = ref('system')
  let userChangeVersion = 0
  let mediaQuery

  try {
    mediaQuery = globalThis.matchMedia?.('(prefers-color-scheme: dark)')
  } catch {
    mediaQuery = undefined
  }
  const systemDarkMode = ref(Boolean(mediaQuery?.matches))

  const darkMode = computed(() => {
    if (themeMode.value === 'dark') return true
    if (themeMode.value === 'light') return false
    return systemDarkMode.value
  })

  const setThemeMode = (mode) => {
    if (!THEME_MODES.has(mode)) return
    userChangeVersion += 1
    themeMode.value = mode
    persistMode(mode)
  }

  const onSystemChange = () => {
    systemDarkMode.value = Boolean(mediaQuery?.matches)
  }

  const onStorageChanged = (changes, areaName) => {
    if (areaName !== 'local' || !changes?.[STORAGE_KEY]) return
    const value = changes[STORAGE_KEY].newValue
    if (THEME_MODES.has(value)) {
      userChangeVersion += 1
      themeMode.value = value
    }
  }

  const onWindowStorage = (event) => {
    if (event.key !== STORAGE_KEY) return
    if (THEME_MODES.has(event.newValue)) {
      userChangeVersion += 1
      themeMode.value = event.newValue
    }
  }

  const storageChanges = globalThis.chrome?.storage?.onChanged
  try {
    storageChanges?.addListener(onStorageChanged)
  } catch {
    // Ignore unavailable extension event APIs.
  }
  globalThis.window?.addEventListener('storage', onWindowStorage)
  if (mediaQuery?.addEventListener) mediaQuery.addEventListener('change', onSystemChange)
  else mediaQuery?.addListener?.(onSystemChange)

  readStoredMode().then((storedMode) => {
    if (userChangeVersion === 0 && THEME_MODES.has(storedMode)) {
      themeMode.value = storedMode
    }
  })

  const stopThemeClass = watch(
    darkMode,
    (isDark) => {
      globalThis.document?.documentElement?.classList.toggle('app-dark', isDark)
    },
    { immediate: true }
  )

  onUnmounted(() => {
    stopThemeClass()
    try {
      storageChanges?.removeListener(onStorageChanged)
    } catch {
      // Ignore unavailable extension event APIs.
    }
    globalThis.window?.removeEventListener('storage', onWindowStorage)
    if (mediaQuery?.removeEventListener) mediaQuery.removeEventListener('change', onSystemChange)
    else mediaQuery?.removeListener?.(onSystemChange)
  })

  return { themeMode, darkMode, setThemeMode }
}
