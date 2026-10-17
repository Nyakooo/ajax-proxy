import { IGlobalState, IMatchInterceptorContent, IMatchRedirectContent, IMode, IRequestMethod } from "./types";
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
declare const _default: {
    update: typeof update;
};
export default _default;
export type { IRequestMethod, IMatchInterceptorContent, IMatchRedirectContent, };
