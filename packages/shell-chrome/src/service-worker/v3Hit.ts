import {
  NoticeKey,
  StorageKey,
  setStorage,
  getRealStorage,
  noticePanelsByServiceWorker,
} from '@proxy/shared-utils'
import { getV3HitTotal, recordV3Hit, validateV3Backup } from '@proxy/v3-domain'
import type { V3Backup } from '@proxy/v3-domain'
import type { V3Hit } from '@proxy/protocol'

let v3HitQueue = Promise.resolve()

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
  const total = getV3HitTotal(counters, backup)
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
      const result = recordV3Hit(state.backup, state.counters, hit)
      if (!result) return
      await setStorage(StorageKey.V3_HITS, result.counters)
      renderV3Badge(result.counters, state.backup)
      noticePanelsByServiceWorker(NoticeKey.V3_HIT, {
        rule_id: hit.rule_id,
        count: result.count,
        match_url: hit.match_url,
        method: hit.method,
        url: hit.url ?? hit.match_url,
      })
    })
    .catch((error) => {
      console.error('[AjaxProxy] Could not update V3 hit counter', error)
    })
  return v3HitQueue
}
