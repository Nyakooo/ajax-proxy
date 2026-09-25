const REQUEST_METHODS = new Set(['ANY', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH'])

export function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function isValidMode(value: unknown): value is 'interceptor' | 'redirector' {
  return value === 'interceptor' || value === 'redirector'
}

function hasValidCommonFields(value: Record<string, unknown>) {
  return (
    typeof value.switch_on === 'boolean' &&
    (value.filter_type === undefined ||
      value.filter_type === 'normal' ||
      value.filter_type === 'regex') &&
    (value.method === undefined ||
      (typeof value.method === 'string' && REQUEST_METHODS.has(value.method))) &&
    (value.remark === undefined || typeof value.remark === 'string')
  )
}

function isValidStatusCode(value: unknown) {
  const status =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isInteger(status) && status >= 200 && status <= 599
}

export function isValidInterceptors(value: unknown): value is Record<string, unknown>[] {
  return (
    Array.isArray(value) &&
    value.every((rule) => {
      if (!isRecord(rule) || !hasValidCommonFields(rule)) return false
      return (
        typeof rule.match_url === 'string' &&
        rule.match_url.trim() !== '' &&
        (rule.override === undefined || typeof rule.override === 'string') &&
        (rule.hit === undefined ||
          (typeof rule.hit === 'number' && Number.isFinite(rule.hit) && rule.hit >= 0)) &&
        (rule.status_code === undefined || isValidStatusCode(rule.status_code)) &&
        (rule.override_type === undefined ||
          rule.override_type === 'json' ||
          rule.override_type === 'function') &&
        (rule.override_func === undefined || typeof rule.override_func === 'string')
      )
    })
  )
}

export function isValidRedirectors(value: unknown): value is Record<string, unknown>[] {
  return (
    Array.isArray(value) &&
    value.every((rule) => {
      if (!isRecord(rule) || !hasValidCommonFields(rule)) return false
      const validHeaders =
        rule.headers === undefined ||
        (Array.isArray(rule.headers) &&
          rule.headers.every(
            (header) =>
              isRecord(header) &&
              typeof header.key === 'string' &&
              typeof header.value === 'string' &&
              (header.description === undefined || typeof header.description === 'string')
          ))
      const validIgnores =
        rule.ignores === undefined ||
        (Array.isArray(rule.ignores) && rule.ignores.every((ignore) => typeof ignore === 'string'))
      return (
        typeof rule.domain === 'string' &&
        rule.domain.trim() !== '' &&
        typeof rule.redirect_url === 'string' &&
        rule.redirect_url.trim() !== '' &&
        validHeaders &&
        validIgnores &&
        (rule.redirect_type === undefined ||
          rule.redirect_type === 'text' ||
          rule.redirect_type === 'function') &&
        (rule.redirect_func === undefined || typeof rule.redirect_func === 'string')
      )
    })
  )
}

export function isValidGlobalState(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    typeof value.global_on === 'boolean' &&
    isValidMode(value.mode) &&
    isValidInterceptors(value.interceptor_matching_content) &&
    isValidRedirectors(value.redirector_matching_content)
  )
}
