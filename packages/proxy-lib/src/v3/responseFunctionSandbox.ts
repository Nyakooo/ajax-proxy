const CHANNEL = 'ajax-proxy-v3-function-sandbox'
const FRAME_ID = 'ajax-proxy-v3-function-sandbox'
const SANDBOX_PATH = '/v3-sandbox/sandbox.html'
const MAX_CODE_LENGTH = 65536
const MAX_CONCURRENT_FUNCTIONS = 4
const MAX_EXECUTION_MS = 5000
const CANCEL_GRACE_MS = 100

export interface V3FunctionRequestSnapshot {
  url: string
  method: string
  body?: string
}

export interface V3FunctionResponseSnapshot {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
}

export type V3ResponseFunctionExecutor = (
  code: string,
  request: V3FunctionRequestSnapshot,
  response: V3FunctionResponseSnapshot
) => Promise<unknown>

export type V3RequestRedirectFunctionExecutor = (
  code: string,
  request: Pick<V3FunctionRequestSnapshot, 'url' | 'method'>
) => Promise<unknown>

type V3FunctionExecutors = {
  response: V3ResponseFunctionExecutor
  redirect: V3RequestRedirectFunctionExecutor
}

type PendingExecution = {
  frame: HTMLIFrameElement
  frameWindow: Window
  resolve: (result: unknown) => void
  reject: (error: Error) => void
  timer?: ReturnType<typeof setTimeout>
  cancelTimer?: ReturnType<typeof setTimeout>
  timedOut: boolean
  sent: boolean
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
  } catch {
    return false
  }
}

function isSandboxFrame(value: Element | null): value is HTMLIFrameElement {
  if (!(value instanceof HTMLIFrameElement)) return false
  try {
    const url = new URL(value.src)
    return url.protocol === 'chrome-extension:' && url.pathname.endsWith(SANDBOX_PATH)
  } catch {
    return false
  }
}

