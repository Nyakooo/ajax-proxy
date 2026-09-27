import type { V3Rule } from './rules';
export declare const MAX_MATCH_INPUT_LENGTH = 65536;
export interface V3RequestMatchInput {
    url: string;
    method: string;
}
export type V3RuleMatchReason = 'matched' | 'matched-request-excluded' | 'lower-priority' | 'global-disabled' | 'rule-disabled' | 'actions-disabled' | 'request-excluded' | 'method-mismatch' | 'url-mismatch' | 'invalid-regex' | 'invalid-match-type' | 'matcher-error' | 'request-too-long';
export declare function getV3RuleMatchReason(rule: V3Rule, request: V3RequestMatchInput): V3RuleMatchReason;
/** Whether a request matches one of the literal URL substrings excluded by its redirect action. */
export declare function isV3RedirectExcluded(rule: V3Rule, url: string): boolean;
