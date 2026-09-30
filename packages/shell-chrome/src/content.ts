// console.log("Ajax proxy content.js")

import {
  initStorage,
  NoticeTo,
  NoticeKey,
  StorageKey,
  noticeDocumentByContent,
  noticeServiceWorkerByContent,
  getStorage,
  getStorageSnapshot,
} from '@proxy/shared-utils'
import { CONNECT_NAME, INIT_CURRENT_TITLE, NOTICE_KEY_REFRESH_GLOBAL_STATE } from './consts'
import { isPageBadgeHit } from './messageValidation'
import { normalizeV3Origin, validateV3Backup } from '@proxy/v3-domain'
import type { V3Backup, V3Rule } from '@proxy/v3-domain'
import {
  isV3FetchOutcome,
  isV3FunctionError,
  isV3Hit,
  isV3NoMatch,
  isV3XHROutcome,
} from '@proxy/protocol'

const V3_FUNCTION_SANDBOX_FRAME_ID = 'ajax-proxy-v3-function-sandbox'
const V3_FUNCTION_SANDBOX_PATH = 'v3-sandbox/sandbox.html'
let v3FunctionSandboxObserver: MutationObserver | undefined

/** Project stored V3 state to the rules and actions this page can actually run. */
function getRuntimeV3Config(value: unknown): V3Backup | null {
  if (value === null || value === undefined) return null

  const validation = validateV3Backup(value)
  if (!validation.ok) return null

  const backup = validation.data
  // about:srcdoc inherits its parent's origin even though its URL is opaque.
  const pageOrigin = normalizeV3Origin(window.origin)
  const siteDisabled = pageOrigin !== null && backup.disabledOrigins.includes(pageOrigin)
  const canRunRules = backup.settings.globalEnabled && pageOrigin !== null && !siteDisabled
  const rules: V3Rule[] = canRunRules
    ? backup.rules.flatMap((rule) => {
        if (!rule.enabled) return []
        const { request, response, ...metadata } = rule
        const activeRequest = request?.enabled ? request : undefined
        const activeResponse = response?.enabled ? response : undefined
        if (!activeRequest && !activeResponse) return []
        return [
          {
            ...metadata,
            ...(activeRequest ? { request: activeRequest } : {}),
            ...(activeResponse ? { response: activeResponse } : {}),
          },
        ]
      })
    : []
  const referencedTagIds = new Set(rules.flatMap((rule) => rule.tagIds ?? []))

  return {
    ...backup,
    // Keep only page-relevant site state; the rest of the disabled-origin list
    // is private to the extension and is not needed by this document.
    disabledOrigins: siteDisabled && pageOrigin !== null ? [pageOrigin] : [],
    tags: backup.tags.filter((tag) => referencedTagIds.has(tag.id)),
    rules,
  }
}

function getLegacyRuntimeState(data: Record<string, unknown>) {
  const { GLOBAL_SWITCH, MODE, INTERCEPT_LIST, REDIRECT_LIST } = StorageKey
  return {
    [GLOBAL_SWITCH]: data[GLOBAL_SWITCH] ?? false,
    [MODE]: data[MODE] ?? 'interceptor',
    [INTERCEPT_LIST]: data[INTERCEPT_LIST] ?? [],
    [REDIRECT_LIST]: data[REDIRECT_LIST] ?? [],
  }
}

function hasEnabledV3Function(value: unknown): boolean {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    const config = value as { settings?: { globalEnabled?: unknown }; rules?: unknown }
    if (config.settings?.globalEnabled !== true || !Array.isArray(config.rules)) return false
    return config.rules.some((candidate) => {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false
      const rule = candidate as {
        enabled?: unknown
        response?: { enabled?: unknown; replace?: { code?: unknown } }
        request?: { enabled?: unknown; redirect?: { type?: unknown; code?: unknown } }
      }
      if (rule.enabled !== true) return false
      const hasResponseFunction =
        rule.response?.enabled === true &&
        typeof rule.response.replace?.code === 'string' &&
        rule.response.replace.code.trim() !== ''
      const hasRedirectFunction =
        rule.request?.enabled === true &&
        rule.request.redirect?.type === 'function' &&
        typeof rule.request.redirect.code === 'string' &&
        rule.request.redirect.code.trim() !== ''
      return hasResponseFunction || hasRedirectFunction
    })
  } catch {
    return false
  }
}

