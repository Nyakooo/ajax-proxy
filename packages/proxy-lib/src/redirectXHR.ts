import { finalRedirectUrl, fmtURLToString, matchIgnoresAndRule } from "./common";
import { execSetup } from "./redirectUrlFunc";
import { RefGlobalState } from "./types";

// 状态
let globalState: RefGlobalState
// 初始化共享状态
export const initRedirectXHRState = (state: RefGlobalState) => globalState = state

export default class CustomRedirectXHR extends XMLHttpRequest {

    // 请求协议
    method = 'ANY'

    constructor() {
        super();
        this.watchAndRedirect()
    }

    private watchAndRedirect() {
        const { open } = this
        const origin_XHR_open = open
        const origin_XHR_setRequestHeader = this.setRequestHeader
        const origin_XHR_send = this.send
        this.open = async (method: string,
            url: string | URL,
            async?: boolean,
            username?: string | null,
            password?: string | null,
        ) => {
            this.method = (method || "ANY").toUpperCase()
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
                    if (method && ![this.method, "ANY"].includes(method.toUpperCase())) return
                    // 规则判断
                    const currentUrl = fmtURLToString(url)
                    if (redirect_type === "function") {
                        const payload = await execSetup({ url: currentUrl, method: this.method }, redirect_func)
                        url = payload.url
                        this.send = (body?: Document | XMLHttpRequestBodyInit | null) => {
                            if (payload.headers) {
                                for (const key in payload.headers) {
                                    if (Object.prototype.hasOwnProperty.call(payload.headers, key)) {
                                        const value = payload.headers[key];
                                        if (key && value)
                                            this.setRequestHeader(key, value)
                                    }
                                }
                            }
                            origin_XHR_send.call(this, body)
                        }
                        break;
                    } else if (matchIgnoresAndRule(currentUrl, domain, filter_type, ignores)) {
                        url = finalRedirectUrl(currentUrl, domain, redirect_url, filter_type)

                        // 获取 自定义 header 映射关系
                        const cacheHeaderMap: { [key: string]: string } = {}
                        headers.forEach(header => (cacheHeaderMap[header.key] = header.value))

                        this.setRequestHeader = (name: string, value: string) => {
                            // 判断是否存在需要修改的header
                            // 如果存在，则不修改，让send里面重新设置
                            if (!cacheHeaderMap[name]) origin_XHR_setRequestHeader.apply(this, [name, value])
                        }
                        this.send = (body?: Document | XMLHttpRequestBodyInit | null) => {
                            for (let k = 0; k < headers.length; k++) {
                                const header = headers[k];
                                // 移除掉 映射关系
                                // Reflect.deleteProperty(cacheHeaderMap, header.key)
                                delete cacheHeaderMap[header.key]
                                this.setRequestHeader(header.key, header.value)
                            }
                            origin_XHR_send.call(this, body)
                        }
                        // 值取当前命中的第一个，后续再命中的忽略
                        break;
                    }

                }
            }
            origin_XHR_open.apply(this, [method, url, async !== undefined ? async : true, username, password])
        }
    }
}