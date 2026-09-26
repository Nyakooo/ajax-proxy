import { analyzeV3RuleMatches, isV3OriginDisabled, validateV3Backup } from '@proxy/v3-domain'
import type { V3Backup, V3Rule, V3ValidationIssue } from '@proxy/v3-domain'
import { NoticeTo } from '@proxy/protocol'
import type { V3Hit } from '@proxy/protocol'
import type { V3FunctionError, V3FunctionErrorCode } from '@proxy/protocol'
import type { V3NoMatch, V3NoMatchReason } from '@proxy/protocol'
import type {
  V3FetchOutcome,
  V3FetchOutcomeReason,
  V3FetchOutcomeStage,
  V3FetchOutcomeStatus,
} from '@proxy/protocol'
import type { V3XHROutcome, V3XHROutcomeReason } from '@proxy/protocol'
import { createV3Fetch } from './fetch'
import {
  createV3RequestRedirectFunctionExecutor,
  createV3ResponseFunctionExecutor,
} from './responseFunctionSandbox'
import { createV3XHR } from './xhr'

export interface V3RuntimeController {
  readonly fetch: typeof window.fetch
  readonly xhr: typeof window.XMLHttpRequest
  readonly backup: V3Backup | null
  readonly diagnosticsArmed: boolean
  setDiagnosticsArmed(armed: boolean): void
  readonly fetchOutcomeDiagnosticsArmed: boolean
  setFetchOutcomeDiagnosticsArmed(armed: boolean): void
  update(target: unknown): V3RuntimeUpdateResult
}

function notifyV3NoMatch(host: Window, backup: V3Backup, request: { url: string; method: string }) {
  try {
    const analysis = analyzeV3RuleMatches(backup.rules, request, backup.settings.globalEnabled)
    if (analysis.selectedRuleId) return
    const allRules = analysis.results.filter(
      (result) => result.reason !== 'matched' && result.reason !== 'lower-priority'
    )
    const detail: V3NoMatch = {
      kind: 'v3-no-match',
      method: request.method.toUpperCase(),
      rules: allRules.slice(0, 100).map(({ ruleId, reason }) => ({
        rule_id: ruleId,
        reason: reason as V3NoMatchReason,
      })),
      truncated: allRules.length > 100,
    }
    host.dispatchEvent(new CustomEvent(NoticeTo.CONTENT, { detail }))
  } catch {
    // Diagnostics must not affect the request path.
  }
}

export type V3RuntimeUpdateResult =
  { ok: true; status: 'updated' | 'cleared' } | { ok: false; issues: V3ValidationIssue[] }

type HostOriginRead = { ok: true; origin: string } | { ok: false }

function getHostOrigin(host: Window): HostOriginRead {
  try {
    return { ok: true, origin: host.location?.origin ?? '' }
  } catch {
    return { ok: false }
  }
}

function notifyV3Match(host: Window, rule: V3Rule, request: { url: string; method: string }) {
  try {
    const detail: V3Hit = {
      kind: 'v3-hit',
      rule_id: rule.id,
      match_url: rule.match.url,
      method: request.method,
      url: request.url,
    }
    host.dispatchEvent(new CustomEvent(NoticeTo.CONTENT, { detail }))
  } catch {
    // Diagnostics must not affect the request path.
  }
}

function notifyV3FunctionError(
  host: Window,
  rule: V3Rule,
  request: { url: string; method: string },
  code: V3FunctionErrorCode,
  action: 'redirect' | 'response'
) {
  try {
    const detail: V3FunctionError = {
      rule_id: rule.id,
      match_url: rule.match.url,
      method: request.method,
      action,
      code,
    }
    host.dispatchEvent(new CustomEvent(NoticeTo.CONTENT, { detail }))
  } catch {
    // Function diagnostics must not affect native-response fallback.
  }
}

function notifyV3FetchOutcome(
  host: Window,
  rule: V3Rule,
  correlationId: string,
  stage: V3FetchOutcomeStage,
  outcome: V3FetchOutcomeStatus,
  reason: V3FetchOutcomeReason
) {
  try {
    const detail: V3FetchOutcome = {
      kind: 'v3-fetch-outcome',
      correlation_id: correlationId,
      rule_id: rule.id,
      stage,
      outcome,
      reason,
    }
    host.dispatchEvent(new CustomEvent(NoticeTo.CONTENT, { detail }))
  } catch {
    // Outcome diagnostics must not affect Fetch behavior.
  }
}

