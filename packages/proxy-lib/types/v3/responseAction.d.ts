import type { V3FunctionErrorCode } from '@proxy/protocol';
import type { V3FetchOutcomeReason, V3FetchOutcomeStatus } from '@proxy/protocol';
import type { V3Rule } from '@proxy/v3-domain';
import type { V3ResponseFunctionExecutor } from './responseFunctionSandbox';
export declare function replaceFetchResponse(response: Response, request: Request, rule: V3Rule, executeResponseFunction?: V3ResponseFunctionExecutor, requestSnapshot?: Request, onFunctionError?: (code: V3FunctionErrorCode) => void, onOutcome?: (outcome: V3FetchOutcomeStatus, reason: V3FetchOutcomeReason) => void): Promise<Response>;