function updateV3FunctionSandbox(value: unknown): void {
  const shouldExist = hasEnabledV3Function(value)
  const extensionUrl = chrome.runtime.getURL(V3_FUNCTION_SANDBOX_PATH)
  const existing = document.getElementById(V3_FUNCTION_SANDBOX_FRAME_ID) as HTMLIFrameElement | null

  if (!shouldExist) {
    v3FunctionSandboxObserver?.disconnect()
    v3FunctionSandboxObserver = undefined
    existing?.remove()
    return
  }

  const ensureFrame = () => {
    if (!document.documentElement) return
    const current = document.getElementById(
      V3_FUNCTION_SANDBOX_FRAME_ID
    ) as HTMLIFrameElement | null
    if (current?.getAttribute('src') === extensionUrl) return
    current?.remove()
    const frame = document.createElement('iframe')
    frame.id = V3_FUNCTION_SANDBOX_FRAME_ID
    frame.src = extensionUrl
    frame.hidden = true
    frame.setAttribute('aria-hidden', 'true')
    frame.setAttribute('tabindex', '-1')
    frame.title = 'Ajax Proxy V3 function sandbox'
    document.documentElement.append(frame)
  }

  ensureFrame()
  if (v3FunctionSandboxObserver) return
  v3FunctionSandboxObserver = new MutationObserver(ensureFrame)
  v3FunctionSandboxObserver.observe(document, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'id'],
  })
}

