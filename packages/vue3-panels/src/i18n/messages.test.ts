import { describe, expect, it } from 'vitest'
import { messages } from './messages.js'

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
    expect(Object.keys(messages).sort()).toEqual(['en', 'zh-CN'])

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
})
