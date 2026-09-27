import type { V3RequestMatchInput, V3RuleMatchReason } from './ruleMatcher';
import type { V3Rule } from './rules';
export interface V3RuleMatchAnalysis {
    selectedRuleId?: string;
    results: Array<{
        ruleId: string;
        index: number;
        reason: V3RuleMatchReason;
    }>;
}
/** Explain how the current ordered rules classify a manually supplied request. */
export declare function analyzeV3RuleMatches(rules: readonly V3Rule[], request: V3RequestMatchInput, globalEnabled?: boolean): V3RuleMatchAnalysis;
