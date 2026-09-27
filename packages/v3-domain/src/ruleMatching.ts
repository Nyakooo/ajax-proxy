import { MAX_MATCH_INPUT_LENGTH, getV3RuleMatchReason } from './ruleMatcher'
import type { V3RequestMatchInput } from './ruleMatcher'
import type { V3Rule } from './rules'

export type { V3RequestMatchInput } from './ruleMatcher'

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
    const rule = rules[index]
    const reason = getV3RuleMatchReason(rule, { url: request.url, method })
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
