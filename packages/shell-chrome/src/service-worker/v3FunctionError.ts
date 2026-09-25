import {
  NoticeKey,
  StorageKey,
  getRealStorage,
  noticePanelsByServiceWorker,
} from '@proxy/shared-utils'
import { isV3FunctionError } from '@proxy/protocol'
import { validateV3Backup } from '@proxy/v3-domain'

/** Broadcast an ephemeral function failure only for a currently active function rule. */
export async function notifyV3FunctionError(value: unknown) {
  if (!isV3FunctionError(value)) return false
  const rawBackup = await getRealStorage(StorageKey.V3_CONFIG, null)
  const validated = validateV3Backup(rawBackup)
  if (!validated.ok || !validated.data.settings.globalEnabled) return false
  const rule = validated.data.rules.find((candidate) => candidate.id === value.rule_id)
  if (
    !rule ||
    !rule.enabled ||
    rule.match.url !== value.match_url ||
    (rule.match.method !== undefined && rule.match.method !== value.method) ||
    !rule.response?.enabled ||
    typeof rule.response.replace.code !== 'string' ||
    rule.response.replace.code.trim() === ''
  ) {
    return false
  }
  noticePanelsByServiceWorker(NoticeKey.V3_FUNCTION_ERROR, value)
  return true
}
