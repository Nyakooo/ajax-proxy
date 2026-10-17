import { maybeMatching, notice } from "./common";
import { execSetup, getCtx } from "./overrideFunc";
import { RefGlobalState } from "./types";

// 共享状态
let globalState: RefGlobalState
// XMLHttpRequest 副本
export const OriginXHR = window.XMLHttpRequest;
// 初始化共享状态
export const initInterceptorXHRState = (state: RefGlobalState) => globalState = state

class CustomXHR extends XMLHttpRequest {
    // 响应内容
    responseText!: string;
    // XHR 响应
    response: any;
    status!: number;
    statusText: string = "";
    // 请求协议
    method = 'GET'
    // 请求Body
    body?: Document | XMLHttpRequestBodyInit | null
    // 消息锁
    private message_once_lock: boolean = false;

    constructor() {
        super();
        // 初始化原始XHR实例
        // 将XHR属性赋值给Custom
        // 重写 response & responseText
        this.watchAndOverride()
        // 拦截open，获取请求协议
        this.getMethod()
    }

    // 获取请求协议
    private getMethod() {
        const { open, send } = this
        this.open = (
            method: string,
            url: string | URL,
            async?: boolean,
            username?: string | null,
            password?: string | null,
        ) => {
            // 获取当前请求协议
            this.method = (method || 'ANY').toUpperCase()
            open.apply(this, [method, url, async !== undefined ? async : true, username, password])
        }
        this.send = (body?: Document | XMLHttpRequestBodyInit | null) => {
            this.body = body
            send.call(this, body)
        }
    }

    // 规则匹配，修改响应内容
    private async maybeNeedModifyRes(origin_xhr_response: any) {
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
                if (method && ![this.method, "ANY"].includes(method.toUpperCase())) continue
                // 规则匹配
                const matched = maybeMatching(this.responseURL, match_url, filter_type);
                if (!matched) continue // 退出当前循环
                if (override_type === "function") {
                    const ctx = getCtx(this.responseURL, this.method, this.status, status_code, this.body, origin_xhr_response)
                    const payload = await execSetup(ctx, override_func)
                    if (payload.override) {
                        const _override = typeof payload.override === "string" ? payload.override : JSON.stringify(payload.override);
                        this.responseText = _override;
                        this.response = _override;
                    }
                    this.status = +payload.status!
                    this.statusText = payload.status + ""
                } else {
                    // 修改响应
                    this.responseText = override;
                    this.response = override;
                    // 修改状态码
                    this.status = +status_code
                    this.statusText = status_code
                }
                // 通知
                if (!this.message_once_lock) {
                    notice(this.responseURL, match_url, this.method);
                    this.message_once_lock = true;
                }
            }
        }
    }

    // 属性重写
    private overrideAttr(attr: keyof XMLHttpRequest, xhr: XMLHttpRequest) {
        // 重写属性
        // @ts-ignore
        if (typeof xhr[attr] === "function") this[attr] = xhr[attr].bind(xhr);
        else if (['responseText', 'response', 'status', 'statusText'].includes(attr))
            // responseText和response 属性只读
            // 缓存在对应 自定义 _[attr] 上
            Object.defineProperty(this, attr, {
                get: () =>
                    // @ts-ignore
                    this[`_${attr}`] == undefined ? xhr[attr] : this[`_${attr}`],
                // @ts-ignore
                set: (val) => (this[`_${attr}`] = val),
                enumerable: true,
            });
        else
            Object.defineProperty(this, attr, {
                get: () => xhr[attr],
                // @ts-ignore
                set: (val) => (xhr[attr] = val),
                enumerable: true,
            });
    }

    // 拦截监听
    private watchAndOverride() {
        // 获取原始XHR
        const xhr = new OriginXHR();
        for (let attr in xhr) {
            if (attr === "onreadystatechange") {
                xhr.onreadystatechange = async (...args) => {
                    // 开启拦截
                    if (this.readyState == 4) await this.maybeNeedModifyRes(xhr.response);
                    this.onreadystatechange && this.onreadystatechange.apply(this, args);
                };
                continue;
            }
            // else if (attr === "onload") {
            //     xhr.onload = async (...args) => {
            //         // 开启拦截
            //         await this.maybeNeedModifyRes(xhr.response);
            //         this.onload && this.onload.apply(this, args);
            //     };
            //     this.onload = null;
            //     continue;
            // }
            // 其他属性重写
            this.overrideAttr(attr as keyof XMLHttpRequest, xhr)
        }
    }
}

export default CustomXHR