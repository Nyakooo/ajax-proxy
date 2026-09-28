export const V3_RESPONSE_FUNCTION_MAX_LENGTH = 65_536

/** Validate only the editor's storage limits; user code is never parsed or executed here. */
export function validateFunctionResponseDraft(code) {
  if (typeof code !== 'string' || !code.trim()) {
    return { ok: false, error: 'empty-code' }
  }
  if (code.length > V3_RESPONSE_FUNCTION_MAX_LENGTH) {
    return { ok: false, error: 'code-too-long' }
  }
  return { ok: true, code }
}
