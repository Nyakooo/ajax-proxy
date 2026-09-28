import { describe, expect, it } from 'vitest'
import { isV3FunctionError, V3FunctionErrorCode } from '../src'

const validError = {
  rule_id: 'rule-1',
  match_url: 'https://example.test/api/*',
  method: 'POST',
  action: 'response' as const,
  code: V3FunctionErrorCode.EXECUTION_FAILED,
}

describe('V3 function error guard', () => {
  it('accepts each enumerated code with the exact safe metadata shape', () => {
    for (const code of Object.values(V3FunctionErrorCode)) {
      expect(isV3FunctionError({ ...validError, code })).toBe(true)
    }
  })

  it('rejects missing, additional, and sensitive fields', () => {
    const missingAction: Record<string, unknown> = { ...validError }
    delete missingAction.action
    expect(isV3FunctionError(missingAction)).toBe(false)
    expect(isV3FunctionError({ ...validError, url: 'https://example.test/?secret=1' })).toBe(false)
    expect(isV3FunctionError({ ...validError, error: 'private exception text' })).toBe(false)
    expect(isV3FunctionError({ ...validError, body: { secret: true } })).toBe(false)
    expect(isV3FunctionError({ ...validError, rule_id: undefined })).toBe(false)
  })

  it('enforces field bounds and formats', () => {
    expect(isV3FunctionError({ ...validError, rule_id: '' })).toBe(false)
    expect(isV3FunctionError({ ...validError, rule_id: 'r'.repeat(257) })).toBe(false)
    expect(isV3FunctionError({ ...validError, match_url: '' })).toBe(false)
    expect(isV3FunctionError({ ...validError, match_url: 'x'.repeat(4097) })).toBe(false)
    expect(isV3FunctionError({ ...validError, method: 'post' })).toBe(false)
    expect(isV3FunctionError({ ...validError, method: 'A'.repeat(17) })).toBe(false)
    expect(isV3FunctionError({ ...validError, action: 'request' })).toBe(false)
    expect(isV3FunctionError({ ...validError, action: '' })).toBe(false)
    expect(isV3FunctionError({ ...validError, code: 'unknown' })).toBe(false)
  })

  it('requires a plain object and rejects hostile proxies', () => {
    class ErrorMessage {
      rule_id = validError.rule_id
      match_url = validError.match_url
      method = validError.method
      code = validError.code
    }
    expect(isV3FunctionError(null)).toBe(false)
    expect(isV3FunctionError([])).toBe(false)
    expect(isV3FunctionError(new ErrorMessage())).toBe(false)
    expect(
      isV3FunctionError(
        new Proxy(
          {},
          {
            getPrototypeOf: () => {
              throw new Error('blocked')
            },
          }
        )
      )
    ).toBe(false)
  })
})
