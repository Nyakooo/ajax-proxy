import { createI18n } from 'vue-i18n'
import { messages } from './messages.js'

export const localeStorageKey = 'ajax-proxy-v3-locale'

function getInitialLocale() {
  try {
    return localStorage.getItem(localeStorageKey) === 'en' ? 'en' : 'zh-CN'
  } catch {
    return 'zh-CN'
  }
}

export const i18n = createI18n({
  legacy: false,
  locale: getInitialLocale(),
  fallbackLocale: 'en',
  messages,
})
