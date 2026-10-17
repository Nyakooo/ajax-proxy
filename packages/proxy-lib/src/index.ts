import { IGlobalState, IMatchInterceptorContent, IMatchRedirectContent, IMode, IRequestMethod, RefGlobalState } from "./types";
import CreateXHR, { initInterceptorXHRState, OriginXHR } from "./createXHR";
import CreateFetch, { initInterceptorFetchState, OriginFetch } from "./createFetch";
import RedirectXHR, { initRedirectXHRState } from "./redirectXHR";
import RedirectFetch, { initRedirectFetchState } from "./redirectFetch";
import { warn } from "./common";

// 初始化共享状态
const globalState: RefGlobalState = {
    value: {
        // 全局状态开关
        global_on: false,
        // 模式
        mode: 'interceptor',
        // 拦截匹配内容
        interceptor_matching_content: [],
        // 重定向匹配
        redirector_matching_content: []
    }
}


function isIGlobalState(x: any): x is IGlobalState {
    return x &&
        x.hasOwnProperty("global_on") &&
        x.hasOwnProperty("mode")
}

function isMode(x: any): x is IMode {
    return typeof x === 'string' && ["interceptor", "redirector"].includes(x)
}

function isArray(x: any): x is any[] {
    return x && Array.isArray(x)
}

function isInterceptors(x: any): x is IMatchInterceptorContent[] {
    for (let i = 0; i < x.length; i++) {
        const target = x[i];
        const bool = target.hasOwnProperty("match_url") && target.hasOwnProperty("switch_on")
        if (!bool) {
            return false
        }
    }
    return true
}

function isRedirectors(x: any): x is IMatchRedirectContent[] {
    for (let i = 0; i < x.length; i++) {
        const target = x[i];
        const bool = target.hasOwnProperty("domain") &&
            target.hasOwnProperty("switch_on") &&
            target.hasOwnProperty("redirect_url")
        if (!bool) {
            return false
        }
    }
    return true
}

// 初始化状态
function initState() {
    // 初始化共享状态
    initInterceptorXHRState(globalState);
    initInterceptorFetchState(globalState);
    initRedirectXHRState(globalState);
    initRedirectFetchState(globalState);
}

// 实例挂载
function mountInstance() {
    const { global_on = true, mode } = globalState.value
    // 每次挂载时，需要预先重置一下引用
    window.XMLHttpRequest = OriginXHR
    window.fetch = OriginFetch
    if (global_on) {
        if (mode === 'interceptor') {
            // 挂载拦截器
            window.XMLHttpRequest = CreateXHR
            window.fetch = CreateFetch
        } else if (mode === "redirector") {
            // 挂载重定向
            window.XMLHttpRequest = RedirectXHR
            window.fetch = RedirectFetch
        }
    }
}

/**全局开关 */
function update<T extends boolean>(global_switch_on: T): void
/**修改模式 */
function update<T extends IMode>(mode: T): void
/**修改拦截器 */
function update<T extends IMatchInterceptorContent[]>(interceptors: T): void
/**修改重定向 */
function update<T extends IMatchRedirectContent[]>(redirectors: T): void
/**修改全部属性 */
function update<T extends IGlobalState>(state: T): void
function update<unknow>(target: unknow) {
    // 全局开关
    if (typeof target === "boolean") {
        globalState.value.global_on = target
        // 更新一波实例
        mountInstance()
    }
    // 修改模式
    else if (isMode(target)) {
        globalState.value.mode = target
        // 需要更新一下实例
        mountInstance()
    }
    // 数组类型: 拦截列表、重定向列表
    else if (isArray(target)) {
        if (target.length > 0) {
            // 修改拦截器
            if (isInterceptors(target)) globalState.value.interceptor_matching_content = target
            // 修改重定向
            else if (isRedirectors(target)) globalState.value.redirector_matching_content = target
        } else {
            // 判断当前模式
            // 清空拦截列表
            if (globalState.value.mode === 'interceptor') globalState.value.interceptor_matching_content = []
            // 清空重定向列表
            else globalState.value.redirector_matching_content = []
        }
    }
    // 设置全部属性
    // 默认初始化时使用
    else if (isIGlobalState(target)) {
        // 替换全部
        globalState.value = target
        // 重新挂载实例
        mountInstance()
    } else warn("unknow type")
}

initState()

export default {
    update,
}

export type {
    IRequestMethod,
    IMatchInterceptorContent,
    IMatchRedirectContent,
}