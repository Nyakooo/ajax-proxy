import {
  NoticeKey,
  StorageKey,
  getRealStorage,
  noticePanelsByServiceWorker,
} from '@proxy/shared-utils'
import { isV3FetchOutcome, V3FetchOutcomeReason } from '@proxy/protocol'
import type { V3FetchOutcome } from '@proxy/protocol'
import { validateV3Backup } from '@proxy/v3-domain'
import type { V3Rule } from '@proxy/v3-domain'

function matchesAction(rule: V3Rule, value: V3FetchOutcome) {
  if (value.stage === 'request') {
    if (value.reason === V3FetchOutcomeReason.NETWORK_FAILED) {
      return Boolean(rule.request?.enabled || rule.response?.enabled)
    }
    return (
      Boolean(rule.request?.enabled) &&
      (value.reason === V3FetchOutcomeReason.REDIRECT_APPLIED ||
        value.reason === V3FetchOutcomeReason.REDIRECT_CONSTRUCTION_FAILED)
    )
  }
  return (
    Boolean(rule.response?.enabled) &&
    (value.reason === V3FetchOutcomeReason.RESPONSE_REPLACEMENT_APPLIED ||
      value.reason === V3FetchOutcomeReason.RESPONSE_REPLACEMENT_FAILED ||
      value.reason === V3FetchOutcomeReason.RESPONSE_REPLACEMENT_UNSUPPORTED)
  )
}

function matchesOutcome(value: V3FetchOutcome) {
  if (value.reason === V3FetchOutcomeReason.REDIRECT_APPLIED) {
    return value.stage === 'request' && value.outcome === 'applied'
  }
  if (value.reason === V3FetchOutcomeReason.REDIRECT_CONSTRUCTION_FAILED) {
    return value.stage === 'request' && value.outcome === 'fallback'
  }
  if (value.reason === V3FetchOutcomeReason.NETWORK_FAILED) {
    return value.stage === 'request' && value.outcome === 'failed'
  }
  if (value.reason === V3FetchOutcomeReason.RESPONSE_REPLACEMENT_APPLIED) {
    return value.stage === 'response' && value.outcome === 'applied'
  }
  if (value.reason === V3FetchOutcomeReason.RESPONSE_REPLACEMENT_FAILED) {
    return value.stage === 'response' && value.outcome === 'fallback'
  }
  return (
    value.reason === V3FetchOutcomeReason.RESPONSE_REPLACEMENT_UNSUPPORTED &&
    value.stage === 'response' &&
    value.outcome === 'unsupported'
  )
}

/** Forward an ephemeral Fetch outcome only while diagnostics are explicitly armed. */
export async function notifyV3FetchOutcome(value: unknown) {
  if (!isV3FetchOutcome(value) || !matchesOutcome(value)) return false
  const rawBackup = await getRealStorage(StorageKey.V3_CONFIG, null)
  const validated = validateV3Backup(rawBackup)
  if (!validated.ok || !validated.data.settings.globalEnabled) return false
  const rule = validated.data.rules.find((candidate) => candidate.id === value.rule_id)
  if (!rule || !rule.enabled || !matchesAction(rule, value)) return false

  const armed = await getRealStorage(StorageKey.V3_FETCH_OUTCOMES_ARMED, false)
  if (armed !== true) return false
  noticePanelsByServiceWorker(NoticeKey.V3_FETCH_OUTCOME, value)
  return true
}
