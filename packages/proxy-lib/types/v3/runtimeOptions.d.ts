import type { V3Rule } from '@proxy/v3-domain';
import type { V3FunctionErrorCode } from '@proxy/protocol';
import type { V3ResponseFunctionExecutor } from './responseFunctionSandbox';
export interface V3RuntimeHostOptions {
    getRules: () => readonly V3Rule[];
    onMatched?: (rule: V3Rule, index: number, request: {
        url: string;
        method: string;
    }) => void;
    onFunctionError?: (rule: V3Rule, request: {
        url: string;
        method: string;
    }, code: V3FunctionErrorCode) => void;
    executeResponseFunction?: V3ResponseFunctionExecutor;
}
