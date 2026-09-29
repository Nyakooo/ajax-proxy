import { NoticeFrom, NoticeTo } from './index'

export const V3PanelMessageKey = {
  GET_SNAPSHOT: 'ajax-proxy:notice:v3:get-snapshot',
  SAVE_CONFIG: 'ajax-proxy:notice:v3:save-config',
  CLEAR_HIT_COUNTERS: 'ajax-proxy:notice:v3:clear-hit-counters',
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
  value: { config: unknown; expectedRevision: string }
}

export type V3PanelClearHitCountersTarget = { scope: 'all' } | { scope: 'rule'; ruleId: string }

export type V3PanelClearHitCountersRequest = {
  from: NoticeFrom.PANELS
  to: NoticeTo.SERVICE_WORKER
  key: typeof V3PanelMessageKey.CLEAR_HIT_COUNTERS
  value: V3PanelClearHitCountersTarget
}

export type V3PanelMessage =
  V3PanelGetSnapshotRequest | V3PanelSaveConfigRequest | V3PanelClearHitCountersRequest

export type V3PanelGetSnapshotResponse =
  | {
      ok: true
      snapshot: { config: unknown | null; hitCounters: Record<string, number>; revision: string }
    }
  | { ok: false; issues: V3PanelValidationIssue[] }
  | { ok: false; error: 'storage-read-failed' }

export type V3PanelSaveConfigResponse =
  | { ok: true; revision: string }
  | { ok: false; issues: V3PanelValidationIssue[] }
  | { ok: false; error: 'storage-write-failed' | 'storage-read-failed' }
  | {
      ok: false
      error: 'config-conflict'
      current: { config: unknown | null; revision: string }
    }

export type V3PanelClearHitCountersResponse =
  | { ok: true; hitCounters: Record<string, number> }
  | { ok: false; issues: V3PanelValidationIssue[] }
  | { ok: false; error: 'storage-read-failed' | 'storage-write-failed' | 'rule-not-found' }

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

function getOwnDataProperty(value: Record<string, unknown>, key: string) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  return descriptor !== undefined && 'value' in descriptor
    ? { ok: true as const, value: descriptor.value }
    : { ok: false as const, value: undefined }
}

/** Guard the strict panel-to-service-worker V3 snapshot request envelope. */
export function isV3PanelGetSnapshotRequest(value: unknown): value is V3PanelGetSnapshotRequest {
  if (!isPlainRecord(value)) return false

  try {
    const from = getOwnDataProperty(value, 'from')
    const to = getOwnDataProperty(value, 'to')
    const key = getOwnDataProperty(value, 'key')
    return (
      hasExactlyKeys(value, ['from', 'to', 'key']) &&
      from.ok &&
      from.value === NoticeFrom.PANELS &&
      to.ok &&
      to.value === NoticeTo.SERVICE_WORKER &&
      key.ok &&
      key.value === V3PanelMessageKey.GET_SNAPSHOT
    )
  } catch {
    return false
  }
}

/** Guard the strict panel-to-service-worker V3 configuration save envelope. */
export function isV3PanelSaveConfigRequest(value: unknown): value is V3PanelSaveConfigRequest {
  if (!isPlainRecord(value)) return false

  try {
    const from = getOwnDataProperty(value, 'from')
    const to = getOwnDataProperty(value, 'to')
    const key = getOwnDataProperty(value, 'key')
    const messageValue = getOwnDataProperty(value, 'value')
    if (!messageValue.ok || !isPlainRecord(messageValue.value)) return false
    const config = getOwnDataProperty(messageValue.value, 'config')
    const expectedRevision = getOwnDataProperty(messageValue.value, 'expectedRevision')
    return (
      hasExactlyKeys(value, ['from', 'to', 'key', 'value']) &&
      from.ok &&
      from.value === NoticeFrom.PANELS &&
      to.ok &&
      to.value === NoticeTo.SERVICE_WORKER &&
      key.ok &&
      key.value === V3PanelMessageKey.SAVE_CONFIG &&
      hasExactlyKeys(messageValue.value, ['config', 'expectedRevision']) &&
      config.ok &&
      expectedRevision.ok &&
      typeof expectedRevision.value === 'string'
    )
  } catch {
    return false
  }
}

/** Guard a request to clear all V3 hit counters or one rule's counter. */
export function isV3PanelClearHitCountersRequest(
  value: unknown
): value is V3PanelClearHitCountersRequest {
  if (!isPlainRecord(value)) return false
  try {
    const from = getOwnDataProperty(value, 'from')
    const to = getOwnDataProperty(value, 'to')
    const key = getOwnDataProperty(value, 'key')
    const messageValue = getOwnDataProperty(value, 'value')
    if (!messageValue.ok || !isPlainRecord(messageValue.value)) return false
    const scope = getOwnDataProperty(messageValue.value, 'scope')
    if (
      !hasExactlyKeys(value, ['from', 'to', 'key', 'value']) ||
      !from.ok ||
      from.value !== NoticeFrom.PANELS ||
      !to.ok ||
      to.value !== NoticeTo.SERVICE_WORKER ||
      !key.ok ||
      key.value !== V3PanelMessageKey.CLEAR_HIT_COUNTERS ||
      !scope.ok
    ) {
      return false
    }
    if (scope.value === 'all') return hasExactlyKeys(messageValue.value, ['scope'])
    const ruleId = getOwnDataProperty(messageValue.value, 'ruleId')
    return (
      scope.value === 'rule' &&
      hasExactlyKeys(messageValue.value, ['scope', 'ruleId']) &&
      ruleId.ok &&
      typeof ruleId.value === 'string' &&
      ruleId.value.length > 0 &&
      ruleId.value.length <= 256
    )
  } catch {
    return false
  }
}

/** Guard either supported V3 panel request. */
export function isV3PanelMessage(value: unknown): value is V3PanelMessage {
  return (
    isV3PanelGetSnapshotRequest(value) ||
    isV3PanelSaveConfigRequest(value) ||
    isV3PanelClearHitCountersRequest(value)
  )
}
