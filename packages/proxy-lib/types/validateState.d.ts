import { isRecord, isValidMode } from '@proxy/protocol';
import { IGlobalState, IMatchInterceptorContent, IMatchRedirectContent } from './types';
export { isRecord, isValidMode };
export declare function isValidInterceptors(value: unknown): value is IMatchInterceptorContent[];
export declare function isValidRedirectors(value: unknown): value is IMatchRedirectContent[];
export declare function isValidGlobalState(value: unknown): value is IGlobalState;
