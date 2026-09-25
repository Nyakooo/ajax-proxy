// console.log("Ajax proxy service_worker.js")

import {
  NoticeFrom,
  NoticeTo,
  NoticeKey,
  StorageKey,
  initStorage,
  noticePanelsByServiceWorker,
  isMessageRecord,
  isValidInterceptors,
  isValidMode,
  isValidRedirectors,
} from '@proxy/shared-utils'
import { isV3Hit } from '@proxy/protocol'
import { injectEventListener } from './event'
import { useCurrentTitle } from './notice'
import { initDefaultSth } from './init'
import { chromeBadge } from './badge'
import { chromeBadgeV3 } from './v3Hit'
import { INIT_CURRENT_TITLE } from '../consts'
import { isPageBadgeHit } from '../messageValidation'

initStorage()
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
      const { from, key, value } = msg
      const isContentSender = Boolean(sender.tab)
      const isPanelSender =
        !sender.tab &&
        typeof sender.url === 'string' &&
        sender.url.startsWith(chrome.runtime.getURL(''))

      if (from === NoticeFrom.CONTENT && isContentSender) {
        if (key === INIT_CURRENT_TITLE && typeof value === 'string' && value.length <= 8192) {
          noticePanelsByServiceWorker(NoticeKey.GET_CURRENT_TITLE, value)
          return
        }
        if (key === NoticeKey.BADGE_STATUS && isPageBadgeHit(value)) chromeBadge(value)
        if (key === NoticeKey.V3_HIT && isV3Hit(value)) chromeBadgeV3(value)
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

    // 注册其他监听列表
    injectEventListener()
  })
  .catch((error) => {
    console.error('[AjaxProxy] Service worker storage initialization failed', error)
  })
