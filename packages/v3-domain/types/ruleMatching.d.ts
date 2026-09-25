import type { V3Rule } from './backup';
export interface V3RequestMatchInput {
    url: string;
    method: string;
}
export interface V3RuleSelection {
    rule: V3Rule;
    index: number;
    originalRequest: V3RequestMatchInput;
}
/**
 * Select the first enabled V3 rule whose enabled actions and request matcher
 * match the original request. The returned selection can be retained for the
 * response stage so redirects never cause a second rule lookup.
 */
export declare function selectV3Rule(rules: readonly V3Rule[], request: V3RequestMatchInput): V3RuleSelection | undefined;