function notifyV3XHROutcome(
  host: Window,
  rule: V3Rule,
  correlationId: string,
  stage: V3FetchOutcomeStage,
  outcome: V3FetchOutcomeStatus,
  reason: V3XHROutcomeReason
) {
  try {
    const detail: V3XHROutcome = {
      kind: 'v3-xhr-outcome',
      correlation_id: correlationId,
      rule_id: rule.id,
      stage,
      outcome,
      reason,
    }
    host.dispatchEvent(new CustomEvent(NoticeTo.CONTENT, { detail }))
  } catch {
    // Outcome diagnostics must not affect XHR behavior.
  }
}

export function createV3RuntimeController(
  host: Window,
  pageFetchAtLoad: typeof window.fetch,
  pageXHRAtLoad: typeof window.XMLHttpRequest
): V3RuntimeController {
  let backup: V3Backup | null = null
  let diagnosticsArmed = false
  let fetchOutcomeDiagnosticsArmed = false
  const options = {
    getRules: () => {
      if (!backup?.settings.globalEnabled) return []
      const origin = getHostOrigin(host)
      if (!origin.ok || isV3OriginDisabled(origin.origin, backup.disabledOrigins)) return []
      return backup.rules
    },
    onMatched: (rule: V3Rule, _index: number, request: { url: string; method: string }) =>
      notifyV3Match(host, rule, request),
    onNoMatch: (request: { url: string; method: string }) => {
      if (!diagnosticsArmed || !backup || !backup.settings.globalEnabled) return
      const origin = getHostOrigin(host)
      if (!origin.ok || isV3OriginDisabled(origin.origin, backup.disabledOrigins)) return
      notifyV3NoMatch(host, backup, request)
    },
    isFetchOutcomeDiagnosticsArmed: () => fetchOutcomeDiagnosticsArmed,
    onFetchOutcome: (
      rule: V3Rule,
      correlationId: string,
      stage: V3FetchOutcomeStage,
      outcome: V3FetchOutcomeStatus,
      reason: V3FetchOutcomeReason
    ) => {
      if (fetchOutcomeDiagnosticsArmed) {
        notifyV3FetchOutcome(host, rule, correlationId, stage, outcome, reason)
      }
    },
    onXHROutcome: (
      rule: V3Rule,
      correlationId: string,
      stage: V3FetchOutcomeStage,
      outcome: V3FetchOutcomeStatus,
      reason: V3XHROutcomeReason
    ) => {
      if (fetchOutcomeDiagnosticsArmed) {
        notifyV3XHROutcome(host, rule, correlationId, stage, outcome, reason)
      }
    },
    onFunctionError: (
      rule: V3Rule,
      request: { url: string; method: string },
      code: V3FunctionErrorCode,
      action: 'redirect' | 'response'
    ) => notifyV3FunctionError(host, rule, request, code, action),
    executeRedirectFunction: createV3RequestRedirectFunctionExecutor(host),
    executeResponseFunction: createV3ResponseFunctionExecutor(host),
  }
  const fetch = createV3Fetch(pageFetchAtLoad, options)
  const xhr = createV3XHR(pageXHRAtLoad, options) as unknown as typeof window.XMLHttpRequest

  return {
    fetch,
    xhr,
    get backup() {
      return backup
    },
    get diagnosticsArmed() {
      return diagnosticsArmed
    },
    setDiagnosticsArmed(armed) {
      diagnosticsArmed = armed
    },
    get fetchOutcomeDiagnosticsArmed() {
      return fetchOutcomeDiagnosticsArmed
    },
    setFetchOutcomeDiagnosticsArmed(armed) {
      fetchOutcomeDiagnosticsArmed = armed
    },
    update(target) {
      if (target === null) {
        backup = null
        return { ok: true, status: 'cleared' }
      }
      const result = validateV3Backup(target)
      if (!result.ok) return result
      backup = result.data
      return { ok: true, status: 'updated' }
    },
  }
}
