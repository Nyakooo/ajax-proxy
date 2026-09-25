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
    try {
      const rule = rules[index]
      if (!rule.enabled || (!rule.request?.enabled && !rule.response?.enabled)) continue
      if (rule.match.method && rule.match.method.toUpperCase() !== 'ANY') {
        if (rule.match.method.toUpperCase() !== method) continue
      }
      const matcherType = rule.match.type ?? 'normal'
      const matchesUrl =
        matcherType === 'regex'
          ? (getRegex(rule.match.url)?.test(request.url) ?? false)
          : matcherType === 'normal' && request.url.includes(rule.match.url)
      if (!matchesUrl) continue
      return {
        rule,
        index,
        originalRequest: { url: request.url, method },
      }
    } catch {
      // Runtime state may be stale or corrupted. Skip this rule and continue.
    }
  }
  return undefined
}
