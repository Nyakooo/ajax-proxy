import { RE2JS } from 're2js'
import type { V3Rule } from './rules'

const MAX_MATCH_INPUT_LENGTH = 65536
const MAX_REGEX_LENGTH = 4096
const MAX_CACHED_REGEXES = 256

const regexCache = new Map<string, RE2JS>()

function getRegex(pattern: string): RE2JS | undefined {
  if (pattern.length === 0 || pattern.length > MAX_REGEX_LENGTH) return undefined
  const cached = regexCache.get(pattern)
  if (cached) {
    regexCache.delete(pattern)
    regexCache.set(pattern, cached)
    return cached
  }
  try {
    const regex = RE2JS.compile(pattern, RE2JS.CASE_INSENSITIVE)
    regexCache.set(pattern, regex)
    if (regexCache.size > MAX_CACHED_REGEXES) {
      const oldest = regexCache.keys().next().value
      if (oldest !== undefined) regexCache.delete(oldest)
    }
    return regex
  } catch {
    return undefined
  }
}

export interface V3RequestMatchInput {
  url: string
  method: string
}

export interface V3RuleSelection {
  rule: V3Rule
  index: number
  originalRequest: V3RequestMatchInput
}

export type V3RuleMatchReason =
  | 'matched'
  | 'matched-request-excluded'
  | 'lower-priority'
  | 'global-disabled'
  | 'rule-disabled'
  | 'actions-disabled'
  | 'request-excluded'
  | 'method-mismatch'
  | 'url-mismatch'
  | 'invalid-regex'
  | 'invalid-match-type'
  | 'matcher-error'
  | 'request-too-long'

export interface V3RuleMatchAnalysis {
  selectedRuleId?: string
  results: Array<{ ruleId: string; index: number; reason: V3RuleMatchReason }>
}

function getRuleMatchReason(rule: V3Rule, request: V3RequestMatchInput): V3RuleMatchReason {
  try {
    if (!rule.enabled) return 'rule-disabled'
    if (!rule.request?.enabled && !rule.response?.enabled) return 'actions-disabled'
    if (rule.match.method && rule.match.method.toUpperCase() !== 'ANY') {
      if (rule.match.method.toUpperCase() !== request.method.toUpperCase()) return 'method-mismatch'
    }
    const matcherType = rule.match.type ?? 'normal'
    let matchesUrl: boolean
    if (matcherType === 'regex') {
      const regex = getRegex(rule.match.url)
      if (!regex) return 'invalid-regex'
      matchesUrl = regex.test(request.url)
    } else if (matcherType === 'exact') {
      matchesUrl = request.url === rule.match.url
    } else {
      if (matcherType !== 'normal') return 'invalid-match-type'
      matchesUrl = request.url.includes(rule.match.url)
    }
    if (!matchesUrl) return 'url-mismatch'
    if (isV3RedirectExcluded(rule, request.url)) {
      return rule.response?.enabled ? 'matched-request-excluded' : 'request-excluded'
    }
    return 'matched'
  } catch {
    return 'matcher-error'
  }
}

/** Whether a request matches one of the literal URL substrings excluded by its redirect action. */
export function isV3RedirectExcluded(rule: V3Rule, url: string): boolean {
  if (!rule.request?.enabled) return false
  const exclusions = rule.request.redirect.exclusions
  if (!Array.isArray(exclusions)) return false
  return exclusions.some(
    (exclusion) => typeof exclusion === 'string' && exclusion.length > 0 && url.includes(exclusion)
  )
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
    else reason = getRuleMatchReason(rule, normalizedRequest)
    if (reason === 'matched' || reason === 'matched-request-excluded') selectedRuleId = rule.id
    results.push({ ruleId: rule.id, index, reason })
  }
  return { selectedRuleId, results }
}

/**
 * Select the first enabled V3 rule whose enabled actions and request matcher
 * match the original request. The returned selection can be retained for the
 * response stage so redirects never cause a second rule lookup.
 */
export function selectV3Rule(
  rules: readonly V3Rule[],
  request: V3RequestMatchInput
): V3RuleSelection | undefined {
  if (request.url.length > MAX_MATCH_INPUT_LENGTH) return undefined
  const method = request.method.toUpperCase()

  for (let index = 0; index < rules.length; index += 1) {
    const rule = rules[index]
    const reason = getRuleMatchReason(rule, { url: request.url, method })
    if (reason === 'matched' || reason === 'matched-request-excluded') {
      return {
        rule,
        index,
        originalRequest: { url: request.url, method },
      }
    }
  }
  return undefined
}
