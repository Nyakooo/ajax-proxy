import { finalRedirectUrl, matchIgnoresAndRule } from "./common";
import { execSetup } from "./redirectUrlFunc";
import { RefGlobalState } from "./types";

// 共享状态
let globalState: RefGlobalState
const OriginFetch = window.fetch.bind(window)
// 初始化共享状态
export const initRedirectFetchState = (state: RefGlobalState) => globalState = state

function createEffectiveRequest(input: RequestInfo | URL, init?: RequestInit): Request {
    if (input instanceof Request && !init) return input
    return new Request(input instanceof URL ? input.href : input, init)
}

export default async function CustomFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (!globalState.value.global_on || globalState.value.mode !== 'redirector') {
        return OriginFetch(input, init)
    }
    const request = createEffectiveRequest(input, init)
    const fetchMethod = request.method.toUpperCase()
    let redirectUrl = request.url
    let matchedRule = false
    const requestHeaders = new Headers(request.headers)

    for (let i = 0; i < globalState.value.redirector_matching_content.length; i++) {
        const {
            switch_on = true,
            domain = "",
            method = "ANY",
            filter_type,
            redirect_url = "",
            headers: customHeaders = [],
            ignores = [],
            redirect_type = "text",
            redirect_func = ""
        } = globalState.value.redirector_matching_content[i];
        if (switch_on) {
            // 判断是否存在协议匹配
            if (method && ![fetchMethod, "ANY"].includes(method.toUpperCase())) continue
            if (redirect_type === "function") {
                const payload = await execSetup({ url: request.url, method: fetchMethod }, redirect_func)
                if (Reflect.get(payload, Symbol.for('ajax-proxy.custom-function-fail-open'))) return OriginFetch(input, init)
                redirectUrl = payload.url || request.url
                if (payload.headers) {
                    for (const key in payload.headers) {
                        if (Object.prototype.hasOwnProperty.call(payload.headers, key)) {
                            const value = payload.headers[key];
                            if (key && value) requestHeaders.set(key, value)
                        }
                    }
                }
                matchedRule = true
                break
            } else if (matchIgnoresAndRule(request.url, domain, filter_type, ignores)) {
                redirectUrl = finalRedirectUrl(request.url, domain, redirect_url, filter_type)
                customHeaders.forEach(header => {
                    requestHeaders.set(header.key, header.value)
                })
                matchedRule = true
                break
            }
        }
    }

    if (!matchedRule) return OriginFetch(input, init)

    const requestBody = request.body ? await request.clone().arrayBuffer() : undefined
    const redirectedRequest = new Request(redirectUrl, {
        method: request.method,
        headers: requestHeaders,
        body: requestBody,
        credentials: request.credentials,
        mode: request.mode,
        cache: request.cache,
        redirect: request.redirect,
        referrer: request.referrer,
        referrerPolicy: request.referrerPolicy,
        integrity: request.integrity,
        keepalive: request.keepalive,
        signal: request.signal,
    })
    return OriginFetch(redirectedRequest)
}
