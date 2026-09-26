import {
  NoticeKey,
  StorageKey,
  getRealStorage,
  noticePanelsByServiceWorker,
} from '@proxy/shared-utils'
import { isV3XHROutcome, V3XHROutcomeReason } from '@proxy/protocol'
import type { V3XHROutcome } from '@proxy/protocol'
import { validateV3Backup } from '@proxy/v3-domain'
import type { V3Rule } from '@proxy/v3-domain'

function matchesAction(rule: V3Rule, value: V3XHROutcome) {
  if (value.stage === 'request') {
    return (
      Boolean(rule.request?.enabled) &&
      (value.reason === V3XHROutcomeReason.REDIRECT_APPLIED ||
        value.reason === V3XHROutcomeReason.REDIRECT_OPEN_FAILED ||
        value.reason === V3XHROutcomeReason.REDIRECT_TARGET_UNSUPPORTED ||
        value.reason === V3XHROutcomeReason.SEND_FAILED)
    )
  }
  return (
    Boolean(rule.response?.enabled) &&
    (value.reason === V3XHROutcomeReason.RESPONSE_REPLACEMENT_APPLIED ||
      value.reason === V3XHROutcomeReason.RESPONSE_REPLACEMENT_FAILED ||
      value.reason === V3XHROutcomeReason.RESPONSE_REPLACEMENT_UNSUPPORTED)
  )
}

function matchesOutcome(value: V3XHROutcome) {
  if (value.reason === V3XHROutcomeReason.REDIRECT_APPLIED) {
    return value.stage === 'request' && value.outcome === 'applied'
  }
  if (
    value.reason === V3XHROutcomeReason.REDIRECT_OPEN_FAILED ||
    value.reason === V3XHROutcomeReason.REDIRECT_TARGET_UNSUPPORTED
  ) {
    return value.stage === 'request' && value.outcome === 'fallback'
  }
  if (value.reason === V3XHROutcomeReason.SEND_FAILED) {
    return value.stage === 'request' && value.outcome === 'failed'
  }
  if (value.reason === V3XHROutcomeReason.RESPONSE_REPLACEMENT_APPLIED) {
    return value.stage === 'response' && value.outcome === 'applied'
  }
  if (value.reason === V3XHROutcomeReason.RESPONSE_REPLACEMENT_FAILED) {
    return value.stage === 'response' && value.outcome === 'failed'
  }
  return (
    value.reason === V3XHROutcomeReason.RESPONSE_REPLACEMENT_UNSUPPORTED &&
    value.stage === 'response' &&
    value.outcome === 'unsupported'
  )
}

/** Forward an ephemeral async XHR outcome only while diagnostics are explicitly armed. */
export async function notifyV3XHROutcome(value: unknown) {
  if (!isV3XHROutcome(value) || !matchesOutcome(value)) return false
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
