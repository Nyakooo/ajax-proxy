import {
  NoticeKey,
  StorageKey,
  getRealStorage,
  noticePanelsByServiceWorker,
  removeStorage,
} from '@proxy/shared-utils'
import { isV3NoMatch } from '@proxy/protocol'
import { validateV3Backup } from '@proxy/v3-domain'

let pendingNoMatch: Promise<unknown> = Promise.resolve()

/** Consume a one-shot opt-in and forward an ephemeral no-match hint. */
export function notifyV3NoMatch(value: unknown) {
  const operation = pendingNoMatch.then(async () => {
    if (!isV3NoMatch(value)) return false

    const rawBackup = await getRealStorage(StorageKey.V3_CONFIG, null)
    const validated = validateV3Backup(rawBackup)
    if (!validated.ok) return false
    const backup = validated.data
    const expectedIds = backup.rules.slice(0, 100).map((rule) => rule.id)
    if (
      value.truncated !== backup.rules.length > 100 ||
      value.rules.length !== expectedIds.length ||
      value.rules.some((entry, index) => entry.rule_id !== expectedIds[index]) ||
      (backup.settings.globalEnabled &&
        value.rules.some((entry) => entry.reason === 'global-disabled')) ||
      (!backup.settings.globalEnabled &&
        value.rules.some((entry) => entry.reason !== 'global-disabled'))
    ) {
      return false
    }

    const armed = await getRealStorage(StorageKey.V3_DIAGNOSTICS_ARMED, false)
    if (armed !== true) return false
    await removeStorage(StorageKey.V3_DIAGNOSTICS_ARMED)
    noticePanelsByServiceWorker(NoticeKey.V3_NO_MATCH, value)
    return true
  })

  pendingNoMatch = operation.then(
    () => undefined,
    () => undefined
  )
  return operation
}