initStorage()
  .then(() => {
    const { GLOBAL_SWITCH, MODE, INTERCEPT_LIST, REDIRECT_LIST, V3_CONFIG } = StorageKey
    const legacyConfigKeys = [GLOBAL_SWITCH, MODE, INTERCEPT_LIST, REDIRECT_LIST]
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return
      const changedKeys = new Set(Object.keys(changes))
      if (
        legacyConfigKeys.some((key) => changedKeys.has(key)) &&
        getStorage(V3_CONFIG, null) === null
      ) {
        const currentState = {
          [GLOBAL_SWITCH]: getStorage(GLOBAL_SWITCH, false),
          [MODE]: getStorage(MODE, 'interceptor'),
          [INTERCEPT_LIST]: getStorage(INTERCEPT_LIST, []),
          [REDIRECT_LIST]: getStorage(REDIRECT_LIST, []),
        }
        noticeDocumentByContent(NOTICE_KEY_REFRESH_GLOBAL_STATE, currentState)
      }
      if (changedKeys.has(V3_CONFIG)) {
        const runtimeV3Config = getRuntimeV3Config(getStorage(V3_CONFIG, null))
        updateV3FunctionSandbox(runtimeV3Config)
        noticeDocumentByContent(NoticeKey.V3_CONFIG, runtimeV3Config)
        if (getStorage(V3_CONFIG, null) === null) {
          noticeDocumentByContent(
            NOTICE_KEY_REFRESH_GLOBAL_STATE,
            getLegacyRuntimeState(getStorageSnapshot())
          )
        }
      }
      if (changedKeys.has(StorageKey.V3_DIAGNOSTICS_ARMED)) {
        noticeDocumentByContent(
          NoticeKey.V3_DIAGNOSTICS_ARMED,
          getStorage(StorageKey.V3_DIAGNOSTICS_ARMED, false) === true
        )
      }
      if (changedKeys.has(StorageKey.V3_FETCH_OUTCOMES_ARMED)) {
        noticeDocumentByContent(
          NoticeKey.V3_FETCH_OUTCOMES_ARMED,
          getStorage(StorageKey.V3_FETCH_OUTCOMES_ARMED, false) === true
        )
      }
    })

    // 发送当前tab页 title
    noticeServiceWorkerByContent(INIT_CURRENT_TITLE, window.document.title)

    // document.js 由 manifest 在主世界、document_start 阶段静态注入。
    // 主世界需要看到规则才能代理页面请求，因此同步内容仍按不可信页面输入处理。
    const data = getStorageSnapshot()
    const legacyRuntimeState = getLegacyRuntimeState(data)
    if (legacyRuntimeState[StorageKey.GLOBAL_SWITCH] && data[StorageKey.V3_CONFIG] == null) {
      noticeDocumentByContent(NOTICE_KEY_REFRESH_GLOBAL_STATE, legacyRuntimeState)
    }
    // V3 uses its own storage schema. Historical keys are neither converted nor removed.
    const initialV3Config = getRuntimeV3Config(data[StorageKey.V3_CONFIG] ?? null)
    updateV3FunctionSandbox(initialV3Config)
    noticeDocumentByContent(NoticeKey.V3_CONFIG, initialV3Config)
    noticeDocumentByContent(
      NoticeKey.V3_DIAGNOSTICS_ARMED,
      data[StorageKey.V3_DIAGNOSTICS_ARMED] === true
    )
    noticeDocumentByContent(
      NoticeKey.V3_FETCH_OUTCOMES_ARMED,
      data[StorageKey.V3_FETCH_OUTCOMES_ARMED] === true
    )

    // 长链接通信接收 service-worker -> document。BFCache 恢复后只重建一次连接；
    // 其他断开不自动重试，避免后台不可用时形成重连循环。
    let serviceWorkerPort: chrome.runtime.Port | undefined
    const connectToServiceWorker = () => {
      if (serviceWorkerPort) return
      const port = chrome.runtime.connect({ name: CONNECT_NAME })
      serviceWorkerPort = port
      port.onDisconnect.addListener(() => {
        // Chrome 在页面进入 BFCache 时会关闭端口，并通过 lastError 报告原因。
        // 读取该属性即可消费 runtime.lastError，避免控制台出现 unchecked 错误。
        void chrome.runtime.lastError
        if (serviceWorkerPort === port) serviceWorkerPort = undefined
      })
    }
    connectToServiceWorker()
    window.addEventListener('pageshow', (event) => {
      if (!event.persisted) return
      // 若旧端口的 disconnect 事件尚未派发，也先丢弃它再建立恢复后的连接。
      const stalePort = serviceWorkerPort
      serviceWorkerPort = undefined
      stalePort?.disconnect()
      connectToServiceWorker()
    })
    // 接收lib 传来的信息 转发给 service-worker
    // 没有from 属性
    window.addEventListener(
      NoticeTo.CONTENT,
      function (event) {
        const customEvent = event as CustomEvent
        // 页面主世界事件可被网页脚本伪造，因此只将符合命中统计结构的数据转发。
        if (isPageBadgeHit(customEvent.detail)) {
          noticeServiceWorkerByContent(NoticeKey.BADGE_STATUS, customEvent.detail)
        } else if (isV3Hit(customEvent.detail)) {
          noticeServiceWorkerByContent(NoticeKey.V3_HIT, customEvent.detail)
        } else if (isV3FunctionError(customEvent.detail)) {
          noticeServiceWorkerByContent(NoticeKey.V3_FUNCTION_ERROR, customEvent.detail)
        } else if (isV3NoMatch(customEvent.detail)) {
          noticeServiceWorkerByContent(NoticeKey.V3_NO_MATCH, customEvent.detail)
        } else if (isV3FetchOutcome(customEvent.detail) || isV3XHROutcome(customEvent.detail)) {
          noticeServiceWorkerByContent(NoticeKey.V3_FETCH_OUTCOME, customEvent.detail)
        }
      },
      false
    )
  })
  .catch((error) => {
    console.error('[AjaxProxy] Content storage initialization failed', error)
  })
