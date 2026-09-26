/** Fixed, non-sensitive outcome categories for transient V3 Fetch diagnostics. */
export declare const V3FetchOutcomeReason: {
    readonly REDIRECT_APPLIED: "redirect-applied";
    readonly REDIRECT_CONSTRUCTION_FAILED: "redirect-construction-failed";
    readonly NETWORK_FAILED: "network-failed";
    readonly RESPONSE_REPLACEMENT_APPLIED: "response-replacement-applied";
    readonly RESPONSE_REPLACEMENT_FAILED: "response-replacement-failed";
    readonly RESPONSE_REPLACEMENT_UNSUPPORTED: "response-replacement-unsupported";
};
export type V3FetchOutcomeReason = (typeof V3FetchOutcomeReason)[keyof typeof V3FetchOutcomeReason];
export declare const V3FetchOutcomeStage: {
    readonly REQUEST: "request";
    readonly RESPONSE: "response";
};
export type V3FetchOutcomeStage = (typeof V3FetchOutcomeStage)[keyof typeof V3FetchOutcomeStage];
export declare const V3FetchOutcomeStatus: {
    readonly APPLIED: "applied";
    readonly FALLBACK: "fallback";
    readonly FAILED: "failed";
    readonly UNSUPPORTED: "unsupported";
};
export type V3FetchOutcomeStatus = (typeof V3FetchOutcomeStatus)[keyof typeof V3FetchOutcomeStatus];
/** Opt-in, transient Fetch outcome. It intentionally excludes request and response data. */
export type V3FetchOutcome = {
    kind: 'v3-fetch-outcome';
    correlation_id: string;
    rule_id: string;
    stage: V3FetchOutcomeStage;
    outcome: V3FetchOutcomeStatus;
    reason: V3FetchOutcomeReason;
};
/** Validate an untrusted, user-opted-in Fetch outcome notice. */
export declare function isV3FetchOutcome(value: unknown): value is V3FetchOutcome;
