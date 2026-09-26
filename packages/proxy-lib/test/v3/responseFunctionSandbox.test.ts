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
      id: 'stale-execution-id',
      ok: true,
      result: { body: 'stale' },
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

  it('uses a fallback execution id when crypto.randomUUID throws', async () => {
    vi.stubGlobal('HTMLIFrameElement', FakeIFrameElement)
    const frame = new FakeIFrameElement()
    let onMessage: ((event: MessageEvent) => void) | undefined
    const randomUUID = vi.fn(() => {
      throw new Error('randomUUID unavailable')
    })
    const host = {
      document: { getElementById: vi.fn(() => frame) },
      addEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') onMessage = listener as (event: MessageEvent) => void
      }),
      crypto: { randomUUID },
    } as unknown as Window
    const execute = createV3ResponseFunctionExecutor(host)
    const result = execute(
      'return response.body',
      { url: '/api', method: 'GET' },
      { status: 200, statusText: 'OK', headers: {}, body: 'native' }
    )
    const sendMessage = (data: unknown) =>
      onMessage?.({ origin: 'null', source: frame.contentWindow, data } as MessageEvent)

    sendMessage({ channel: 'ajax-proxy-v3-function-sandbox', type: 'ready' })
    await vi.waitFor(() => expect(frame.contentWindow.postMessage).toHaveBeenCalledOnce())
    const [runMessage] = vi.mocked(frame.contentWindow.postMessage).mock.calls[0] ?? []
    expect(randomUUID).toHaveBeenCalledOnce()
    expect(runMessage.id).toMatch(/^v3-[a-z0-9]+-[a-z0-9]+$/)

    sendMessage({
      channel: 'ajax-proxy-v3-function-sandbox',
      type: 'result',
      id: runMessage.id,
      ok: true,
      result: { body: 'fallback' },
    })
    await expect(result).resolves.toEqual({ body: 'fallback' })
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

  it('rejects when the ready sandbox cannot receive the run message', async () => {
    vi.stubGlobal('HTMLIFrameElement', FakeIFrameElement)
    const frame = new FakeIFrameElement()
    const sendError = new Error('sandbox message channel unavailable')
    frame.contentWindow.postMessage = vi.fn(() => {
      throw sendError
    }) as unknown as typeof frame.contentWindow.postMessage
    let onMessage: ((event: MessageEvent) => void) | undefined
    const host = {
      document: { getElementById: vi.fn(() => frame) },
      addEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') onMessage = listener as (event: MessageEvent) => void
      }),
      crypto: { randomUUID: () => 'message-failure-id' },
    } as unknown as Window
    const execute = createV3ResponseFunctionExecutor(host)
    const result = execute(
      'return response.body',
      { url: '/api', method: 'GET' },
      { status: 200, statusText: 'OK', headers: {}, body: 'native' }
    )

    onMessage?.({
      origin: 'null',
      source: frame.contentWindow,
      data: { channel: 'ajax-proxy-v3-function-sandbox', type: 'ready' },
    } as MessageEvent)

    await expect(result).rejects.toBe(sendError)
    expect(frame.contentWindow.postMessage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: 'run', id: 'message-failure-id' }),
      '*'
    )
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

  it('removes the sandbox after timeout even when sending cancel fails', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('HTMLIFrameElement', FakeIFrameElement)
    const frame = new FakeIFrameElement()
    const cancelError = new Error('sandbox cancel channel unavailable')
    frame.contentWindow.postMessage = vi.fn((message: { type: string }) => {
      if (message.type === 'cancel') throw cancelError
    }) as unknown as typeof frame.contentWindow.postMessage
    let onMessage: ((event: MessageEvent) => void) | undefined
    const host = {
      document: { getElementById: vi.fn(() => frame) },
      addEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') onMessage = listener as (event: MessageEvent) => void
      }),
      crypto: { randomUUID: () => 'cancel-failure-timeout-id' },
    } as unknown as Window
    const execute = createV3ResponseFunctionExecutor(host)
    const result = execute(
      'while (true) {}',
      { url: '/api', method: 'GET' },
      { status: 200, statusText: 'OK', headers: {}, body: 'native' }
    )

    await Promise.resolve()
    onMessage?.({
      origin: 'null',
      source: frame.contentWindow,
      data: { channel: 'ajax-proxy-v3-function-sandbox', type: 'ready' },
    } as MessageEvent)
    await Promise.resolve()
    await Promise.resolve()
    expect(frame.contentWindow.postMessage).toHaveBeenCalledOnce()

    const rejection = expect(result).rejects.toThrow('Function response timed out after 5 seconds.')
    await vi.advanceTimersByTimeAsync(5000)
    await rejection
    expect(frame.contentWindow.postMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ type: 'run', id: 'cancel-failure-timeout-id' }),
      '*'
    )
    expect(frame.contentWindow.postMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ type: 'cancel', id: 'cancel-failure-timeout-id' }),
      '*'
    )
    expect(frame.remove).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(100)
    expect(frame.remove).toHaveBeenCalledOnce()
  })

  it('rejects empty or oversized source before looking up a sandbox frame', async () => {
    const getElementById = vi.fn()
    const host = {
      document: { getElementById },
      addEventListener: vi.fn(),
    } as unknown as Window
    const execute = createV3ResponseFunctionExecutor(host)
    const request = { url: '/api', method: 'GET' }
    const response = { status: 200, statusText: 'OK', headers: {}, body: '' }

    await expect(execute('  ', request, response)).rejects.toThrow(
      'Function source is empty or exceeds 65,536 characters.'
    )
    await expect(execute('x'.repeat(65_537), request, response)).rejects.toThrow(
      'Function source is empty or exceeds 65,536 characters.'
    )
    expect(getElementById).not.toHaveBeenCalled()
  })

  it('limits concurrent executions without losing accepted requests', async () => {
    vi.stubGlobal('HTMLIFrameElement', FakeIFrameElement)
    const frame = new FakeIFrameElement()
    let onMessage: ((event: MessageEvent) => void) | undefined
    let nextId = 0
    const host = {
      document: { getElementById: vi.fn(() => frame) },
      addEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') onMessage = listener as (event: MessageEvent) => void
      }),
      crypto: { randomUUID: () => `execution-${++nextId}` },
    } as unknown as Window
    const execute = createV3ResponseFunctionExecutor(host)
    const request = { url: '/api', method: 'GET' }
    const response = { status: 200, statusText: 'OK', headers: {}, body: 'native' }
    const accepted = Array.from({ length: 4 }, () =>
      execute('return response.body', request, response)
    )

    await expect(execute('return response.body', request, response)).rejects.toThrow(
      'Too many V3 response functions are running concurrently.'
    )
    onMessage?.({
      origin: 'null',
      source: frame.contentWindow,
      data: { channel: 'ajax-proxy-v3-function-sandbox', type: 'ready' },
    } as MessageEvent)
    await vi.waitFor(() => expect(frame.contentWindow.postMessage).toHaveBeenCalledTimes(4))

    const runMessages = vi
      .mocked(frame.contentWindow.postMessage)
      .mock.calls.map(([message]) => message as { id: string })
    for (const { id } of runMessages) {
      onMessage?.({
        origin: 'null',
        source: frame.contentWindow,
        data: {
          channel: 'ajax-proxy-v3-function-sandbox',
          type: 'result',
          id,
          ok: true,
          result: 'mock response',
        },
      } as MessageEvent)
    }

    await expect(Promise.all(accepted)).resolves.toEqual(Array(4).fill('mock response'))
  })

  it.each([
    'https://example.test/v3-sandbox/sandbox.html',
    'chrome-extension://test-extension/other.html',
  ])(
    'rejects non-extension URLs or extension resources outside the sandbox path: %s',
    async (src) => {
      vi.stubGlobal('HTMLIFrameElement', FakeIFrameElement)
      const frame = new FakeIFrameElement()
      frame.src = src
      const host = {
        document: { getElementById: vi.fn(() => frame) },
        addEventListener: vi.fn(),
      } as unknown as Window
      const execute = createV3ResponseFunctionExecutor(host)

      await expect(
        execute(
          'return response.body',
          { url: '/api', method: 'GET' },
          {
            status: 200,
            statusText: 'OK',
            headers: {},
            body: 'native',
          }
        )
      ).rejects.toThrow('Function sandbox is unavailable on this page.')
      expect(frame.contentWindow.postMessage).not.toHaveBeenCalled()
    }
  )

  it('ignores malformed or untrusted ready messages and times out while loading', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('HTMLIFrameElement', FakeIFrameElement)
    const frame = new FakeIFrameElement()
    const otherWindow = {} as Window
    let onMessage: ((event: MessageEvent) => void) | undefined
    const host = {
      document: { getElementById: vi.fn(() => frame) },
      addEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') onMessage = listener as (event: MessageEvent) => void
      }),
      crypto: { randomUUID: () => 'invalid-ready-execution' },
    } as unknown as Window
    const execute = createV3ResponseFunctionExecutor(host)
    const execution = execute(
      'return response.body',
      { url: '/api', method: 'GET' },
      {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: 'native',
      }
    )
    await Promise.resolve()
    const deliver = (origin: string, source: Window, data: unknown) =>
      onMessage?.({ origin, source, data } as MessageEvent)
    const ready = { channel: 'ajax-proxy-v3-function-sandbox', type: 'ready' }

    deliver('https://example.test', frame.contentWindow, ready)
    deliver('null', otherWindow, ready)
    deliver('null', frame.contentWindow, { ...ready, unexpected: true })
    expect(frame.contentWindow.postMessage).not.toHaveBeenCalled()

    const rejection = expect(execution).rejects.toThrow('Function sandbox timed out while loading.')
    await vi.advanceTimersByTimeAsync(5000)
    await rejection
  })

  it('does not execute when the sandbox frame is replaced while loading', async () => {
    vi.stubGlobal('HTMLIFrameElement', FakeIFrameElement)
    const frame = new FakeIFrameElement()
    const replacementFrame = new FakeIFrameElement()
    const getElementById = vi
      .fn()
      .mockReturnValueOnce(frame)
      .mockReturnValueOnce(frame)
      .mockReturnValue(replacementFrame)
    let onMessage: ((event: MessageEvent) => void) | undefined
    const host = {
      document: { getElementById },
      addEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') onMessage = listener as (event: MessageEvent) => void
      }),
      crypto: { randomUUID: () => 'replaced-frame-execution-id' },
    } as unknown as Window
    const execute = createV3ResponseFunctionExecutor(host)
    const execution = execute(
      'return response.body',
      { url: '/api', method: 'GET' },
      { status: 200, statusText: 'OK', headers: {}, body: 'native' }
    )

    onMessage?.({
      origin: 'null',
      source: frame.contentWindow,
      data: { channel: 'ajax-proxy-v3-function-sandbox', type: 'ready' },
    } as MessageEvent)

    await expect(execution).rejects.toThrow('Function sandbox frame changed while loading.')
    expect(frame.contentWindow.postMessage).not.toHaveBeenCalled()
    expect(replacementFrame.contentWindow.postMessage).not.toHaveBeenCalled()
  })

  it('removes the sandbox when a timed-out execution responds during cancellation grace', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('HTMLIFrameElement', FakeIFrameElement)
    const frame = new FakeIFrameElement()
    let onMessage: ((event: MessageEvent) => void) | undefined
    const host = {
      document: { getElementById: vi.fn(() => frame) },
      addEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') onMessage = listener as (event: MessageEvent) => void
      }),
      crypto: { randomUUID: () => 'late-execution-id' },
    } as unknown as Window
    const execute = createV3ResponseFunctionExecutor(host)
    const execution = execute(
      'return response.body',
      { url: '/api', method: 'GET' },
      {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: 'native',
      }
    )
    const deliver = (data: unknown) =>
      onMessage?.({ origin: 'null', source: frame.contentWindow, data } as MessageEvent)
    await Promise.resolve()
    deliver({ channel: 'ajax-proxy-v3-function-sandbox', type: 'ready' })
    await Promise.resolve()
    await Promise.resolve()
    expect(frame.contentWindow.postMessage).toHaveBeenCalledOnce()

    const rejection = expect(execution).rejects.toThrow(
      'Function response timed out after 5 seconds.'
    )
    await vi.advanceTimersByTimeAsync(5000)
    await rejection
    expect(frame.remove).not.toHaveBeenCalled()

    deliver({
      channel: 'ajax-proxy-v3-function-sandbox',
      type: 'result',
      id: 'late-execution-id',
      ok: true,
      result: 'too late',
    })
    expect(frame.remove).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(100)
    expect(frame.remove).toHaveBeenCalledOnce()
  })

  it('rejects and clears a pending call when posting to the sandbox throws', async () => {
    vi.stubGlobal('HTMLIFrameElement', FakeIFrameElement)
    const frame = new FakeIFrameElement()
    const postMessage = vi.fn(() => {
      throw new Error('sandbox message blocked')
    })
    Object.defineProperty(frame.contentWindow, 'postMessage', { value: postMessage })
    let onMessage: ((event: MessageEvent) => void) | undefined
    const host = {
      document: { getElementById: vi.fn(() => frame) },
      addEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') onMessage = listener as (event: MessageEvent) => void
      }),
      crypto: { randomUUID: () => 'posting-failure-id' },
    } as unknown as Window
    const execute = createV3ResponseFunctionExecutor(host)
    const execution = execute(
      'return response.body',
      { url: '/api', method: 'GET' },
      {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: 'native',
      }
    )
    await Promise.resolve()
    onMessage?.({
      origin: 'null',
      source: frame.contentWindow,
      data: { channel: 'ajax-proxy-v3-function-sandbox', type: 'ready' },
    } as MessageEvent)

    await expect(execution).rejects.toThrow('sandbox message blocked')
    expect(postMessage).toHaveBeenCalledOnce()
    expect(frame.remove).not.toHaveBeenCalled()
  })
})
