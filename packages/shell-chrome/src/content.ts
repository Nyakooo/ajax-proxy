// console.log("Ajax proxy content.js")

import {
    initStorage,
    NoticeTo,
    NoticeKey,
    StorageKey,
    noticeDocumentByContent,
    noticeServiceWorkerByContent,
    getStorage,
    getStorageAll,
    setStorage,
    removeStorage,
} from "@proxy/shared-utils";
import { CONNECT_NAME, INIT_CURRENT_TITLE, NOTICE_KEY_REFRESH_GLOBAL_STATE } from "./consts";
import { onLoadForDataConversion } from "@proxy/v2-compatibility";
import { isPageBadgeHit } from "./messageValidation";
import { isV3FunctionError, isV3Hit } from '@proxy/protocol'

const V3_FUNCTION_SANDBOX_FRAME_ID = 'ajax-proxy-v3-function-sandbox'
const V3_FUNCTION_SANDBOX_PATH = 'v3-sandbox/sandbox.html'
let v3FunctionSandboxObserver: MutationObserver | undefined

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
            }
            return rule.enabled === true &&
                rule.response?.enabled === true &&
                typeof rule.response.replace?.code === 'string' &&
                rule.response.replace.code.trim() !== ''
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
        const current = document.getElementById(V3_FUNCTION_SANDBOX_FRAME_ID) as HTMLIFrameElement | null
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

initStorage().then(async () => {
    const { GLOBAL_SWITCH, MODE, INTERCEPT_LIST, REDIRECT_LIST, V3_CONFIG } = StorageKey
    const legacyConfigKeys = [GLOBAL_SWITCH, MODE, INTERCEPT_LIST, REDIRECT_LIST]
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return
        const changedKeys = new Set(Object.keys(changes))
        if (legacyConfigKeys.some(key => changedKeys.has(key))) {
            const currentState = {
                [GLOBAL_SWITCH]: getStorage(GLOBAL_SWITCH, false),
                [MODE]: getStorage(MODE, 'interceptor'),
                [INTERCEPT_LIST]: getStorage(INTERCEPT_LIST, []),
                [REDIRECT_LIST]: getStorage(REDIRECT_LIST, []),
            }
            noticeDocumentByContent(NOTICE_KEY_REFRESH_GLOBAL_STATE, currentState)
        }
        if (changedKeys.has(V3_CONFIG)) {
            const currentV3Config = getStorage(V3_CONFIG, null)
            updateV3FunctionSandbox(currentV3Config)
            noticeDocumentByContent(NoticeKey.V3_CONFIG, currentV3Config)
        }
    })

    // 发送当前tab页 title
    noticeServiceWorkerByContent(INIT_CURRENT_TITLE, window.document.title)

    // document.js 由 manifest 在主世界、document_start 阶段静态注入。
    // 主世界需要看到规则才能代理页面请求，因此同步内容仍按不可信页面输入处理。
    const data = await getStorageAll();
    // 新老数据转换
    const { changed, data: getData, changeKeywords } = onLoadForDataConversion(data)
    // 如果有老数据变更新数据，则需要在这里 setStorage
    if (changed) {
        setStorage(StorageKey.GLOBAL_SWITCH, getData.global_on)
        setStorage(StorageKey.MODE, getData.mode)
        setStorage(StorageKey.INTERCEPT_LIST, getData.interceptor_matching_content)
        setStorage(StorageKey.REDIRECT_LIST, getData.redirector_matching_content)
        // 需要清理对应旧数据，不然始终会进到当前判断条件中
        removeStorage(changeKeywords)
    }
    const getGlobalSwtich = getData[StorageKey.GLOBAL_SWITCH] || false
    if (getGlobalSwtich) noticeDocumentByContent(NOTICE_KEY_REFRESH_GLOBAL_STATE, getData)
    // V3 is stored independently from V2, and must also deliver a disabled
    // configuration so the MAIN-world runtime can keep it cached without mounting.
    const initialV3Config = getData[StorageKey.V3_CONFIG] ?? null
    updateV3FunctionSandbox(initialV3Config)
    noticeDocumentByContent(NoticeKey.V3_CONFIG, initialV3Config)

    // 长链接通信接收 service-worker -> document
    chrome.runtime.connect({ name: CONNECT_NAME });
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
            }
        },
        false
    );

}).catch(error => {
    console.error('[AjaxProxy] Content storage initialization failed', error)
})
