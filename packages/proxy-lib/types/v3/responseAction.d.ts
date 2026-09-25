import type { V3Rule } from '@proxy/v3-domain';
export declare function replaceFetchResponse(response: Response, request: Request, rule: V3Rule): Promise<Response>;
