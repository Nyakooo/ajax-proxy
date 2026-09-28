import { describe, expect, it } from 'vitest'
import { messages } from './messages.js'
import { getInitialLocale, localeStorageKey, supportedLocales } from './index.js'

function collectStrings(value: unknown, path = ''): Map<string, string> {
  const result = new Map<string, string>()

  if (typeof value === 'string') {
    result.set(path, value)
    return result
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid message value at ${path || '<root>'}`)
  }

  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key
    for (const [messagePath, message] of collectStrings(child, childPath)) {
      result.set(messagePath, message)
    }
  }

  return result
}

function placeholders(message: string): string[] {
  return [...message.matchAll(/\{([\w.]+)\}/g)].map((match) => match[1]).sort()
}

describe('V3 locale message catalogs', () => {
  it('contains only zh-CN and English with matching keys and interpolation parameters', () => {
    expect(supportedLocales).toEqual([
      { code: 'zh-CN', label: '简体中文', shortLabel: '中' },
      { code: 'en', label: 'English', shortLabel: 'EN' },
    ])
    expect(Object.keys(messages).sort()).toEqual(supportedLocales.map(({ code }) => code).sort())

    const chinese = collectStrings(messages['zh-CN'])
    const english = collectStrings(messages.en)
    const paths = [...chinese.keys()].sort()

    expect([...english.keys()].sort()).toEqual(paths)

    for (const path of paths) {
      const chineseMessage = chinese.get(path)!
      const englishMessage = english.get(path)!

      expect(chineseMessage.trim(), `${path} zh-CN`).not.toBe('')
      expect(englishMessage.trim(), `${path} en`).not.toBe('')
      expect(placeholders(englishMessage), `${path} interpolation`).toEqual(
        placeholders(chineseMessage)
      )
    }
  })

  it('defaults to zh-CN and restores only a supported English preference', () => {
    const stored = (value: string | null) => ({ getItem: () => value })

    expect(localeStorageKey).toBe('ajax-proxy-v3-locale')
    expect(getInitialLocale(stored('en'))).toBe('en')
    expect(getInitialLocale(stored('zh-CN'))).toBe('zh-CN')
    expect(getInitialLocale(stored(null))).toBe('zh-CN')
    expect(getInitialLocale(stored('fr'))).toBe('zh-CN')
    expect(
      getInitialLocale({
        getItem() {
          throw new Error('storage unavailable')
        },
      })
    ).toBe('zh-CN')
  })
})
