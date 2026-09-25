import { maybeMatching } from './common'
import { execSetup, getCtx } from './overrideFunc'
import { RefGlobalState } from './types'
import { NoticeTo } from '@proxy/protocol'

// 共享状态
let globalState: RefGlobalState
// XMLHttpRequest 副本
export const OriginXHR = window.XMLHttpRequest
// 初始化共享状态
export const initInterceptorXHRState = (state: RefGlobalState) => (globalState = state)

class CustomXHR extends XMLHttpRequest {
  // 响应内容
  responseText!: string
  // XHR 响应
  response: any
  status!: number
  statusText: string = ''
  // 请求协议
  method = 'GET'
  // 请求Body
  body?: Document | XMLHttpRequestBodyInit | null
  // 消息锁
  private message_once_lock: boolean = false
  private readyStateEvent = Promise.resolve()

  constructor() {
    super()
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
      password?: string | null
    ) => {
      this.body = undefined
      this.message_once_lock = false
      for (const attr of ['responseText', 'response', 'status', 'statusText']) {
        Reflect.deleteProperty(this, `_${attr}`)
      }
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
    if (
      globalState.v3_active ||
      !globalState.value.global_on ||
      globalState.value.mode !== 'interceptor'
    )
      return
    for (let i = 0; i < globalState.value.interceptor_matching_content.length; i++) {
      const target = globalState.value.interceptor_matching_content[i]
      const {
        switch_on = true,
        match_url,
        override = '',
        filter_type,
        method,
        status_code = '200',
        override_type = 'json',
        override_func = '',
      } = target
      // 是否需要匹配
      if (switch_on && match_url) {
        // 判断是否存在协议匹配
        if (method && ![this.method, 'ANY'].includes(method.toUpperCase())) continue
        // 规则匹配
        const matched = maybeMatching(this.responseURL, match_url, filter_type)
        if (!matched) continue // 退出当前循环
        if (override_type === 'function') {
          const ctx = getCtx(
            this.responseURL,
            this.method,
            this.status,
            String(status_code),
            this.body,
            origin_xhr_response
          )
          const payload = await execSetup(ctx, override_func)
          if (Reflect.get(payload, Symbol.for('ajax-proxy.custom-function-fail-open'))) return
          const nextStatus = Number(payload.status)
          if (!Number.isInteger(nextStatus) || nextStatus < 200 || nextStatus > 599) return
          if (payload.override) {
            const _override =
              typeof payload.override === 'string'
                ? payload.override
                : JSON.stringify(payload.override)
            this.responseText = _override
            this.response = _override
          }
          this.status = nextStatus
          this.statusText = payload.status + ''
        } else {
          const nextStatus = Number(status_code)
          if (!Number.isInteger(nextStatus) || nextStatus < 200 || nextStatus > 599) return
          // 修改响应
          this.responseText = override
          this.response = override
          // 修改状态码
          this.status = nextStatus
          this.statusText = String(status_code)
        }
        // 通知
        if (!this.message_once_lock) {
          window.dispatchEvent(
            new CustomEvent(NoticeTo.CONTENT, {
              detail: {
                url: this.responseURL,
                match_url,
                method: this.method,
                rule_index: i,
              },
            })
          )
          this.message_once_lock = true
        }
        return
      }
    }
  }

  // 属性重写
  private overrideAttr(attr: keyof XMLHttpRequest, xhr: XMLHttpRequest) {
    // 重写属性
    // @ts-ignore
    if (typeof xhr[attr] === 'function') this[attr] = xhr[attr].bind(xhr)
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
      })
    else
      Object.defineProperty(this, attr, {
        get: () => xhr[attr],
        // @ts-ignore
        set: (val) => (xhr[attr] = val),
        enumerable: true,
      })
  }

  private forwardEvent(event: Event) {
    let forwarded: Event
    if (typeof ProgressEvent !== 'undefined' && event instanceof ProgressEvent) {
      forwarded = new ProgressEvent(event.type, {
        bubbles: event.bubbles,
        cancelable: event.cancelable,
        composed: event.composed,
        lengthComputable: event.lengthComputable,
        loaded: event.loaded,
        total: event.total,
      })
    } else {
      forwarded = new Event(event.type, {
        bubbles: event.bubbles,
        cancelable: event.cancelable,
        composed: event.composed,
      })
    }
    if (typeof this.dispatchEvent === 'function') this.dispatchEvent(forwarded)
  }

  // 拦截监听
  private watchAndOverride() {
    // 获取原始XHR
    const xhr = new OriginXHR()
    for (let attr in xhr) {
      if (attr === 'onreadystatechange') continue
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
      if (
        [
          'addEventListener',
          'removeEventListener',
          'dispatchEvent',
          'onloadstart',
          'onprogress',
          'onabort',
          'onerror',
          'onload',
          'ontimeout',
          'onloadend',
        ].includes(attr)
      )
        continue
      this.overrideAttr(attr as keyof XMLHttpRequest, xhr)
    }

    xhr.onreadystatechange = (event) => {
      const readyState = xhr.readyState
      const response = xhr.response
      this.readyStateEvent = this.readyStateEvent.then(async () => {
        // 修改响应后再转发最终状态，保持 readyState 与 load 事件顺序。
        if (readyState === 4) await this.maybeNeedModifyRes(response)
        this.forwardEvent(event)
      })
    }

    if (typeof xhr.addEventListener === 'function') {
      for (const eventName of [
        'loadstart',
        'progress',
        'abort',
        'error',
        'load',
        'timeout',
        'loadend',
      ]) {
        xhr.addEventListener(eventName, (event) => {
          void this.readyStateEvent.then(() => this.forwardEvent(event))
        })
      }
    }
  }
}

export default CustomXHR
