import { NoticeFrom, NoticeTo } from './index'

export const V3PanelMessageKey = {
  GET_SNAPSHOT: 'ajax-proxy:notice:v3:get-snapshot',
  SAVE_CONFIG: 'ajax-proxy:notice:v3:save-config',
} as const

export type V3PanelValidationIssue = { path: string; message: string }

export type V3PanelGetSnapshotRequest = {
  from: NoticeFrom.PANELS
  to: NoticeTo.SERVICE_WORKER
  key: typeof V3PanelMessageKey.GET_SNAPSHOT
}

export type V3PanelSaveConfigRequest = {
  from: NoticeFrom.PANELS
  to: NoticeTo.SERVICE_WORKER
  key: typeof V3PanelMessageKey.SAVE_CONFIG
  value: { config: unknown }
}

export type V3PanelMessage = V3PanelGetSnapshotRequest | V3PanelSaveConfigRequest

export type V3PanelGetSnapshotResponse =
  | {
      ok: true
      snapshot: { config: unknown | null; hitCounters: Record<string, number> }
    }
  | { ok: false; issues?: V3PanelValidationIssue[]; error?: 'storage-read-failed' }

export type V3PanelSaveConfigResponse =
  | { ok: true }
  | {
      ok: false
      issues?: V3PanelValidationIssue[]
      error?: 'storage-write-failed'
    }

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  try {
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
  } catch {
    return false
  }
}

function hasExactlyKeys(value: Record<string, unknown>, keys: string[]) {
  const ownKeys = Object.keys(value)
  return ownKeys.length === keys.length && ownKeys.every((key) => keys.includes(key))
}

/** Guard the strict panel-to-service-worker V3 snapshot request envelope. */
export function isV3PanelGetSnapshotRequest(value: unknown): value is V3PanelGetSnapshotRequest {
  if (!isPlainRecord(value)) return false

  try {
    return (
      hasExactlyKeys(value, ['from', 'to', 'key']) &&
      value.from === NoticeFrom.PANELS &&
      value.to === NoticeTo.SERVICE_WORKER &&
      value.key === V3PanelMessageKey.GET_SNAPSHOT
    )
  } catch {
    return false
  }
}

/** Guard the strict panel-to-service-worker V3 configuration save envelope. */
export function isV3PanelSaveConfigRequest(value: unknown): value is V3PanelSaveConfigRequest {
  if (!isPlainRecord(value)) return false

  try {
    return (
      hasExactlyKeys(value, ['from', 'to', 'key', 'value']) &&
      value.from === NoticeFrom.PANELS &&
      value.to === NoticeTo.SERVICE_WORKER &&
      value.key === V3PanelMessageKey.SAVE_CONFIG &&
      isPlainRecord(value.value) &&
      hasExactlyKeys(value.value, ['config'])
    )
  } catch {
    return false
  }
}

/** Guard either supported V3 panel request. */
export function isV3PanelMessage(value: unknown): value is V3PanelMessage {
  return isV3PanelGetSnapshotRequest(value) || isV3PanelSaveConfigRequest(value)
}
