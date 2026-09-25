import {
  IFilterType,
  IGlobalState,
  IMatchInterceptorContent,
  IMatchRedirectContent,
  IMode,
  IRedirectHeader,
  IRequestMethod,
  OverrideType,
  RedirectType,
  RefGlobalState,
} from './types'
import CreateXHR, { initInterceptorXHRState, OriginXHR } from './createXHR'
import CreateFetch, { initInterceptorFetchState, OriginFetch } from './createFetch'
import RedirectXHR, { initRedirectXHRState } from './redirectXHR'
import RedirectFetch, { initRedirectFetchState } from './redirectFetch'
import { createV3Fetch } from './v3/fetch'
import { createV3XHR } from './v3/xhr'
import { validateV3Backup } from '@proxy/v3-domain'
import type { V3Backup } from '@proxy/v3-domain'
import { NoticeTo } from '@proxy/protocol'
import type { V3Hit } from '@proxy/protocol'
import { warn } from './common'
import {
  isValidGlobalState,
  isValidInterceptors,
  isValidMode,
  isValidRedirectors,
} from './validateState'

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
    redirector_matching_content: [],
  },
}
const pageFetchAtLoad = window.fetch
const pageXHRAtLoad = window.XMLHttpRequest
let v3Backup: V3Backup | null = null

function notifyV3Match(rule: V3Backup['rules'][number], request: { url: string; method: string }) {
  try {
    const detail: V3Hit = {
      kind: 'v3-hit',
      rule_id: rule.id,
      match_url: rule.match.url,
      method: request.method,
      url: request.url,
    }
    window.dispatchEvent(
      new CustomEvent(NoticeTo.CONTENT, {
        detail,
      })
    )
  } catch {
    // Diagnostics must not affect the request path.
  }
}

const V3Fetch = createV3Fetch(pageFetchAtLoad, {
  getRules: () => (v3Backup?.settings.globalEnabled ? v3Backup.rules : []),
  onMatched: (rule, _index, request) => notifyV3Match(rule, request),
})
const V3XHR = createV3XHR(pageXHRAtLoad, {
  getRules: () => (v3Backup?.settings.globalEnabled ? v3Backup.rules : []),
  onMatched: (rule, _index, request) => notifyV3Match(rule, request),
}) as unknown as typeof window.XMLHttpRequest

function isProxyFetch(fetch: typeof window.fetch) {
  return fetch === CreateFetch || fetch === RedirectFetch || fetch === V3Fetch
}

function isProxyXHR(xhr: typeof window.XMLHttpRequest) {
  return xhr === CreateXHR || xhr === RedirectXHR || xhr === V3XHR
}

// 初始化状态
function initState() {
  // 初始化共享状态
  initInterceptorXHRState(globalState)
  initInterceptorFetchState(globalState)
  initRedirectXHRState(globalState)
  initRedirectFetchState(globalState)
}

// 实例挂载
function mountInstance() {
  const { global_on = true, mode } = globalState.value
  const currentXHR = window.XMLHttpRequest
  const currentFetch = window.fetch
  const canManageXHR =
    currentXHR === pageXHRAtLoad || currentXHR === OriginXHR || isProxyXHR(currentXHR)
  const canManageFetch =
    currentFetch === pageFetchAtLoad || currentFetch === OriginFetch || isProxyFetch(currentFetch)

  // 页面在扩展包装器外安装的包装器可能持有代理引用；不覆盖该表层，代理依共享状态停用。
  if (canManageXHR) window.XMLHttpRequest = OriginXHR
  if (canManageFetch) window.fetch = pageFetchAtLoad
  if (v3Backup) {
    if (!v3Backup.settings.globalEnabled) return
    if (canManageXHR) window.XMLHttpRequest = V3XHR
    if (canManageFetch) window.fetch = V3Fetch
    return
  }
  if (!global_on) return

  if (mode === 'interceptor') {
    if (canManageXHR) window.XMLHttpRequest = CreateXHR
    if (canManageFetch) window.fetch = CreateFetch
  } else if (mode === 'redirector') {
    if (canManageXHR) window.XMLHttpRequest = RedirectXHR
    if (canManageFetch) window.fetch = RedirectFetch
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
  if (typeof target === 'boolean') {
    globalState.value.global_on = target
    // 更新一波实例
    mountInstance()
  }
  // 修改模式
  else if (isValidMode(target)) {
    globalState.value.mode = target
    // 需要更新一下实例
    mountInstance()
  }
  // 数组类型: 拦截列表、重定向列表
  else if (Array.isArray(target)) {
    if (target.length === 0) {
      // Preserve the legacy mode-dependent meaning for callers that still use update([]).
      if (globalState.value.mode === 'interceptor')
        globalState.value.interceptor_matching_content = []
      else globalState.value.redirector_matching_content = []
    } else if (isValidInterceptors(target)) globalState.value.interceptor_matching_content = target
    else if (isValidRedirectors(target)) globalState.value.redirector_matching_content = target
    else warn('invalid rule list')
  }
  // 设置全部属性
  // 默认初始化时使用
  else if (isValidGlobalState(target)) {
    // 替换全部
    globalState.value = target
    // 重新挂载实例
    mountInstance()
  } else warn('unknow type')
}

function updateInterceptors(target: unknown) {
  if (!isValidInterceptors(target)) {
    warn('invalid interceptor list')
    return
  }
  globalState.value.interceptor_matching_content = target
}

function updateRedirectors(target: unknown) {
  if (!isValidRedirectors(target)) {
    warn('invalid redirector list')
    return
  }
  globalState.value.redirector_matching_content = target
}

function updateV3(target: unknown) {
  if (target === null) {
    v3Backup = null
    globalState.v3_active = false
    mountInstance()
    return
  }
  const result = validateV3Backup(target)
  if (!result.ok) {
    warn('invalid V3 configuration')
    return
  }
  v3Backup = result.data
  globalState.v3_active = true
  mountInstance()
}

initState()

export default {
  update,
  updateInterceptors,
  updateRedirectors,
  updateV3,
}

export {
  isRecord,
  isValidGlobalState,
  isValidInterceptors,
  isValidMode,
  isValidRedirectors,
} from './validateState'
export type {
  IFilterType,
  IGlobalState,
  IRequestMethod,
  IMode,
  IMatchInterceptorContent,
  IMatchRedirectContent,
  IRedirectHeader,
  OverrideType,
  RedirectType,
  RefGlobalState,
}
