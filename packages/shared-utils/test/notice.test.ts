import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('service worker content connections', () => {
  it('accepts only plain extension message envelopes', async () => {
    const { isMessageRecord } = await import('../src/notice')

    expect(isMessageRecord({ from: 'content', to: 'worker', key: 'title', value: 'page' })).toBe(
      true
    )
    expect(isMessageRecord({ from: 'content', to: 'worker', key: 'title', injected: true })).toBe(
      false
    )
    expect(
      isMessageRecord(Object.assign(Object.create({ inherited: true }), { from: 'content' }))
    ).toBe(false)
  })

  it('rejects non-extension and non-tab ports before forwarding them', async () => {
    type TestPort = {
      sender?: { id?: string; tab?: { id: number } }
      disconnect: () => void
      onDisconnect: { addListener: (callback: () => void) => void }
    }
    let listener: ((port: TestPort) => void) | undefined
    let disconnectListener: (() => void) | undefined
    const chrome = {
      runtime: {
        id: 'extension-id',
        onConnect: {
          addListener: (callback: (port: TestPort) => void) => {
            listener = callback
          },
        },
      },
    }
    vi.stubGlobal('chrome', chrome)
    const onConnectFn = vi.fn()
    const onDisconnectFn = vi.fn()
    const { onConnectByServiceWorker } = await import('../src/notice')
    onConnectByServiceWorker(onConnectFn, onDisconnectFn)

    const disconnect = vi.fn()
    const addDisconnectListener = vi.fn((callback: () => void) => {
      disconnectListener = callback
    })
    listener?.({
      sender: { id: 'other-extension', tab: { id: 1 } },
      disconnect,
      onDisconnect: { addListener: addDisconnectListener },
    })
    listener?.({
      sender: { id: 'extension-id' },
      disconnect,
      onDisconnect: { addListener: addDisconnectListener },
    })
    expect(disconnect).toHaveBeenCalledTimes(2)
    expect(onConnectFn).not.toHaveBeenCalled()

    const validPort = {
      sender: { id: 'extension-id', tab: { id: 1 } },
      disconnect,
      onDisconnect: { addListener: addDisconnectListener },
    }
    listener?.(validPort)
    expect(onConnectFn).toHaveBeenCalledWith(validPort)
    expect(addDisconnectListener).toHaveBeenCalledOnce()
    disconnectListener?.()
    expect(onDisconnectFn).toHaveBeenCalledOnce()
  })
})
