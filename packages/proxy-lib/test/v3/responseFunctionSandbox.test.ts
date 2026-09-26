import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createV3RequestRedirectFunctionExecutor,
  createV3ResponseFunctionExecutor,
} from '../../src/v3/responseFunctionSandbox'

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
  it('runs redirect functions with only a request snapshot in the shared sandbox', async () => {
    vi.stubGlobal('HTMLIFrameElement', FakeIFrameElement)
    const frame = new FakeIFrameElement()
    let onMessage: ((event: MessageEvent) => void) | undefined
    const host = {
      document: { getElementById: vi.fn(() => frame) },
      addEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') onMessage = listener as (event: MessageEvent) => void
      }),
      crypto: { randomUUID: () => 'redirect-execution-id' },
    } as unknown as Window
    const execute = createV3RequestRedirectFunctionExecutor(host)
    const request = {
      url: 'https://example.test/api',
      method: 'POST',
      body: 'sensitive body',
      headers: { cookie: 'secret' },
    }
    const result = execute('return request.url', request)
    const sendMessage = (data: unknown) =>
      onMessage?.({ origin: 'null', source: frame.contentWindow, data } as MessageEvent)

    sendMessage({ channel: 'ajax-proxy-v3-function-sandbox', type: 'ready' })
    await vi.waitFor(() => expect(frame.contentWindow.postMessage).toHaveBeenCalledOnce())
    const [runMessage] = vi.mocked(frame.contentWindow.postMessage).mock.calls[0] ?? []
    expect(runMessage).toEqual({
      channel: 'ajax-proxy-v3-function-sandbox',
      type: 'run',
      id: 'redirect-execution-id',
      operation: 'redirect',
      code: 'return request.url',
      request: { url: request.url, method: request.method },
    })
    expect(runMessage).not.toHaveProperty('response')

    sendMessage({
      channel: 'ajax-proxy-v3-function-sandbox',
      type: 'result',
      id: 'redirect-execution-id',
      ok: true,
      result: '/redirected',
    })
    await expect(result).resolves.toBe('/redirected')
  })

  it('shares the four-call concurrency limit between response and redirect functions', async () => {
    vi.stubGlobal('HTMLIFrameElement', FakeIFrameElement)
    const frame = new FakeIFrameElement()
    let onMessage: ((event: MessageEvent) => void) | undefined
    let nextId = 0
    const host = {
      document: { getElementById: vi.fn(() => frame) },
      addEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') onMessage = listener as (event: MessageEvent) => void
      }),
      crypto: { randomUUID: () => `mixed-execution-${++nextId}` },
    } as unknown as Window
    const executeResponse = createV3ResponseFunctionExecutor(host)
    const executeRedirect = createV3RequestRedirectFunctionExecutor(host)
    const request = { url: '/api', method: 'GET' }
    const response = { status: 200, statusText: 'OK', headers: {}, body: 'native' }
    const accepted = [
      executeResponse('return response.body', request, response),
      executeRedirect('return request.url', request),
      executeResponse('return response.status', request, response),
      executeRedirect('return request.method', request),
    ]

    await expect(executeRedirect('return request.url', request)).rejects.toThrow(
      'Too many V3 functions are running concurrently.'
    )
    onMessage?.({
      origin: 'null',
      source: frame.contentWindow,
      data: { channel: 'ajax-proxy-v3-function-sandbox', type: 'ready' },
    } as MessageEvent)
    await vi.waitFor(() => expect(frame.contentWindow.postMessage).toHaveBeenCalledTimes(4))

    const runMessages = vi
      .mocked(frame.contentWindow.postMessage)
      .mock.calls.map(([message]) => message as { id: string; operation: string })
    expect(runMessages.map(({ operation }) => operation)).toEqual([
      'response',
      'redirect',
      'response',
      'redirect',
    ])
    for (const { id } of runMessages) {
      onMessage?.({
        origin: 'null',
        source: frame.contentWindow,
        data: {
          channel: 'ajax-proxy-v3-function-sandbox',
          type: 'result',
          id,
          ok: true,
          result: 'mock result',
        },
      } as MessageEvent)
    }
    await expect(Promise.all(accepted)).resolves.toEqual(Array(4).fill('mock result'))
  })

  it('keeps other ready waiters after one execution times out while loading', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('HTMLIFrameElement', FakeIFrameElement)
    const frame = new FakeIFrameElement()
    let onMessage: ((event: MessageEvent) => void) | undefined
    let nextId = 0
    const host = {
      document: { getElementById: vi.fn(() => frame) },
      addEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') onMessage = listener as (event: MessageEvent) => void
      }),
      crypto: { randomUUID: () => `loading-execution-${++nextId}` },
    } as unknown as Window
    const execute = createV3ResponseFunctionExecutor(host)
    const request = { url: '/api', method: 'GET' }
    const response = { status: 200, statusText: 'OK', headers: {}, body: 'native' }
    const earlierExecution = execute('return response.body', request, response)

    await vi.advanceTimersByTimeAsync(4900)
    const laterExecution = execute('return response.status', request, response)
    const earlierRejection = expect(earlierExecution).rejects.toThrow(
      'Function sandbox timed out while loading.'
    )

    await vi.advanceTimersByTimeAsync(100)
    await earlierRejection
    expect(frame.contentWindow.postMessage).not.toHaveBeenCalled()

    onMessage?.({
      origin: 'null',
      source: frame.contentWindow,
      data: { channel: 'ajax-proxy-v3-function-sandbox', type: 'ready' },
    } as MessageEvent)
    await vi.advanceTimersByTimeAsync(0)

    expect(frame.contentWindow.postMessage).toHaveBeenCalledOnce()
    expect(frame.contentWindow.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'run', id: 'loading-execution-2' }),
      '*'
    )
    onMessage?.({
      origin: 'null',
      source: frame.contentWindow,
      data: {
        channel: 'ajax-proxy-v3-function-sandbox',
        type: 'result',
        id: 'loading-execution-2',
        ok: true,
        result: 200,
      },
    } as MessageEvent)

    await expect(laterExecution).resolves.toBe(200)
    expect(frame.remove).not.toHaveBeenCalled()
  })

  it('reuses a ready sandbox frame and accepts round trips only from it', async () => {
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

    // Arrays are valid structured-clone payloads, so this models a real
    // postMessage event while ensuring malformed data cannot mark the frame ready.
    sendMessage('null', frame.contentWindow, ['ajax-proxy-v3-function-sandbox', 'ready'])
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
      operation: 'response',
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
    let resultSettled = false
    void result.then(
      () => {
        resultSettled = true
      },
      () => {
        resultSettled = true
      }
    )
    sendMessage('null', frame.contentWindow, {
      channel: 'ajax-proxy-v3-function-sandbox',
      type: 'result',
      id: 'test-execution-id',
      ok: true,
      result: { body: 'malformed' },
      debug: true,
    })
    await Promise.resolve()
    expect(resultSettled).toBe(false)
    sendMessage('null', frame.contentWindow, {
      channel: 'ajax-proxy-v3-function-sandbox',
      type: 'result',
      id: 'test-execution-id',
      ok: true,
      result: { body: 'mock' },
    })

    await expect(result).resolves.toEqual({ body: 'mock' })

    const reusedExecution = execute('return response.status', request, response)
    await vi.waitFor(() => expect(frame.contentWindow.postMessage).toHaveBeenCalledTimes(2))
    const [reusedRunMessage] = vi.mocked(frame.contentWindow.postMessage).mock.calls[1] ?? []
    expect(reusedRunMessage).toMatchObject({ type: 'run', id: 'test-execution-id' })
    sendMessage('null', frame.contentWindow, {
      channel: 'ajax-proxy-v3-function-sandbox',
      type: 'result',
      id: reusedRunMessage.id,
      ok: true,
      result: { status: 204 },
    })
    await expect(reusedExecution).resolves.toEqual({ status: 204 })
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

  it('rejects sibling executions and clears their timers when a timed-out sandbox is reset', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('HTMLIFrameElement', FakeIFrameElement)
    const frame = new FakeIFrameElement()
    let onMessage: ((event: MessageEvent) => void) | undefined
    let nextId = 0
    const host = {
      document: { getElementById: vi.fn(() => frame) },
      addEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') onMessage = listener as (event: MessageEvent) => void
      }),
      crypto: { randomUUID: () => `reset-execution-${++nextId}` },
    } as unknown as Window
    const execute = createV3ResponseFunctionExecutor(host)
    const request = { url: '/api', method: 'GET' }
    const response = { status: 200, statusText: 'OK', headers: {}, body: 'native' }
    const firstExecution = execute('return response.body', request, response)

    onMessage?.({
      origin: 'null',
      source: frame.contentWindow,
      data: { channel: 'ajax-proxy-v3-function-sandbox', type: 'ready' },
    } as MessageEvent)
    await Promise.resolve()
    await Promise.resolve()
    expect(frame.contentWindow.postMessage).toHaveBeenCalledOnce()

    await vi.advanceTimersByTimeAsync(1000)
    const siblingExecution = execute('return response.status', request, response)
    await Promise.resolve()
    await Promise.resolve()
    expect(frame.contentWindow.postMessage).toHaveBeenCalledTimes(2)

    const firstRejection = expect(firstExecution).rejects.toThrow(
      'Function response timed out after 5 seconds.'
    )
    const siblingRejection = expect(siblingExecution).rejects.toThrow(
      'Function sandbox was reset after a timeout.'
    )
    await vi.advanceTimersByTimeAsync(4000)
    await firstRejection
    expect(frame.contentWindow.postMessage).toHaveBeenLastCalledWith(
      {
        channel: 'ajax-proxy-v3-function-sandbox',
        type: 'cancel',
        id: 'reset-execution-1',
      },
      '*'
    )

    await vi.advanceTimersByTimeAsync(100)
    await siblingRejection
    expect(frame.remove).toHaveBeenCalledOnce()
    expect(frame.contentWindow.postMessage).toHaveBeenCalledTimes(3)

    await vi.advanceTimersByTimeAsync(1000)
    expect(frame.contentWindow.postMessage).toHaveBeenCalledTimes(3)
    expect(frame.contentWindow.postMessage).not.toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'cancel', id: 'reset-execution-2' }),
      '*'
    )
  })

  it('preserves executions on a replacement frame when the old sandbox times out', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('HTMLIFrameElement', FakeIFrameElement)
    const oldFrame = new FakeIFrameElement()
    const replacementFrame = new FakeIFrameElement()
    let currentFrame = oldFrame
    let onMessage: ((event: MessageEvent) => void) | undefined
    let nextId = 0
    const host = {
      document: { getElementById: vi.fn(() => currentFrame) },
      addEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') onMessage = listener as (event: MessageEvent) => void
      }),
      crypto: { randomUUID: () => `replacement-execution-${++nextId}` },
    } as unknown as Window
    const execute = createV3ResponseFunctionExecutor(host)
    const request = { url: '/api', method: 'GET' }
    const response = { status: 200, statusText: 'OK', headers: {}, body: 'native' }
    const deliver = (frame: FakeIFrameElement, data: unknown) =>
      onMessage?.({ origin: 'null', source: frame.contentWindow, data } as MessageEvent)
    const firstExecution = execute('return response.body', request, response)

    deliver(oldFrame, { channel: 'ajax-proxy-v3-function-sandbox', type: 'ready' })
    await Promise.resolve()
    await Promise.resolve()
    expect(oldFrame.contentWindow.postMessage).toHaveBeenCalledOnce()

    await vi.advanceTimersByTimeAsync(1000)
    currentFrame = replacementFrame
    const replacementExecution = execute('return response.status', request, response)
    deliver(replacementFrame, { channel: 'ajax-proxy-v3-function-sandbox', type: 'ready' })
    await Promise.resolve()
    await Promise.resolve()
    expect(replacementFrame.contentWindow.postMessage).toHaveBeenCalledOnce()

    const firstRejection = expect(firstExecution).rejects.toThrow(
      'Function response timed out after 5 seconds.'
    )
    await vi.advanceTimersByTimeAsync(4000)
    await firstRejection
    await vi.advanceTimersByTimeAsync(100)

    expect(oldFrame.remove).toHaveBeenCalledOnce()
    expect(replacementFrame.remove).not.toHaveBeenCalled()
    expect(replacementFrame.contentWindow.postMessage).toHaveBeenCalledOnce()

    deliver(replacementFrame, {
      channel: 'ajax-proxy-v3-function-sandbox',
      type: 'result',
      id: 'replacement-execution-2',
      ok: true,
      result: 200,
    })
    await expect(replacementExecution).resolves.toBe(200)

    await vi.advanceTimersByTimeAsync(900)
    expect(replacementFrame.contentWindow.postMessage).toHaveBeenCalledOnce()
    expect(replacementFrame.remove).not.toHaveBeenCalled()
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
      'Too many V3 functions are running concurrently.'
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

  it('rejects a non-iframe element even when it advertises the sandbox URL', async () => {
    vi.stubGlobal('HTMLIFrameElement', FakeIFrameElement)
    const fakeElement = {
      src: 'chrome-extension://test-extension/v3-sandbox/sandbox.html',
      contentWindow: { postMessage: vi.fn() },
    }
    const host = {
      document: { getElementById: vi.fn(() => fakeElement) },
      addEventListener: vi.fn(),
    } as unknown as Window
    const execute = createV3ResponseFunctionExecutor(host)

    await expect(
      execute(
        'return response.body',
        { url: '/api', method: 'GET' },
        { status: 200, statusText: 'OK', headers: {}, body: 'native' }
      )
    ).rejects.toThrow('Function sandbox is unavailable on this page.')
    expect(fakeElement.contentWindow.postMessage).not.toHaveBeenCalled()
  })

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
