import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('shared storage cache', () => {
  it('applies local storage change events and ignores other storage areas', async () => {
    const listeners: Array<
      (changes: Record<string, { newValue?: unknown }>, area: string) => void
    > = []
    const initialData = { mode: 'interceptor' }
    vi.stubGlobal('chrome', {
      storage: {
        onChanged: { addListener: (listener) => listeners.push(listener) },
        local: { get: (_key, callback) => callback(initialData) },
      },
    })
    const { getStorage, initStorage } = await import('../src/storage')
    await initStorage()

    listeners[0]({ mode: { newValue: 'redirector' } }, 'sync')
    expect(getStorage('mode')).toBe('interceptor')
    listeners[0]({ mode: { newValue: 'redirector' } }, 'local')
    expect(getStorage('mode')).toBe('redirector')
    listeners[0]({ mode: { newValue: undefined } }, 'local')
    expect(getStorage('mode', 'interceptor')).toBe('interceptor')
  })

  it('replays storage changes that arrive while the initial snapshot is loading', async () => {
    const listeners: Array<
      (changes: Record<string, { newValue?: unknown }>, area: string) => void
    > = []
    let finishInitialRead: ((data: Record<string, unknown>) => void) | undefined
    vi.stubGlobal('chrome', {
      storage: {
        onChanged: { addListener: (listener) => listeners.push(listener) },
        local: {
          get: (_key, callback) => {
            finishInitialRead = callback
          },
        },
      },
    })
    const { getStorage, initStorage } = await import('../src/storage')
    const initialized = initStorage()

    listeners[0]({ mode: { newValue: 'redirector' } }, 'local')
    finishInitialRead?.({ mode: 'interceptor' })
    await initialized

    expect(getStorage('mode')).toBe('redirector')
  })

  it('rejects and reports storage initialization failures', async () => {
    let inCallback = false
    const storageError = { message: 'storage unavailable' }
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('chrome', {
      runtime: {
        get lastError() {
          return inCallback ? storageError : undefined
        },
      },
      storage: {
        onChanged: { addListener: vi.fn() },
        local: {
          get: (_key, callback) => {
            inCallback = true
            callback({})
            inCallback = false
          },
        },
      },
    })
    const { initStorage } = await import('../src/storage')

    await expect(initStorage()).rejects.toThrow('Storage read failed: storage unavailable')
    expect(errorLog).toHaveBeenCalled()
  })

  it('rejects quota failures without poisoning the cached value', async () => {
    let inCallback = false
    const quotaError = { message: 'QUOTA_BYTES_PER_ITEM quota exceeded' }
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const dispatchEvent = vi.fn()
    vi.stubGlobal('dispatchEvent', dispatchEvent)
    vi.stubGlobal('chrome', {
      runtime: {
        get lastError() {
          return inCallback ? quotaError : undefined
        },
      },
      storage: {
        onChanged: { addListener: vi.fn() },
        local: {
          get: (_key, callback) => callback({ mode: 'interceptor' }),
          set: (_items, callback) => {
            inCallback = true
            callback()
            inCallback = false
          },
        },
      },
    })
    const { getStorage, initStorage, setStorage } = await import('../src/storage')
    await initStorage()

    await expect(setStorage('mode', 'redirector')).rejects.toThrow('QUOTA_BYTES_PER_ITEM')

    expect(getStorage('mode')).toBe('interceptor')
    expect(errorLog).toHaveBeenCalled()
    expect(dispatchEvent).toHaveBeenCalledOnce()
    expect(dispatchEvent.mock.calls[0][0]).toMatchObject({
      type: 'ajax-proxy:storage-error',
      detail: { operation: 'write', key: 'mode' },
    })
  })

  it('updates the cache only after a successful write callback', async () => {
    vi.stubGlobal('chrome', {
      runtime: {},
      storage: {
        onChanged: { addListener: vi.fn() },
        local: {
          get: (_key, callback) => callback({ mode: 'interceptor' }),
          set: (items, callback) => callback(),
        },
      },
    })
    const { getStorage, initStorage, setStorage } = await import('../src/storage')
    await initStorage()

    await setStorage('mode', 'redirector')

    expect(getStorage('mode')).toBe('redirector')
  })

  it('uses one initialized cache for ordinary webpage localStorage operations', async () => {
    const values: Record<string, string> = { mode: '"interceptor"', rules: '[1,2]' }
    const localStorage = Object.create(null)
    Object.keys(values).forEach((key) =>
      Object.defineProperty(localStorage, key, {
        value: true,
        enumerable: true,
        configurable: true,
      })
    )
    Object.defineProperties(localStorage, {
      getItem: { value: (key: string) => values[key] ?? null },
      setItem: {
        value: (key: string, value: string) => {
          values[key] = value
          Object.defineProperty(localStorage, key, {
            value: true,
            enumerable: true,
            configurable: true,
          })
        },
      },
      removeItem: {
        value: (key: string) => {
          delete values[key]
          delete localStorage[key]
        },
      },
      clear: {
        value: () => {
          Object.keys(values).forEach((key) => {
            delete values[key]
            delete localStorage[key]
          })
        },
      },
    })
    vi.stubGlobal('chrome', undefined)
    vi.stubGlobal('localStorage', localStorage)
    const {
      clearStorage,
      getRealStorage,
      getStorage,
      getStorageAll,
      initStorage,
      removeStorage,
      setStorage,
    } = await import('../src/storage')
    await initStorage()

    expect(getStorage('mode')).toBe('interceptor')
    expect(await getRealStorage('rules' as any)).toEqual([1, 2])
    expect(await getStorageAll()).toEqual({ mode: 'interceptor', rules: [1, 2] })

    await setStorage('mode', 'redirector')
    expect(getStorage('mode')).toBe('redirector')
    await removeStorage('rules')
    expect(getStorage('rules', [])).toEqual([])
    await clearStorage()
    expect(await getStorageAll()).toEqual({})
  })

  it('refreshes ordinary webpage cache from localStorage change events', async () => {
    let storageListener: ((event: StorageEvent) => void) | undefined
    vi.stubGlobal('chrome', undefined)
    vi.stubGlobal('localStorage', {
      getItem: () => '"initial"',
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })
    vi.stubGlobal('addEventListener', (type: string, listener: (event: StorageEvent) => void) => {
      if (type === 'storage') storageListener = listener
    })
    const { getStorage, initStorage } = await import('../src/storage')
    await initStorage()

    storageListener?.({
      key: 'mode',
      newValue: '"redirector"',
      storageArea: localStorage,
    } as StorageEvent)

    expect(getStorage('mode')).toBe('redirector')
  })

  it('rejects and reports ordinary webpage storage initialization failures', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('chrome', undefined)
    vi.stubGlobal(
      'localStorage',
      new Proxy(
        {},
        {
          ownKeys: () => {
            throw new Error('storage denied')
          },
        }
      )
    )
    const { initStorage } = await import('../src/storage')

    await expect(initStorage()).rejects.toThrow('storage denied')
    expect(errorLog).toHaveBeenCalled()
  })
})