function createV3FunctionExecutors(host: Window): V3FunctionExecutors {
  const pending = new Map<string, PendingExecution>()
  const readyFrames = new WeakSet<Window>()
  const readyWaiters = new Map<Window, Set<() => void>>()

  const onMessage = (event: MessageEvent) => {
    const frame = host.document.getElementById(FRAME_ID)
    if (
      event.origin !== 'null' ||
      !isSandboxFrame(frame) ||
      event.source !== frame.contentWindow ||
      !isPlainRecord(event.data) ||
      event.data.channel !== CHANNEL
    ) {
      return
    }

    if (event.data.type === 'ready' && Object.keys(event.data).length === 2) {
      const source = event.source as Window
      readyFrames.add(source)
      readyWaiters.get(source)?.forEach((resolve) => resolve())
      readyWaiters.delete(source)
      return
    }

    const result = event.data
    const validSuccess =
      result.ok === true &&
      Object.keys(result).length === 5 &&
      'result' in result &&
      !('error' in result)
    const validFailure =
      result.ok === false &&
      Object.keys(result).length === 5 &&
      typeof result.error === 'string' &&
      result.error.length <= 1000 &&
      !('result' in result)
    if (
      result.type !== 'result' ||
      typeof result.id !== 'string' ||
      (!validSuccess && !validFailure)
    ) {
      return
    }
    const execution = pending.get(result.id)
    if (!execution || execution.frameWindow !== event.source) return
    if (execution.timer) clearTimeout(execution.timer)
    if (execution.cancelTimer) clearTimeout(execution.cancelTimer)
    pending.delete(result.id)

    if (execution.timedOut) {
      execution.frame.remove()
      return
    }
    if (validSuccess) {
      execution.resolve(result.result)
    } else execution.reject(new Error(result.error as string))
  }

  host.addEventListener('message', onMessage)

  function waitUntilReady(frame: HTMLIFrameElement, deadline: number): Promise<Window> {
    const frameWindow = frame.contentWindow
    if (!frameWindow) return Promise.reject(new Error('Function sandbox frame is unavailable.'))
    if (readyFrames.has(frameWindow)) return Promise.resolve(frameWindow)

    return new Promise((resolve, reject) => {
      const remainingMs = deadline - Date.now()
      if (remainingMs <= 0) {
        reject(new Error('Function sandbox timed out while loading.'))
        return
      }
      const finish = () => {
        clearTimeout(timer)
        const waiters = readyWaiters.get(frameWindow)
        waiters?.delete(finish)
        if (waiters?.size === 0) readyWaiters.delete(frameWindow)
        resolve(frameWindow)
      }
      const timer = setTimeout(() => {
        const waiters = readyWaiters.get(frameWindow)
        waiters?.delete(finish)
        if (waiters?.size === 0) readyWaiters.delete(frameWindow)
        reject(new Error('Function sandbox timed out while loading.'))
      }, remainingMs)
      const waiters = readyWaiters.get(frameWindow) ?? new Set<() => void>()
      waiters.add(finish)
      readyWaiters.set(frameWindow, waiters)
      if (readyFrames.has(frameWindow)) finish()
    })
  }

  function createId(): string {
    try {
      return host.crypto.randomUUID()
    } catch {
      return `v3-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
    }
  }

  function cancelWithFallback(id: string, execution: PendingExecution) {
    execution.timedOut = true
    if (execution.sent) {
      try {
        execution.frameWindow.postMessage({ channel: CHANNEL, type: 'cancel', id }, '*')
      } catch {
        // Removing the frame below is the final cancellation boundary.
      }
      execution.cancelTimer = setTimeout(() => {
        if (pending.get(id) !== execution) return
        pending.delete(id)
        execution.frame.remove()
        for (const [pendingId, other] of pending) {
          if (other.frameWindow !== execution.frameWindow) continue
          pending.delete(pendingId)
          if (other.timer) clearTimeout(other.timer)
          if (other.cancelTimer) clearTimeout(other.cancelTimer)
          other.reject(new Error('Function sandbox was reset after a timeout.'))
        }
      }, CANCEL_GRACE_MS)
    } else {
      pending.delete(id)
    }
    execution.reject(new Error('Function response timed out after 5 seconds.'))
  }

  let activeCalls = 0
  const execute = async (
    operation: 'response' | 'redirect',
    code: string,
    request: V3FunctionRequestSnapshot | Pick<V3FunctionRequestSnapshot, 'url' | 'method'>,
    response?: V3FunctionResponseSnapshot
  ) => {
    if (typeof code !== 'string' || code.trim() === '' || code.length > MAX_CODE_LENGTH) {
      throw new Error('Function source is empty or exceeds 65,536 characters.')
    }
    if (activeCalls >= MAX_CONCURRENT_FUNCTIONS) {
      throw new Error('Too many V3 functions are running concurrently.')
    }
    activeCalls += 1

    try {
      const frame = host.document.getElementById(FRAME_ID)
      if (!isSandboxFrame(frame)) throw new Error('Function sandbox is unavailable on this page.')

      const id = createId()
      const deadline = Date.now() + MAX_EXECUTION_MS
      const frameWindow = await waitUntilReady(frame, deadline)
      if (host.document.getElementById(FRAME_ID) !== frame) {
        throw new Error('Function sandbox frame changed while loading.')
      }

      return await new Promise<unknown>((resolve, reject) => {
        const execution: PendingExecution = {
          frame,
          frameWindow,
          resolve,
          reject,
          timedOut: false,
          sent: false,
        }
        const remainingMs = deadline - Date.now()
        if (remainingMs <= 0) {
          reject(new Error('Function response timed out after 5 seconds.'))
          return
        }
        execution.timer = setTimeout(() => cancelWithFallback(id, execution), remainingMs)
        pending.set(id, execution)

        try {
          const message =
            operation === 'response'
              ? { channel: CHANNEL, type: 'run', id, operation, code, request, response }
              : {
                  channel: CHANNEL,
                  type: 'run',
                  id,
                  operation,
                  code,
                  request: { url: request.url, method: request.method },
                }
          frameWindow.postMessage(message, '*')
          execution.sent = true
        } catch (error) {
          clearTimeout(execution.timer)
          pending.delete(id)
          reject(error instanceof Error ? error : new Error('Could not message function sandbox.'))
        }
      })
    } finally {
      activeCalls -= 1
    }
  }

  return {
    response: (code, request, response) => execute('response', code, request, response),
    redirect: (code, request) => execute('redirect', code, request),
  }
}

const executorCache = new WeakMap<Window, V3FunctionExecutors>()

function getV3FunctionExecutors(host: Window): V3FunctionExecutors {
  let executors = executorCache.get(host)
  if (!executors) {
    executors = createV3FunctionExecutors(host)
    executorCache.set(host, executors)
  }
  return executors
}

export function createV3ResponseFunctionExecutor(host: Window): V3ResponseFunctionExecutor {
  return getV3FunctionExecutors(host).response
}

export function createV3RequestRedirectFunctionExecutor(
  host: Window
): V3RequestRedirectFunctionExecutor {
  return getV3FunctionExecutors(host).redirect
}
