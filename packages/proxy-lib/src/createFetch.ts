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
    let fetchMethod: string | undefined | "ANY" = "ANY"
    if (init) {
        fetchMethod = init.method?.toUpperCase() || "ANY"
    }
    return OriginFetch(input, init).then(async (response: Response) => {
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
                const matched = maybeMatching(response.url, match_url, filter_type);
                if (!matched) continue // 退出当前循环
                _overrideType = override_type
                if (override_type === "function") {
                    const ctx = getCtx(
                        response.url,
                        init?.method?.toUpperCase() || "GET",
                        response.status,
                        status_code,
                        init?.body,
                        response
                    )
                    const payload = await execSetup(ctx, override_func)
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
                notice(response.url, match_url, fetchMethod || "")
            }
        }

        // 返回原始响应
        if (!globalState.value.global_on || (!txt && _overrideType !== 'function')) return response

        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode(txt));
                controller.close();
            },
        });
        const newResponse = new Response(stream, {
            headers: response.headers,
            status: status,
            statusText: statusText,
        });
        const proxy = new Proxy(newResponse, {
            get: function (target, prop) {
                const checkKeys = ['ok', 'redirected', 'type', 'url', 'useFinalURL', 'body', 'bodyUsed'];
                if (checkKeys.includes(prop as string)) {
                    return Reflect.get(target, prop);
                }
                return Reflect.get(target, prop);
            },
        });

        for (let key in proxy) {
            // 获取proxy key 对应实例
            const target = Reflect.get(proxy, key);
            // 判断实例是否为 Response 实例
            if (typeof target === "function") {
                // 将新的 Response 实例绑定到 proxy 实例上
                Reflect.set(proxy, key, target.bind(newResponse));
            }
        }
        return proxy;
    });
}

export default CustomFetch