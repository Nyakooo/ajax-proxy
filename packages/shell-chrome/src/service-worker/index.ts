// console.log("Ajax proxy service_worker.js")

import {
  NoticeFrom,
  NoticeTo,
  NoticeKey,
  isV3PanelMessage,
  StorageKey,
  initStorage,
  noticePanelsByServiceWorker,
  isMessageRecord,
  isValidInterceptors,
  isValidMode,
  isValidRedirectors,
} from '@proxy/shared-utils'
import {
  isV3FetchOutcome,
  isV3FunctionError,
  isV3Hit,
  isV3NoMatch,
  isV3XHROutcome,
} from '@proxy/protocol'
import { injectEventListener } from './event'
import { useCurrentTitle } from './notice'
import { initDefaultSth } from './init'
import { chromeBadge } from './badge'
import { chromeBadgeV3 } from './v3Hit'
import { notifyV3FunctionError } from './v3FunctionError'
import { notifyV3NoMatch } from './v3NoMatch'
import { notifyV3FetchOutcome } from './v3FetchOutcome'
import { notifyV3XHROutcome } from './v3XHROutcome'
import { createV3PanelStartupMessageHandler } from './v3Panel'
import { INIT_CURRENT_TITLE } from '../consts'
import { isPageBadgeHit } from '../messageValidation'

const storageReady = initStorage()
const handleV3PanelStartupMessage = createV3PanelStartupMessageHandler({
  extensionId: chrome.runtime.id,
  extensionUrl: chrome.runtime.getURL(''),
  storageReady,
})
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  return handleV3PanelStartupMessage(msg, sender, sendResponse)
})

// Manifest V3 service worker events must be registered during initial script evaluation.
injectEventListener()

storageReady
  .then(() => {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && (changes[StorageKey.V3_CONFIG] || changes[StorageKey.V3_HITS])) {
        chromeBadge()
      }
    })
    // 接收content 和 panels 传来的信息
    chrome.runtime.onMessage.addListener((msg, sender) => {
      if (
        !isMessageRecord(msg) ||
        sender.id !== chrome.runtime.id ||
        msg.to !== NoticeTo.SERVICE_WORKER
      )
        return
      // V3 panel requests are handled by the synchronous startup listener above.
      if (isV3PanelMessage(msg)) return
      const { from, key, value } = msg
      const isContentSender = Boolean(sender.tab)
      const isPanelSender =
        typeof sender.url === 'string' && sender.url.startsWith(chrome.runtime.getURL(''))

      if (from === NoticeFrom.CONTENT && isContentSender) {
        if (key === INIT_CURRENT_TITLE && typeof value === 'string' && value.length <= 8192) {
          noticePanelsByServiceWorker(NoticeKey.GET_CURRENT_TITLE, value)
          return
        }
        if (key === NoticeKey.BADGE_STATUS && isPageBadgeHit(value)) chromeBadge(value)
        if (key === NoticeKey.V3_HIT && isV3Hit(value)) chromeBadgeV3(value)
        if (key === NoticeKey.V3_FUNCTION_ERROR && isV3FunctionError(value)) {
          void notifyV3FunctionError(value).catch(() => {})
        }
        if (key === NoticeKey.V3_NO_MATCH && isV3NoMatch(value)) {
          void notifyV3NoMatch(value).catch(() => {})
        }
        if (key === NoticeKey.V3_FETCH_OUTCOME && isV3FetchOutcome(value)) {
          void notifyV3FetchOutcome(value).catch(() => {})
        }
        if (key === NoticeKey.V3_FETCH_OUTCOME && isV3XHROutcome(value)) {
          void notifyV3XHROutcome(value).catch(() => {})
        }
        return
      }

      if (from !== NoticeFrom.PANELS || !isPanelSender) return
      if (key === NoticeKey.BADGE_STATUS && value === null) {
        // 面板清空统计后重新计算总徽章。
        chromeBadge()
      } else if (key === NoticeKey.GLOBAL_SWITCH && typeof value === 'boolean') {
        chrome.action.setIcon({ path: value ? 'icons/128.png' : 'icons/128g.png' })
        chromeBadge()
      } else if (key === NoticeKey.MODE && isValidMode(value)) {
        chromeBadge()
      } else if (key === NoticeKey.INTERCEPT_LIST && isValidInterceptors(value)) {
        chromeBadge()
      } else if (key === NoticeKey.REDIRECT_LIST && isValidRedirectors(value)) {
        chromeBadge()
      } else if (key === NoticeKey.GET_CURRENT_TITLE && value === undefined) {
        const title = useCurrentTitle()
        noticePanelsByServiceWorker(NoticeKey.GET_CURRENT_TITLE, title)
      }
    })

    // 设置默认项
    initDefaultSth()
  })
  .catch((error) => {
    console.error('[AjaxProxy] Service worker storage initialization failed', error)
  })
