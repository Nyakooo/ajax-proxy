import { NoticeFrom, NoticeTo, V3PanelMessageKey } from '@proxy/protocol'
import { validateV3Backup } from '@proxy/v3-domain'

const isRecord = (value) => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  try {
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
  } catch {
    return false
  }
}

const hasExactlyKeys = (value, keys) => {
  const ownKeys = Object.keys(value)
  return ownKeys.length === keys.length && ownKeys.every((key) => keys.includes(key))
}

const isIssueList = (value) =>
  Array.isArray(value) &&
  value.every(
    (issue) =>
      isRecord(issue) &&
      hasExactlyKeys(issue, ['path', 'message']) &&
      typeof issue.path === 'string' &&
      typeof issue.message === 'string'
  )

function isSnapshotResponse(value) {
  return (
    isRecord(value) &&
    (value.ok === true
      ? hasExactlyKeys(value, ['ok', 'snapshot']) &&
        isRecord(value.snapshot) &&
        hasExactlyKeys(value.snapshot, ['config', 'hitCounters']) &&
        (value.snapshot.config === null || validateV3Backup(value.snapshot.config).ok) &&
        isRecord(value.snapshot.hitCounters) &&
        Object.values(value.snapshot.hitCounters).every(
          (count) => Number.isSafeInteger(count) && count >= 0
        )
      : value.ok === false &&
        ((hasExactlyKeys(value, ['ok', 'error']) && value.error === 'storage-read-failed') ||
          (hasExactlyKeys(value, ['ok', 'issues']) && isIssueList(value.issues))))
  )
}

function isSaveResponse(value) {
  return (
    isRecord(value) &&
    ((value.ok === true && hasExactlyKeys(value, ['ok'])) ||
      (value.ok === false &&
        ((hasExactlyKeys(value, ['ok', 'error']) && value.error === 'storage-write-failed') ||
          (hasExactlyKeys(value, ['ok', 'issues']) && isIssueList(value.issues)))))
  )
}

function unavailable(error) {
  return { ok: false, error }
}

export function createV3ConfigService(runtime = globalThis.chrome?.runtime) {
  async function send(message, isValidResponse) {
    if (!runtime || typeof runtime.sendMessage !== 'function') {
      return unavailable('extension-api-unavailable')
    }
    try {
      const response = await runtime.sendMessage(message)
      return isValidResponse(response) ? response : unavailable('invalid-response')
    } catch {
      return unavailable('message-failed')
    }
  }

  return {
    getSnapshot() {
      return send(
        {
          from: NoticeFrom.PANELS,
          to: NoticeTo.SERVICE_WORKER,
          key: V3PanelMessageKey.GET_SNAPSHOT,
        },
        isSnapshotResponse
      )
    },
    saveConfig(config) {
      if (config !== null) {
        const validation = validateV3Backup(config)
        if (!validation.ok) return Promise.resolve({ ok: false, issues: validation.issues })
        config = validation.data
      }
      return send(
        {
          from: NoticeFrom.PANELS,
          to: NoticeTo.SERVICE_WORKER,
          key: V3PanelMessageKey.SAVE_CONFIG,
          value: { config },
        },
        isSaveResponse
      )
    },
  }
}
