import { finalRedirectUrl, fmtURLToString, matchIgnoresAndRule } from "./common"
import { IRedirectHeader, RefGlobalState } from "./types"

// 状态
let globalState: RefGlobalState
// 初始化共享状态
export const initRedirectXHRState = (state: RefGlobalState) => (globalState = state)

type RedirectRequest = { url: string; method: string }
type RedirectResult = { url: string; headers?: IRedirectHeader[] }

function normalizeRedirectResult(value: unknown): RedirectResult | undefined {
  if (!value || typeof value !== 'object') return undefined
  const result = value as { url?: unknown; headers?: unknown }
  if (typeof result.url !== 'string') return undefined
  if (
    result.headers !== undefined &&
    (!result.headers || Object.prototype.toString.call(result.headers) !== '[object Object]')
  ) {
    return undefined
  }
  const headers = result.headers as Record<string, string> | undefined
  return {
    url: result.url,
    headers: headers
      ? Object.entries(headers).map(([key, headerValue]) => ({ key, value: headerValue }))
      : undefined,
  }
}

function runSynchronousRedirect(
  req: RedirectRequest,
  funcText: string
): RedirectResult | undefined {
  try {
    const execFunc = window.eval(`;(${funcText})`)
    if (typeof execFunc !== 'function') return undefined

    let completed = false
    let result: RedirectResult | undefined
    const complete = (value: unknown) => {
      if (completed) return
      completed = true
      result = normalizeRedirectResult(value)
    }
    const returned = execFunc(req, complete)
    if (completed) return result
    if (
      returned &&
      (typeof returned === 'object' || typeof returned === 'function') &&
      typeof (returned as { then?: unknown }).then === 'function'
    ) {
      console.warn(
        '[AjaxProxy] Async redirect functions are not supported by XMLHttpRequest.open; using the original URL'
      )
      Promise.resolve(returned).catch((error) => {
        console.error('[AjaxProxy][error] XHR redirect function rejected', error)
      })
      return undefined
    }
    if (returned === undefined) {
      console.warn(
        '[AjaxProxy] Redirect function did not complete synchronously; using the original URL'
      )
    }
    return normalizeRedirectResult(returned)
  } catch (error) {
    console.error('[AjaxProxy][error] XHR redirect function failed', error)
    return undefined
  }
}

export default class CustomRedirectXHR extends XMLHttpRequest {
  // 请求协议
  method = 'ANY'

  constructor() {
    super()
    this.watchAndRedirect()
  }

  private watchAndRedirect() {
    const origin_XHR_open = this.open
    const origin_XHR_setRequestHeader = this.setRequestHeader
    const origin_XHR_send = this.send
    this.open = (
      method: string,
      url: string | URL,
      async?: boolean,
      username?: string | null,
      password?: string | null
    ) => {
      this.method = (method || 'ANY').toUpperCase()
      const currentUrl = fmtURLToString(url)
      let targetUrl = currentUrl
      let customHeaders: IRedirectHeader[] = []

      const redirectRules =
        !globalState.v3_active &&
        globalState.value.global_on &&
        globalState.value.mode === 'redirector'
          ? globalState.value.redirector_matching_content
          : []
      for (const rule of redirectRules) {
        const {
          switch_on = true,
          domain = '',
          method: ruleMethod = 'ANY',
          filter_type,
          redirect_url = '',
          headers = [],
          ignores = [],
          redirect_type = 'text',
          redirect_func = '',
        } = rule
        if (!switch_on) continue
        if (ruleMethod && ![this.method, 'ANY'].includes(ruleMethod.toUpperCase())) continue

        if (redirect_type === 'function') {
          const result = runSynchronousRedirect(
            { url: currentUrl, method: this.method },
            redirect_func
          )
          if (result) {
            targetUrl = result.url || currentUrl
            customHeaders = result.headers ?? []
          }
          break
        }

        if (!matchIgnoresAndRule(currentUrl, domain, filter_type, ignores)) continue
        targetUrl = finalRedirectUrl(currentUrl, domain, redirect_url, filter_type)
        customHeaders = headers
        break
      }

      // 恢复上一次 open 可能安装的规则头包装，允许同一 XHR 对象重新使用。
      this.setRequestHeader = origin_XHR_setRequestHeader
      this.send = origin_XHR_send
      if (customHeaders.length > 0) {
        const overriddenHeaders = new Set(customHeaders.map((header) => header.key.toLowerCase()))
        this.setRequestHeader = (name: string, value: string) => {
          if (!overriddenHeaders.has(name.toLowerCase())) {
            origin_XHR_setRequestHeader.apply(this, [name, value])
          }
        }
        this.send = (body?: Document | XMLHttpRequestBodyInit | null) => {
          for (const header of customHeaders) {
            origin_XHR_setRequestHeader.apply(this, [header.key, header.value])
          }
          origin_XHR_send.call(this, body)
        }
      }

      origin_XHR_open.apply(this, [
        method,
        targetUrl,
        async !== undefined ? async : true,
        username,
        password,
      ])
    }
  }
}
