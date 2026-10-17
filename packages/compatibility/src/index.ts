import {
    MappingOldKeys,
    NewGLobalStateStruct,
    NewUploadStruct,
    OldGLobalStateStruct,
    OldInterceptorStruct,
    OldRedirectorStruct,
    OldUploadStruct
} from "./types";

// 判断是否为老GlobalState 数据
function isOldGlobalState(x: any): x is OldGLobalStateStruct {
    return x && x.hasOwnProperty("globalSwitchOn")
}

// 判断是否为老上传数据结构
function isOldUploadState(x: any): x is OldUploadStruct {
    return x &&
        (
            x.hasOwnProperty("proxy_routes") ||
            x.hasOwnProperty("redirect") ||
            x.hasOwnProperty("lang")
        )
}

// 判断是否为老 拦截列表
function isOldInterceptor(x: any): x is OldInterceptorStruct[] {
    if (!x) return false
    if (!Array.isArray(x)) return false
    for (let i = 0; i < x.length; i++) {
        const target = x[i];
        if (!target.hasOwnProperty("match")) return false
    }
    return true
}

// 判断是否为老 重定向列表
function isOldRedirector(x: any): x is OldRedirectorStruct[] {
    if (!x) return false
    if (!Array.isArray(x)) return false
    for (let i = 0; i < x.length; i++) {
        const target = x[i];
        if (!target.hasOwnProperty("redirect")) return false
    }
    return true
}

// 转义拦截列表
function interceptorConversion(target: any) {
    if (isOldInterceptor(target)) {
        const newInterceptor: NewGLobalStateStruct['interceptor_matching_content'] = target.map(interceptor => {
            const {
                id = "", switchOn = false, filterType = "normal", method = "ANY", remark = "",
                match = "", tagId = "", statusCode = "200", override = "", hit = 0
            } = interceptor
            return {
                id, switch_on: switchOn, filter_type: filterType, method, remark,
                match_url: match, tagId, status_code: statusCode, override, hit
            }
        })
        return newInterceptor
    }
    return target
}

// 转义重定向列表
function redirectorConversion(target: any) {
    if (isOldRedirector(target)) {
        const newInterceptor: NewGLobalStateStruct['redirector_matching_content'] = target.map(interceptor => {
            const {
                id = "", switchOn = false, filterType = "normal", method = "ANY", remark = "",
                domain = "", redirect = "", headers = [], whitelist = []
            } = interceptor
            return {
                id, switch_on: switchOn, filter_type: filterType, method, remark,
                domain, redirect_url: redirect, headers, ignores: whitelist
            }
        })
        return newInterceptor
    }
    return target
}

/**
 * 数据转换
 * content-script 使用, 页面加载时
 * 由于 v2.1.0 版本 项目重构，数据属性有变动。
 * 需要将老数据预处理为新数据结构体
 */
export function onLoadForDataConversion<T extends NewGLobalStateStruct | OldGLobalStateStruct | { [key: string]: any }>(target: T) {
    if (isOldGlobalState(target)) {
        // 需要转换数据格式
        const {
            globalSwitchOn,
            mode,
            proxy_routes,
            redirect
        } = target

        // 转义 拦截列表
        const interceptors = interceptorConversion(proxy_routes)
        // 转义 重定向列表
        const redirectors = redirectorConversion(redirect)
        const newData: NewGLobalStateStruct = {
            global_on: globalSwitchOn,
            mode,
            interceptor_matching_content: interceptors,
            redirector_matching_content: redirectors
        }
        // 旧数据对应key，用于上游做旧数据清理使用
        const changeKeywords: MappingOldKeys = ["globalSwitchOn", "mode", "proxy_routes", "redirect"]
        return {
            changed: true,
            data: newData,
            changeKeywords
        }
    }

    // 新数据结构，无需转换
    return {
        changed: false,
        data: target,
        changeKeywords: []
    }
}

/**
 * 数据转换
 * panels 使用, 数据上传时
 * 由于 v2.1.0 版本 项目重构，数据属性有变动。
 * 需要将老数据预处理为新数据结构体
 * 原数据格式: { lang, proxy_routes, tags, mode, redirect }
 * 转义为: { language, mode, tags, interceptors, redirectors }
 */
export function onUploadForDataConversion(target: OldUploadStruct | NewUploadStruct) {
    if (isOldUploadState(target)) {
        const {
            lang = 'en', proxy_routes = [], redirect = [], mode = 'interceptor', tags = []
        } = target

        // 转义 拦截列表
        const interceptors = interceptorConversion(proxy_routes)
        // 转义 重定向列表
        const redirectors = redirectorConversion(redirect)
        const newData: NewUploadStruct = {
            language: lang,
            mode,
            tags,
            interceptors,
            redirectors
        }
        return newData
    }
    // 新数据结构，无需转换
    return target
}
