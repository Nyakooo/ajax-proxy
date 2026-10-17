import { finalRedirectUrl, matchIgnoresAndRule } from "./common";
import { execSetup } from "./redirectUrlFunc";
import { RefGlobalState } from "./types";

// 共享状态
let globalState: RefGlobalState
const OriginFetch = window.fetch.bind(window)
// 初始化共享状态
export const initRedirectFetchState = (state: RefGlobalState) => globalState = state

export default async function CustomFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let fetchMethod: string | undefined | "ANY" = "ANY"
    let customInit: RequestInit = init || {}
    if (init) {
        fetchMethod = init.method?.toUpperCase() || "ANY"
    }

    for (let i = 0; i < globalState.value.redirector_matching_content.length; i++) {
        const {
            switch_on = true,
            domain = "",
            method = "ANY",
            filter_type,
            redirect_url = "",
            headers = [],
            ignores = [],
            redirect_type = "text",
            redirect_func = ""
        } = globalState.value.redirector_matching_content[i];
        if (switch_on) {
            // 判断是否存在协议匹配
            if (method && ![fetchMethod, "ANY"].includes(method.toUpperCase())) break
            if (redirect_type === "function") {
                const payload = await execSetup({ url: input.toString(), method: fetchMethod }, redirect_func)
                input = payload.url

                if (init?.headers) {
                    // 初始化 RequestInit
                    customInit = init
                    const initHeaders = new Headers(init.headers)
                    if (payload.headers) {
                        for (const key in payload.headers) {
                            if (Object.prototype.hasOwnProperty.call(payload.headers, key)) {
                                const value = payload.headers[key];
                                if (key && value) initHeaders.set(key, value)
                            }
                        }
                    }
                    customInit.headers = initHeaders
                } else {
                    const newHeaders: HeadersInit = payload.headers ? Object.keys(payload.headers).map(key => [key, payload.headers![key]]) : []
                    customInit = {
                        headers: newHeaders
                    }
                }

                // 值取当前命中的第一个，后续再命中的忽略
                break;
            } else if (matchIgnoresAndRule(input.toString(), domain, filter_type, ignores)) {
                input = finalRedirectUrl(input.toString(), domain, redirect_url, filter_type)

                if (init?.headers) {
                    // 初始化 RequestInit
                    customInit = init
                    const initHeaders = new Headers(init.headers)
                    headers.forEach(header => {
                        initHeaders.set(header.key, header.value)
                    })
                    customInit.headers = initHeaders
                } else {
                    const newHeaders: HeadersInit = headers.map(header => [header.key, header.value])
                    customInit = {
                        headers: newHeaders
                    }
                }

                // 值取当前命中的第一个，后续再命中的忽略
                break;
            }
        }
    }
    return OriginFetch.call(CustomFetch, input, customInit)
}
