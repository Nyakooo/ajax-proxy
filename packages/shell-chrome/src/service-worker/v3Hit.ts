import {
  NoticeKey,
  StorageKey,
  setStorage,
  getRealStorage,
  noticePanelsByServiceWorker,
} from '@proxy/shared-utils'
import { validateV3Backup } from '@proxy/v3-domain'
import type { V3Backup } from '@proxy/v3-domain'
import type { V3Hit } from '@proxy/protocol'

type V3HitCounters = Record<string, number>

let v3HitQueue = Promise.resolve()

function isCounterRecord(value: unknown): value is V3HitCounters {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  try {
    return (
      Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null
    )
  } catch {
    return false
  }
}

function sanitizeCounters(value: unknown, backup: V3Backup): V3HitCounters {
  if (!isCounterRecord(value)) return {}
  const knownIds = new Set(backup.rules.map((rule) => rule.id))
  return Object.fromEntries(
    Object.entries(value).filter(
      ([id, count]) => knownIds.has(id) && Number.isSafeInteger(count) && count >= 0
    )
  )
}

function getValidV3Backup(value: unknown): V3Backup | undefined {
  const result = validateV3Backup(value)
  return result.ok ? result.data : undefined
}

async function readV3State() {
  const rawBackup = await getRealStorage(StorageKey.V3_CONFIG, null)
  if (rawBackup === null) return { status: 'absent' as const }
  const backup = getValidV3Backup(rawBackup)
  if (!backup) return { status: 'invalid' as const }
  if (!backup.settings.globalEnabled) return { status: 'disabled' as const }
  const counters = await getRealStorage(StorageKey.V3_HITS, {})
  return { status: 'active' as const, backup, counters }
}

function renderV3Badge(counters: unknown, backup: V3Backup) {
  const knownIds = new Set(backup.rules.map((rule) => rule.id))
  let total = 0
  if (isCounterRecord(counters)) {
    for (const [id, count] of Object.entries(counters)) {
      if (knownIds.has(id) && Number.isSafeInteger(count) && count >= 0) total += count
    }
  }
  chrome.action.setBadgeBackgroundColor({ color: '#006d75' })
  chrome.action.setBadgeText({ text: total ? `+${total}` : '' })
}

export async function renderActiveV3Badge() {
  const state = await readV3State()
  if (state.status === 'active') renderV3Badge(state.counters, state.backup)
  else if (state.status !== 'absent') chrome.action.setBadgeText({ text: '' })
  return state.status !== 'absent'
}

/** Increment and render an isolated V3 counter after validating it against active config. */
export function chromeBadgeV3(hit: V3Hit) {
  v3HitQueue = v3HitQueue
    .then(async () => {
      const state = await readV3State()
      if (state.status !== 'active') return
      const rule = state.backup.rules.find((candidate) => candidate.id === hit.rule_id)
      if (
        !rule ||
        !rule.enabled ||
        (!rule.request?.enabled && !rule.response?.enabled) ||
        rule.match.url !== hit.match_url
      )
        return
      if (
        rule.match.method &&
        rule.match.method.toUpperCase() !== 'ANY' &&
        rule.match.method.toUpperCase() !== hit.method
      )
        return

      const counters = sanitizeCounters(state.counters, state.backup)
      const count = counters[hit.rule_id] ?? 0
      if (count < Number.MAX_SAFE_INTEGER) counters[hit.rule_id] = count + 1
      await setStorage(StorageKey.V3_HITS, counters)
      renderV3Badge(counters, state.backup)
      noticePanelsByServiceWorker(NoticeKey.V3_HIT, {
        rule_id: hit.rule_id,
        count: counters[hit.rule_id],
      })
    })
    .catch((error) => {
      console.error('[AjaxProxy] Could not update V3 hit counter', error)
    })
  return v3HitQueue
}
