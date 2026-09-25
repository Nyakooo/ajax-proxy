import { describe, expect, it } from 'vitest'
import {
  V3_RESPONSE_FUNCTION_MAX_LENGTH,
  validateFunctionResponseDraft,
} from './v3FunctionResponseDraft.js'

describe('V3 response function drafts', () => {
  it('accepts a non-empty function body without compiling or executing it', () => {
    const code = 'return { body: { ok: true }, status: 201 }'
    expect(validateFunctionResponseDraft(code)).toEqual({ ok: true, code })
  })

  it('requires a function body', () => {
    expect(validateFunctionResponseDraft('  ')).toEqual({ ok: false, error: 'empty-code' })
  })

  it('accepts code at the 65,536-character limit', () => {
    const code = 'x'.repeat(V3_RESPONSE_FUNCTION_MAX_LENGTH)
    expect(validateFunctionResponseDraft(code)).toEqual({ ok: true, code })
  })

  it('rejects code above the 65,536-character limit', () => {
    expect(validateFunctionResponseDraft('x'.repeat(V3_RESPONSE_FUNCTION_MAX_LENGTH + 1))).toEqual({
      ok: false,
      error: 'code-too-long',
    })
  })
})
