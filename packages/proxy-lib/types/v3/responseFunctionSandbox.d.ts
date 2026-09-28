export type V3FunctionExecutionFailureCode = 'sandbox-unavailable' | 'timeout' | 'execution-failed';
/** Internal typed failure; UI diagnostics must not depend on sandbox error wording. */
export declare class V3FunctionExecutionError extends Error {
    readonly code: V3FunctionExecutionFailureCode;
    constructor(code: V3FunctionExecutionFailureCode, message: string);
}
export declare function getV3FunctionExecutionFailureCode(error: unknown): V3FunctionExecutionFailureCode;
export interface V3FunctionRequestSnapshot {
    url: string;
    method: string;
    body?: string;
}
export interface V3FunctionResponseSnapshot {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
}
export type V3ResponseFunctionExecutor = (code: string, request: V3FunctionRequestSnapshot, response: V3FunctionResponseSnapshot) => Promise<unknown>;
export type V3RequestRedirectFunctionExecutor = (code: string, request: Pick<V3FunctionRequestSnapshot, 'url' | 'method'>) => Promise<unknown>;
export declare function createV3ResponseFunctionExecutor(host: Window): V3ResponseFunctionExecutor;
export declare function createV3RequestRedirectFunctionExecutor(host: Window): V3RequestRedirectFunctionExecutor;
