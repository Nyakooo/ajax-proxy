import type { V3Rule } from './rules';
export interface V3RequestMatchInput {
    url: string;
    method: string;
}
export interface V3RuleSelection {
    rule: V3Rule;
    index: number;
    originalRequest: V3RequestMatchInput;
}
export type V3RuleMatchReason = 'matched' | 'matched-request-excluded' | 'lower-priority' | 'global-disabled' | 'rule-disabled' | 'actions-disabled' | 'request-excluded' | 'method-mismatch' | 'url-mismatch' | 'invalid-regex' | 'invalid-match-type' | 'matcher-error' | 'request-too-long';
export interface V3RuleMatchAnalysis {
    selectedRuleId?: string;
    results: Array<{
        ruleId: string;
        index: number;
        reason: V3RuleMatchReason;
    }>;
}
/** Whether a request matches one of the literal URL substrings excluded by its redirect action. */
export declare function isV3RedirectExcluded(rule: V3Rule, url: string): boolean;
/** Explain how the current ordered rules classify a manually supplied request. */
export declare function analyzeV3RuleMatches(rules: readonly V3Rule[], request: V3RequestMatchInput, globalEnabled?: boolean): V3RuleMatchAnalysis;
/**
 * Select the first enabled V3 rule whose enabled actions and request matcher
 * match the original request. The returned selection can be retained for the
 * response stage so redirects never cause a second rule lookup.
 */
export declare function selectV3Rule(rules: readonly V3Rule[], request: V3RequestMatchInput): V3RuleSelection | undefined;
