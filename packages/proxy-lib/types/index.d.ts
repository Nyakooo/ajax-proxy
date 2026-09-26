import { IFilterType, IGlobalState, IMatchInterceptorContent, IMatchRedirectContent, IMode, IRedirectHeader, IRequestMethod, OverrideType, RedirectType, RefGlobalState } from './types';
/**全局开关 */
declare function update<T extends boolean>(global_switch_on: T): void;
/**修改模式 */
declare function update<T extends IMode>(mode: T): void;
/**修改拦截器 */
declare function update<T extends IMatchInterceptorContent[]>(interceptors: T): void;
/**修改重定向 */
declare function update<T extends IMatchRedirectContent[]>(redirectors: T): void;
/**修改全部属性 */
declare function update<T extends IGlobalState>(state: T): void;
declare function updateInterceptors(target: unknown): void;
declare function updateRedirectors(target: unknown): void;
declare function updateV3(target: unknown): {
    ok: true;
    status: "updated" | "cleared";
} | {
    ok: false;
    issues: import("@proxy/v3-domain").V3ValidationIssue[];
};
declare function updateV3DiagnosticsArmed(armed: boolean): void;
declare const _default: {
    update: typeof update;
    updateInterceptors: typeof updateInterceptors;
    updateRedirectors: typeof updateRedirectors;
    updateV3: typeof updateV3;
    updateV3DiagnosticsArmed: typeof updateV3DiagnosticsArmed;
};
export default _default;
export { isRecord, isValidGlobalState, isValidInterceptors, isValidMode, isValidRedirectors, } from './validateState';
export type { IFilterType, IGlobalState, IRequestMethod, IMode, IMatchInterceptorContent, IMatchRedirectContent, IRedirectHeader, OverrideType, RedirectType, RefGlobalState, };
export type { V3RuntimeHostOptions } from './v3/runtimeOptions';
export type { V3Fetch, V3FetchOptions } from './v3/fetch';
export type { V3XHRConstructor, V3XHROptions } from './v3/xhr';
