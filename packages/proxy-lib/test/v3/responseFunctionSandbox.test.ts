import { afterEach, describe, expect, it, vi } from 'vitest'
import { createV3ResponseFunctionExecutor } from '../../src/v3/responseFunctionSandbox'

class FakeIFrameElement {
  src = 'chrome-extension://test-extension/v3-sandbox/sandbox.html'
  contentWindow = { postMessage: vi.fn() } as unknown as Window
  remove = vi.fn()
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('createV3ResponseFunctionExecutor', () => {
  it('accepts a round trip only from the configured sandbox frame', async () => {
    vi.stubGlobal('HTMLIFrameElement', FakeIFrameElement)
    const frame = new FakeIFrameElement()
    const otherWindow = {} as Window
    let onMessage: ((event: MessageEvent) => void) | undefined
    const host = {
      document: { getElementById: vi.fn(() => frame) },
      addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === 'message' && typeof listener === 'function') {
          onMessage = listener as (event: MessageEvent) => void
        }
      }),
      crypto: { randomUUID: () => 'test-execution-id' },
    } as unknown as Window
    const execute = createV3ResponseFunctionExecutor(host)
    const request = { url: 'https://example.test/api', method: 'GET' }
    const response = { status: 200, statusText: 'OK', headers: {}, body: 'native' }
    const result = execute('return response.body', request, response)
    const sendMessage = (origin: string, source: Window, data: unknown) => {
      onMessage?.({ origin, source, data } as MessageEvent)
    }

    sendMessage('null', otherWindow, {
      channel: 'ajax-proxy-v3-function-sandbox',
      type: 'ready',
    })
    await Promise.resolve()
    expect(frame.contentWindow.postMessage).not.toHaveBeenCalled()

    sendMessage('null', frame.contentWindow, {
      channel: 'ajax-proxy-v3-function-sandbox',
      type: 'ready',
    })
    await vi.waitFor(() => expect(frame.contentWindow.postMessage).toHaveBeenCalledOnce())

    const [runMessage] = vi.mocked(frame.contentWindow.postMessage).mock.calls[0] ?? []
    expect(runMessage).toMatchObject({
      channel: 'ajax-proxy-v3-function-sandbox',
      type: 'run',
      id: 'test-execution-id',
      code: 'return response.body',
      request,
      response,
    })

    sendMessage('null', otherWindow, {
      channel: 'ajax-proxy-v3-function-sandbox',
      type: 'result',
      id: 'test-execution-id',
      ok: true,
      result: { body: 'forged' },
    })
    sendMessage('null', frame.contentWindow, {
      channel: 'ajax-proxy-v3-function-sandbox',
      type: 'result',
      id: 'test-execution-id',
      ok: true,
      result: { body: 'mock' },
    })

    await expect(result).resolves.toEqual({ body: 'mock' })
  })

  it('rejects with a validated sandbox error result', async () => {
    vi.stubGlobal('HTMLIFrameElement', FakeIFrameElement)
    const frame = new FakeIFrameElement()
    let onMessage: ((event: MessageEvent) => void) | undefined
    const host = {
      document: { getElementById: vi.fn(() => frame) },
      addEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') onMessage = listener as (event: MessageEvent) => void
      }),
      crypto: { randomUUID: () => 'failed-execution-id' },
    } as unknown as Window
    const execute = createV3ResponseFunctionExecutor(host)
    const result = execute(
      'throw new Error("expected")',
      { url: '/api', method: 'GET' },
      {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: 'native',
      }
    )
    const sendMessage = (data: unknown) =>
      onMessage?.({ origin: 'null', source: frame.contentWindow, data } as MessageEvent)

    sendMessage({ channel: 'ajax-proxy-v3-function-sandbox', type: 'ready' })
    await vi.waitFor(() => expect(frame.contentWindow.postMessage).toHaveBeenCalledOnce())
    sendMessage({
      channel: 'ajax-proxy-v3-function-sandbox',
      type: 'result',
      id: 'failed-execution-id',
      ok: false,
      error: 'Sandbox function failed.',
    })

    await expect(result).rejects.toThrow('Sandbox function failed.')
  })

  it('cancels a timed-out execution and removes the sandbox frame after the grace period', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('HTMLIFrameElement', FakeIFrameElement)
    const frame = new FakeIFrameElement()
    let onMessage: ((event: MessageEvent) => void) | undefined
    const host = {
      document: { getElementById: vi.fn(() => frame) },
      addEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') onMessage = listener as (event: MessageEvent) => void
      }),
      crypto: { randomUUID: () => 'timeout-execution-id' },
    } as unknown as Window
    const execute = createV3ResponseFunctionExecutor(host)
    const result = execute(
      'while (true) {}',
      { url: '/api', method: 'GET' },
      {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: 'native',
      }
    )
    const sendMessage = (data: unknown) =>
      onMessage?.({ origin: 'null', source: frame.contentWindow, data } as MessageEvent)

    await Promise.resolve()
    sendMessage({ channel: 'ajax-proxy-v3-function-sandbox', type: 'ready' })
    await Promise.resolve()
    await Promise.resolve()
    expect(frame.contentWindow.postMessage).toHaveBeenCalledOnce()

    const rejection = expect(result).rejects.toThrow('Function response timed out after 5 seconds.')
    await vi.advanceTimersByTimeAsync(5000)
    await rejection
    expect(frame.contentWindow.postMessage).toHaveBeenLastCalledWith(
      {
        channel: 'ajax-proxy-v3-function-sandbox',
        type: 'cancel',
        id: 'timeout-execution-id',
      },
      '*'
    )
    expect(frame.remove).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(100)
    expect(frame.remove).toHaveBeenCalledOnce()
  })
})
