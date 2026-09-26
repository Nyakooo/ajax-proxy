/** Actual V3 selector outcomes that explain why an individual rule did not match. */
export declare const V3NoMatchReason: {
    readonly GLOBAL_DISABLED: "global-disabled";
    readonly RULE_DISABLED: "rule-disabled";
    readonly ACTIONS_DISABLED: "actions-disabled";
    readonly METHOD_MISMATCH: "method-mismatch";
    readonly URL_MISMATCH: "url-mismatch";
    readonly INVALID_REGEX: "invalid-regex";
    readonly INVALID_MATCH_TYPE: "invalid-match-type";
    readonly MATCHER_ERROR: "matcher-error";
    readonly REQUEST_TOO_LONG: "request-too-long";
};
export type V3NoMatchReason = (typeof V3NoMatchReason)[keyof typeof V3NoMatchReason];
/** Opt-in, transient no-match diagnostic. It deliberately carries no request URL or data. */
export type V3NoMatch = {
    kind: 'v3-no-match';
    method: string;
    rules: Array<{
        rule_id: string;
        reason: V3NoMatchReason;
    }>;
    truncated: boolean;
};
/** Validate an untrusted, user-opted-in no-match diagnostic payload. */
export declare function isV3NoMatch(value: unknown): value is V3NoMatch;
