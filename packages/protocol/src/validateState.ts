import { RE2JS } from 're2js'

const REQUEST_METHODS = new Set(['ANY', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH'])
const MAX_RULES = 1000
const MAX_REGEX_RULES = 100
const MAX_MATCH_URL_LENGTH = 4096
const MAX_REDIRECT_URL_LENGTH = 4096
const MAX_REMARK_LENGTH = 512
const MAX_FUNCTION_LENGTH = 65536
const MAX_BODY_LENGTH = 5 * 1024 * 1024
const MAX_HEADERS = 100
const MAX_HEADER_NAME_LENGTH = 256
const MAX_HEADER_VALUE_LENGTH = 8192
const MAX_HEADER_BYTES = 32768

function isHttpToken(value: string) {
  return /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(value)
}

function isHeaderValue(value: string) {
  // eslint-disable-next-line no-control-regex
  return !/[\r\n\0-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(value)
}

export function isValidRegexPattern(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_MATCH_URL_LENGTH)
    return false
  try {
    RE2JS.compile(value, RE2JS.CASE_INSENSITIVE)
    return true
  } catch {
    return false
  }
}

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
    (value.remark === undefined ||
      (typeof value.remark === 'string' && value.remark.length <= MAX_REMARK_LENGTH))
  )
}

function hasValidRuleCount(value: unknown[], regexField: 'match_url' | 'domain') {
  if (value.length > MAX_RULES) return false
  let regexRules = 0
  for (const rule of value) {
    if (isRecord(rule) && rule.filter_type === 'regex') {
      regexRules += 1
      if (!isValidRegexPattern(rule[regexField])) return false
    }
  }
  return regexRules <= MAX_REGEX_RULES
}

function isValidHeaders(value: unknown) {
  if (!Array.isArray(value) || value.length > MAX_HEADERS) return false
  const encoder = new TextEncoder()
  let totalBytes = 0
  for (const header of value) {
    if (!isRecord(header) || typeof header.key !== 'string' || typeof header.value !== 'string')
      return false
    if (
      header.key.length === 0 ||
      header.key.length > MAX_HEADER_NAME_LENGTH ||
      !isHttpToken(header.key) ||
      header.value.length > MAX_HEADER_VALUE_LENGTH ||
      !isHeaderValue(header.value) ||
      (header.description !== undefined &&
        (typeof header.description !== 'string' || header.description.length > MAX_REMARK_LENGTH))
    ) {
      return false
    }
    totalBytes += encoder.encode(header.key).length + encoder.encode(header.value).length
    if (totalBytes > MAX_HEADER_BYTES) return false
  }
  return true
}

function isValidStatusCode(value: unknown) {
  const status =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isInteger(status) && status >= 200 && status <= 599
}

export function isValidInterceptors(value: unknown): value is Record<string, unknown>[] {
  return (
    Array.isArray(value) &&
    hasValidRuleCount(value, 'match_url') &&
    value.every((rule) => {
      if (!isRecord(rule) || !hasValidCommonFields(rule)) return false
      return (
        typeof rule.match_url === 'string' &&
        rule.match_url.trim() !== '' &&
        rule.match_url.length <= MAX_MATCH_URL_LENGTH &&
        (rule.filter_type !== 'regex' || isValidRegexPattern(rule.match_url)) &&
        (rule.override === undefined ||
          (typeof rule.override === 'string' && rule.override.length <= MAX_BODY_LENGTH)) &&
        (rule.hit === undefined ||
          (typeof rule.hit === 'number' && Number.isFinite(rule.hit) && rule.hit >= 0)) &&
        (rule.status_code === undefined || isValidStatusCode(rule.status_code)) &&
        (rule.override_type === undefined ||
          rule.override_type === 'json' ||
          rule.override_type === 'function') &&
        (rule.override_func === undefined ||
          (typeof rule.override_func === 'string' &&
            rule.override_func.length <= MAX_FUNCTION_LENGTH))
      )
    })
  )
}

export function isValidRedirectors(value: unknown): value is Record<string, unknown>[] {
  return (
    Array.isArray(value) &&
    hasValidRuleCount(value, 'domain') &&
    value.every((rule) => {
      if (!isRecord(rule) || !hasValidCommonFields(rule)) return false
      const validHeaders = rule.headers === undefined || isValidHeaders(rule.headers)
      const validIgnores =
        rule.ignores === undefined ||
        (Array.isArray(rule.ignores) &&
          rule.ignores.length <= 100 &&
          rule.ignores.every(
            (ignore) => typeof ignore === 'string' && ignore.length <= MAX_MATCH_URL_LENGTH
          ))
      return (
        typeof rule.domain === 'string' &&
        rule.domain.trim() !== '' &&
        rule.domain.length <= MAX_REDIRECT_URL_LENGTH &&
        typeof rule.redirect_url === 'string' &&
        rule.redirect_url.trim() !== '' &&
        rule.redirect_url.length <= MAX_REDIRECT_URL_LENGTH &&
        (rule.filter_type !== 'regex' || isValidRegexPattern(rule.domain)) &&
        validHeaders &&
        validIgnores &&
        (rule.redirect_type === undefined ||
          rule.redirect_type === 'text' ||
          rule.redirect_type === 'function') &&
        (rule.redirect_func === undefined ||
          (typeof rule.redirect_func === 'string' &&
            rule.redirect_func.length <= MAX_FUNCTION_LENGTH))
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
