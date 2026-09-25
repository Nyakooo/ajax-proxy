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
export declare function createV3ResponseFunctionExecutor(host: Window): V3ResponseFunctionExecutor;
