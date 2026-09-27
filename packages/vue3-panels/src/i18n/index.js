import { createI18n } from 'vue-i18n'
import { messages } from './messages.js'

export const localeStorageKey = 'ajax-proxy-v3-locale'
export const supportedLocales = [
  { code: 'zh-CN', label: '简体中文', shortLabel: '中' },
  { code: 'en', label: 'English', shortLabel: 'EN' },
]

const supportedLocaleCodes = new Set(supportedLocales.map(({ code }) => code))
const defaultLocale = supportedLocales[0].code

export function getInitialLocale(storage) {
  try {
    const preference = storage ?? globalThis.localStorage
    const preferredLocale = preference?.getItem(localeStorageKey)
    return supportedLocaleCodes.has(preferredLocale) ? preferredLocale : defaultLocale
  } catch {
    return defaultLocale
  }
}

export const i18n = createI18n({
  legacy: false,
  locale: getInitialLocale(),
  fallbackLocale: 'en',
  messages,
})
