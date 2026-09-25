/** Stable, non-sensitive failure categories for V3 response functions. */
export declare const V3FunctionErrorCode: {
    readonly SANDBOX_UNAVAILABLE: "sandbox-unavailable";
    readonly TIMEOUT: "timeout";
    readonly SNAPSHOT_UNSUPPORTED: "snapshot-unsupported";
    readonly SNAPSHOT_TOO_LARGE: "snapshot-too-large";
    readonly EXECUTION_FAILED: "execution-failed";
    readonly INVALID_RESULT: "invalid-result";
    readonly RESPONSE_CONSTRUCTION_FAILED: "response-construction-failed";
};
export type V3FunctionErrorCode = (typeof V3FunctionErrorCode)[keyof typeof V3FunctionErrorCode];
/** Safe diagnostic metadata; intentionally excludes raw URLs and request/response data. */
export type V3FunctionError = {
    rule_id: string;
    match_url: string;
    method: string;
    code: V3FunctionErrorCode;
};
/** Validate an untrusted V3 function failure notice. */
export declare function isV3FunctionError(value: unknown): value is V3FunctionError;
