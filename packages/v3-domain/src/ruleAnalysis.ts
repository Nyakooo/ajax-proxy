import { MAX_MATCH_INPUT_LENGTH, getV3RuleMatchReason } from './ruleMatcher'
import type { V3RequestMatchInput, V3RuleMatchReason } from './ruleMatcher'
import type { V3Rule } from './rules'

export interface V3RuleMatchAnalysis {
  selectedRuleId?: string
  results: Array<{ ruleId: string; index: number; reason: V3RuleMatchReason }>
}

/** Explain how the current ordered rules classify a manually supplied request. */
export function analyzeV3RuleMatches(
  rules: readonly V3Rule[],
  request: V3RequestMatchInput,
  globalEnabled = true
): V3RuleMatchAnalysis {
  const results: V3RuleMatchAnalysis['results'] = []
  if (request.url.length > MAX_MATCH_INPUT_LENGTH) {
    return {
      results: rules.map((rule, index) => ({ ruleId: rule.id, index, reason: 'request-too-long' })),
    }
  }
  const normalizedRequest = { ...request, method: request.method.toUpperCase() }
  let selectedRuleId: string | undefined
  for (let index = 0; index < rules.length; index += 1) {
    const rule = rules[index]
    let reason: V3RuleMatchReason
    if (!globalEnabled) reason = 'global-disabled'
    else if (selectedRuleId) reason = 'lower-priority'
    else reason = getV3RuleMatchReason(rule, normalizedRequest)
    if (reason === 'matched' || reason === 'matched-request-excluded') selectedRuleId = rule.id
    results.push({ ruleId: rule.id, index, reason })
  }
  return { selectedRuleId, results }
}
