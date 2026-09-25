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
})
