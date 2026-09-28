import { describe, expect, it } from 'vitest'
import { isV3OriginDisabled, normalizeV3Origin } from '../src/siteSettings'

describe('V3 site settings', () => {
  it('normalizes HTTP(S) URLs to origins and checks disabled origins exactly', () => {
    expect(normalizeV3Origin('https://Example.com:443/path?q=1')).toBe('https://example.com')
    expect(normalizeV3Origin('http://localhost:8080/a')).toBe('http://localhost:8080')
    expect(normalizeV3Origin('file:///tmp/data')).toBeNull()
    expect(normalizeV3Origin('not a URL')).toBeNull()
    expect(normalizeV3Origin(null)).toBeNull()
    expect(isV3OriginDisabled('https://example.com/a', ['https://example.com'])).toBe(true)
    expect(isV3OriginDisabled('https://sub.example.com', ['https://example.com'])).toBe(false)
    expect(isV3OriginDisabled('http://example.com', ['https://example.com'])).toBe(false)
  })
})
