'use strict'

const CHANNEL = 'ajax-proxy-v3-function-sandbox'
const MAX_CODE_LENGTH = 64 * 1024
const MAX_VALUE_DEPTH = 40
const MAX_VALUE_NODES = 10000
const MAX_VALUE_BYTES = 1024 * 1024
const MAX_ACTIVE_WORKERS = 4
const MAX_WORKER_MS = 5000
const MAX_RECENT_IDS = 1000
const activeWorkers = new Map()
const seenIds = new Set()
const recentIds = []

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isJsonValue(value, state = { depth: 0, nodes: 0, seen: new Set() }) {
  state.nodes += 1
  if (state.nodes > MAX_VALUE_NODES || state.depth > MAX_VALUE_DEPTH) return false
  if (value === null || typeof value === 'boolean') return true
  if (typeof value === 'string') return value.length <= 1024 * 1024
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object' || state.seen.has(value)) return false
  if (!Array.isArray(value) && !isRecord(value)) return false

  state.seen.add(value)
  const children = Array.isArray(value) ? value : Object.values(value)
  if (children.length > 10000) return false
  state.depth += 1
  const valid = children.every((child) => isJsonValue(child, state))
  state.depth -= 1
  state.seen.delete(value)
  return valid
}

function fitsJsonByteLimit(value) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength <= MAX_VALUE_BYTES
  } catch {
    return false
  }
}

function send(message) {
  parent.postMessage({ channel: CHANNEL, ...message }, '*')
}

function reject(id, error) {
  send({ type: 'result', id, ok: false, error })
}

function stopWorker(id) {
  const record = activeWorkers.get(id)
  if (!record) return false
  clearTimeout(record.timeout)
  activeWorkers.delete(id)
  record.worker.terminate()
  return true
}

function handleRun(message) {
  const { id, code, request, response } = message
  if (typeof id !== 'string' || id.length < 1 || id.length > 128) return
  if (activeWorkers.has(id)) {
    reject(id, 'Duplicate active request id')
    return
  }
  if (
    typeof code !== 'string' ||
    code.length === 0 ||
    code.length > MAX_CODE_LENGTH ||
    !isJsonValue(request) ||
    !isJsonValue(response) ||
    !fitsJsonByteLimit({ request, response })
  ) {
    reject(id, 'Invalid sandbox request')
    return
  }
  if (seenIds.has(id)) {
    reject(id, 'Duplicate request id')
    return
  }
  if (activeWorkers.size >= MAX_ACTIVE_WORKERS) {
    reject(id, 'Sandbox concurrency limit reached')
    return
  }
  seenIds.add(id)
  recentIds.push(id)
  if (recentIds.length > MAX_RECENT_IDS) seenIds.delete(recentIds.shift())

  const workerSource = `
    'use strict';
    const CHANNEL = ${JSON.stringify(CHANNEL)};
    const MAX_DEPTH = ${MAX_VALUE_DEPTH};
    const MAX_NODES = ${MAX_VALUE_NODES};
    const MAX_BYTES = ${MAX_VALUE_BYTES};
    function isRecord(value) {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
      const prototype = Object.getPrototypeOf(value);
      return prototype === Object.prototype || prototype === null;
    }
    function isJsonValue(value, state = { depth: 0, nodes: 0, seen: new Set() }) {
      state.nodes += 1;
      if (state.nodes > MAX_NODES || state.depth > MAX_DEPTH) return false;
      if (value === null || typeof value === 'boolean') return true;
      if (typeof value === 'string') return value.length <= 1024 * 1024;
      if (typeof value === 'number') return Number.isFinite(value);
      if (typeof value !== 'object' || state.seen.has(value)) return false;
      if (!Array.isArray(value) && !isRecord(value)) return false;
      state.seen.add(value);
      const children = Array.isArray(value) ? value : Object.values(value);
      if (children.length > 10000) return false;
      state.depth += 1;
      const valid = children.every((child) => isJsonValue(child, state));
      state.depth -= 1;
      state.seen.delete(value);
      return valid;
    }
    function fitsJsonByteLimit(value) {
      try { return new TextEncoder().encode(JSON.stringify(value)).byteLength <= MAX_BYTES; }
      catch { return false; }
    }
    self.onmessage = async (event) => {
      const message = event.data;
      if (!message || message.channel !== CHANNEL || message.type !== 'run') return;
        const { id, code, request, response } = message;
      let reply;
      try {
        if (Object.keys(message).length !== 6 || typeof id !== 'string' || typeof code !== 'string' || code.length === 0 || code.length > 64 * 1024 || !isJsonValue(request) || !isJsonValue(response) || !fitsJsonByteLimit({ request, response })) {
          throw new Error('Invalid worker request');
        }
        const operation = new Function('request', 'response', code);
        const result = await operation(request, response);
        if (result === undefined) throw new Error('Function must return a JSON value.');
        if (!isJsonValue(result) || !fitsJsonByteLimit(result)) throw new Error('Worker result is not JSON serializable or exceeds 1 MiB');
        reply = { channel: CHANNEL, type: 'result', id, ok: true, result };
      } catch (error) {
        reply = { channel: CHANNEL, type: 'result', id, ok: false, error: String(error && error.message || error).slice(0, 1000) };
      }
      try {
        self.postMessage(reply);
      } catch (error) {
        self.postMessage({ channel: CHANNEL, type: 'result', id, ok: false, error: 'Worker result could not be cloned' });
      }
      self.close();
    };
  `
  const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }))
  const worker = new Worker(workerUrl)
  URL.revokeObjectURL(workerUrl)
  const timeout = setTimeout(() => {
    stopWorker(id)
    reject(id, 'Function response timed out after 5 seconds.')
  }, MAX_WORKER_MS)
  activeWorkers.set(id, { worker, timeout })
  worker.addEventListener('message', (event) => {
    const result = event.data
    if (
      !isRecord(result) ||
      result.channel !== CHANNEL ||
      result.type !== 'result' ||
      result.id !== id ||
      typeof result.ok !== 'boolean'
    ) {
      stopWorker(id)
      reject(id, 'Invalid worker result')
      return
    }
    stopWorker(id)
    if (
      result.ok &&
      (!('result' in result) || !isJsonValue(result.result) || !fitsJsonByteLimit(result.result))
    ) {
      reject(id, 'Worker result is not JSON serializable')
      return
    }
    send(result)
  })
  worker.addEventListener('error', (event) => {
    stopWorker(id)
    reject(id, String(event.message || 'Sandbox worker failed').slice(0, 1000))
  })
  worker.postMessage({ channel: CHANNEL, type: 'run', id, code, request, response })
}

window.addEventListener('message', (event) => {
  if (event.source !== parent || !isRecord(event.data) || event.data.channel !== CHANNEL) return
  const message = event.data
  if (message.type === 'run') {
    if (Object.keys(message).length !== 6) return
    handleRun(message)
    return
  }
  if (
    message.type === 'cancel' &&
    Object.keys(message).length === 3 &&
    typeof message.id === 'string' &&
    message.id.length > 0 &&
    message.id.length <= 128
  ) {
    if (stopWorker(message.id)) reject(message.id, 'Sandbox request cancelled')
  }
})

send({ type: 'ready' })
