import type { V3Rule } from '@proxy/v3-domain';
import type { V3ResponseFunctionExecutor } from './responseFunctionSandbox';
export declare function replaceFetchResponse(response: Response, request: Request, rule: V3Rule, executeResponseFunction?: V3ResponseFunctionExecutor, requestSnapshot?: Request): Promise<Response>;
