// console.log("Ajax proxy document.js");

import lib, { isValidGlobalState, isValidMode } from '@proxy/lib'
import { NoticeFrom, NoticeTo, NoticeKey, StorageKey } from '@proxy/shared-utils'
import { NOTICE_KEY_REFRESH_GLOBAL_STATE } from './consts'

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

window.addEventListener(
  'message',
  function (event) {
    const data = event.data
    if (event.source !== window || event.origin !== window.location.origin || !isRecord(data))
      return
    if (
      data.from !== NoticeFrom.CONTENT ||
      data.to !== NoticeTo.DOCUMENT ||
      typeof data.key !== 'string'
    )
      return
    if (Object.keys(data).some((key) => !['from', 'to', 'key', 'value'].includes(key))) return
    switch (data.key) {
      // 更新全部数据
      // content 首次加载时
      case NOTICE_KEY_REFRESH_GLOBAL_STATE: {
        if (!isRecord(data.value)) return
        const { GLOBAL_SWITCH, MODE, INTERCEPT_LIST, REDIRECT_LIST } = StorageKey
        // 获取 映射
        // 设置默认值
        const {
          [GLOBAL_SWITCH]: global_on = false,
          [MODE]: mode = 'interceptor',
          [INTERCEPT_LIST]: interceptor_matching_content = [],
          [REDIRECT_LIST]: redirector_matching_content = [],
        } = data.value
        const state = { global_on, mode, interceptor_matching_content, redirector_matching_content }
        if (isValidGlobalState(state)) lib.update(state)
        break
      }
      // 全局开关
      case NoticeKey.GLOBAL_SWITCH:
        if (typeof data.value === 'boolean') lib.update(data.value)
        break
      // 模式切换
      case NoticeKey.MODE:
        if (isValidMode(data.value)) lib.update(data.value)
        break
      // 拦截器列表
      case NoticeKey.INTERCEPT_LIST:
        lib.updateInterceptors(data.value)
        break
      // 重定向列表
      case NoticeKey.REDIRECT_LIST:
        lib.updateRedirectors(data.value)
        break
      // V3 config is independent from V2 mode/rule storage. The proxy library
      // validates this untrusted page-world message before changing runtime state.
      case NoticeKey.V3_CONFIG:
        lib.updateV3(data.value)
        break
      case NoticeKey.V3_DIAGNOSTICS_ARMED:
        if (typeof data.value === 'boolean') lib.updateV3DiagnosticsArmed(data.value)
        break
      case NoticeKey.V3_FETCH_OUTCOMES_ARMED:
        if (typeof data.value === 'boolean')
          lib.updateV3FetchOutcomeDiagnosticsArmed(data.value)
        break
    }
  },
  false
)
