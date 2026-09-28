import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const script = readFileSync(new URL('../src/v3-sandbox/sandbox.js', import.meta.url), 'utf8')
const channel = 'ajax-proxy-v3-function-sandbox'

function createSandbox() {
  let onWindowMessage: ((event: { source: unknown; data: unknown }) => void) | undefined
  const parentMessages: unknown[] = []
  const workers: FakeWorker[] = []
  const parent = { postMessage: vi.fn((message: unknown) => parentMessages.push(message)) }

  class FakeWorker {
    listeners = new Map<string, (event: { data: unknown }) => void>()
    postMessage = vi.fn<(message: unknown) => void>()
    terminate = vi.fn()

    constructor() {
      workers.push(this)
    }

    addEventListener(type: string, listener: (event: { data: unknown }) => void) {
      this.listeners.set(type, listener)
    }
  }

  const context = createContext({
    Blob: class FakeBlob {},
    TextEncoder,
    URL: { createObjectURL: () => 'blob:worker', revokeObjectURL: vi.fn() },
    Worker: FakeWorker,
    clearTimeout,
    parent,
    setTimeout,
    window: {
      addEventListener: (_type: string, listener: typeof onWindowMessage) => {
        onWindowMessage = listener ?? undefined
      },
    },
  })
  runInContext(script, context)

  return {
    parent,
    parentMessages,
    workers,
    dispatch(source: unknown, data: unknown) {
      context.input = JSON.stringify(data)
      const realmData = runInContext('JSON.parse(input)', context)
      onWindowMessage?.({ source, data: realmData })
    },
  }
}

describe('V3 function sandbox page script', () => {
  it('ignores non-parent sources and malformed run envelopes without starting a worker', () => {
    const sandbox = createSandbox()
    const validFields = {
      channel,
      type: 'run',
      id: 'run-1',
      operation: 'redirect',
      code: 'return request.url',
      request: { url: '/api', method: 'GET' },
    }

    sandbox.dispatch({}, validFields)
    sandbox.dispatch(sandbox.parent, { ...validFields, code: undefined })
    sandbox.dispatch(sandbox.parent, { ...validFields, extra: true })

    expect(sandbox.workers).toHaveLength(0)
    expect(
      sandbox.parentMessages.filter((message) => (message as { type?: string }).type === 'result')
    ).toEqual([])
  })

  it('starts a worker only for an exact parent redirect request and forwards allowed fields', () => {
    const sandbox = createSandbox()
    const runRequest = {
      channel,
      type: 'run',
      id: 'redirect-1',
      operation: 'redirect',
      code: 'return request.url',
      request: { url: '/api', method: 'GET' },
    }

    sandbox.dispatch(sandbox.parent, runRequest)

    expect(sandbox.workers).toHaveLength(1)
    expect(sandbox.workers[0].postMessage).toHaveBeenCalledOnce()
    expect(sandbox.workers[0].postMessage).toHaveBeenCalledWith({
      channel,
      type: 'run',
      id: 'redirect-1',
      operation: 'redirect',
      code: 'return request.url',
      request: { url: '/api', method: 'GET' },
    })
  })
})
