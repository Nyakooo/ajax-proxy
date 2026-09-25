import { maybeMatching, notice } from "./common";
import { execSetup, getCtx } from "./overrideFunc";
import { OverrideType, RefGlobalState } from "./types";

// 共享状态
let globalState: RefGlobalState
// fetch 副本
export const OriginFetch = window.fetch.bind(window)
// 初始化共享状态
export const initInterceptorFetchState = (state: RefGlobalState) => globalState = state

function CustomFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const request = input instanceof Request ? input : undefined
    const fetchMethod = init?.method?.toUpperCase() || request?.method.toUpperCase() || "GET"
    return OriginFetch(input, init).then(async (response: Response) => {
        const requestUrl = request?.url || response.url
        let txt: string | undefined;
        let status = response.status
        let statusText = response.statusText
        let _overrideType: OverrideType = "json"
        for (let i = 0; i < globalState.value.interceptor_matching_content.length; i++) {
            const target = globalState.value.interceptor_matching_content[i];
            const {
                switch_on = true,
                match_url,
                override = "",
                filter_type,
                method,
                status_code = "200",
                override_type = "json",
                override_func = ""
            } = target
            // 是否需要匹配
            if (switch_on && match_url) {
                // 判断是否存在协议匹配
                if (method && ![fetchMethod, "ANY"].includes(method.toUpperCase())) continue
                // 规则匹配
                const matched = maybeMatching(requestUrl, match_url, filter_type);
                if (!matched) continue // 退出当前循环
                _overrideType = override_type
                if (override_type === "function") {
                    const ctx = getCtx(
                        requestUrl,
                        fetchMethod,
                        response.status,
                        status_code,
                        init?.body,
                        response
                    )
                    const payload = await execSetup(ctx, override_func)
                    if (Reflect.get(payload, Symbol.for('ajax-proxy.custom-function-fail-open'))) return response
                    if (payload.override)
                        txt = typeof payload.override === "string" ? payload.override : JSON.stringify(payload.override);
                    status = +payload.status!
                    statusText = payload.status + ""
                } else {
                    // 修改响应
                    txt = typeof override === "string" ? override : JSON.stringify(override);
                    // 修改状态码
                    status = +status_code
                    statusText = status_code
                }
                // 通知
                notice(requestUrl, match_url, fetchMethod)
            }
        }

        // 返回原始响应
        if (!globalState.value.global_on || (!txt && _overrideType !== 'function')) return response

        if (!Number.isInteger(status) || status < 200 || status > 599) return response

        const hasNoBody = fetchMethod === 'HEAD' || [204, 205, 304].includes(status)
        const replacementHeaders = new Headers(response.headers)
        replacementHeaders.delete('content-length')
        replacementHeaders.delete('content-encoding')
        replacementHeaders.delete('content-range')
        replacementHeaders.delete('transfer-encoding')
        const replacementBody = hasNoBody ? null : (txt ?? '')
        const newResponse = new Response(replacementBody, {
            headers: replacementHeaders,
            status: status,
            statusText: statusText,
        });
        const proxy = new Proxy(newResponse, {
            get(target, prop) {
                if (['redirected', 'type', 'url'].includes(prop as string)) {
                    return Reflect.get(response, prop, response)
                }
                const value = Reflect.get(target, prop, target)
                return typeof value === 'function' && prop !== 'constructor' ? value.bind(target) : value
            },
        });
        return proxy;
    });
}

export default CustomFetch
