import { V3FetchOutcomeStage, V3FetchOutcomeStatus } from './v3FetchOutcome';
/** Fixed, non-sensitive outcome categories for transient asynchronous XHR diagnostics. */
export declare const V3XHROutcomeReason: {
    readonly REDIRECT_APPLIED: "redirect-applied";
    readonly REDIRECT_OPEN_FAILED: "redirect-open-failed";
    readonly REDIRECT_TARGET_UNSUPPORTED: "redirect-target-unsupported";
    readonly SEND_FAILED: "send-failed";
    readonly RESPONSE_REPLACEMENT_APPLIED: "response-replacement-applied";
    readonly RESPONSE_REPLACEMENT_FAILED: "response-replacement-failed";
    readonly RESPONSE_REPLACEMENT_UNSUPPORTED: "response-replacement-unsupported";
};
export type V3XHROutcomeReason = (typeof V3XHROutcomeReason)[keyof typeof V3XHROutcomeReason];
/** Opt-in, transient async XHR outcome; request and response contents are excluded. */
export type V3XHROutcome = {
    kind: 'v3-xhr-outcome';
    correlation_id: string;
    rule_id: string;
    stage: (typeof V3FetchOutcomeStage)[keyof typeof V3FetchOutcomeStage];
    outcome: (typeof V3FetchOutcomeStatus)[keyof typeof V3FetchOutcomeStatus];
    reason: V3XHROutcomeReason;
};
/** Validate an untrusted, user-opted-in async XHR outcome notice. */
export declare function isV3XHROutcome(value: unknown): value is V3XHROutcome;
