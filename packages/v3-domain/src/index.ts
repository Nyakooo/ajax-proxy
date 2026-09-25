export const V3_BACKUP_FORMAT = 'ajax-proxy-backup' as const
export const V3_BACKUP_VERSION = 3 as const
export const V3_BACKUP_MAX_BYTES = 5 * 1024 * 1024

const MAX_RULES = 5000
const MAX_TAGS = 500
const MAX_ID_LENGTH = 256
const MAX_LABEL_LENGTH = 512
const MAX_MATCH_URL_LENGTH = 4096
const MAX_REDIRECT_URL_LENGTH = 4096
const MAX_METHOD_LENGTH = 32
const MAX_HEADERS = 100
const MAX_HEADER_NAME_LENGTH = 256
const MAX_HEADER_VALUE_LENGTH = 8192
const MAX_HEADER_BYTES = 32768
const MAX_FUNCTION_CODE_LENGTH = 65536
const MAX_JSON_DEPTH = 64
const MAX_JSON_NODES = 50000

export type V3Mode = 'interceptor' | 'redirector'
export type V3Language = 'zh-CN' | 'en'
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export interface V3Tag {
  id: string
  name: string
  used: boolean
}

export interface V3Rule {
  id: string
  enabled: boolean
  match: {
    url: string
    method?: string
    type?: 'normal' | 'regex'
  }
  request?: {
    enabled: boolean
    redirect: { url: string }
  }
  response?: {
    enabled: boolean
    replace: {
      status?: number
      headers?: Record<string, string>
      body?: JsonValue
      code?: string
    }
  }
}

export interface V3Backup {
  format: typeof V3_BACKUP_FORMAT
  formatVersion: typeof V3_BACKUP_VERSION
  settings: {
    globalEnabled: boolean
    mode: V3Mode
    language: V3Language
  }
  tags: V3Tag[]
  rules: V3Rule[]
}

export interface V3ValidationIssue {
  path: string
  message: string
}

export type V3BackupValidation =
  { ok: true; data: V3Backup } | { ok: false; issues: V3ValidationIssue[] }

export type V3BackupParseResult =
  | { ok: true; data: V3Backup; warnings: V3ValidationIssue[] }
  | { ok: false; issues: V3ValidationIssue[] }

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]) {
  return Object.keys(value).every((key) => allowed.includes(key))
}

function isJsonValue(value: unknown): value is JsonValue {
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }]
  let nodes = 0
  while (pending.length > 0) {
    const current = pending.pop()!
    nodes += 1
    if (nodes > MAX_JSON_NODES || current.depth > MAX_JSON_DEPTH) return false
    if (
      current.value === null ||
      typeof current.value === 'string' ||
      typeof current.value === 'boolean'
    )
      continue
    if (typeof current.value === 'number') {
      if (!Number.isFinite(current.value)) return false
      continue
    }
    if (Array.isArray(current.value)) {
      for (const item of current.value) pending.push({ value: item, depth: current.depth + 1 })
      continue
    }
    if (!isObject(current.value)) return false
    for (const item of Object.values(current.value))
      pending.push({ value: item, depth: current.depth + 1 })
  }
  return true
}

function isHttpToken(value: string) {
  return /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(value)
}

function isHeaderValue(value: string) {
  // eslint-disable-next-line no-control-regex
  return !/[\r\n\0-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(value)
}

function validateHeaders(value: unknown, path: string, issues: V3ValidationIssue[]) {
  if (!isObject(value)) {
    addIssue(issues, path, 'Expected a header map.')
    return
  }
  const entries = Object.entries(value)
  if (entries.length > MAX_HEADERS) {
    addIssue(issues, path, `At most ${MAX_HEADERS} headers are allowed.`)
  }
  let totalBytes = 0
  entries.forEach(([name, headerValue]) => {
    totalBytes += new TextEncoder().encode(name).length
    if (typeof headerValue === 'string') totalBytes += new TextEncoder().encode(headerValue).length
    if (name.length === 0 || name.length > MAX_HEADER_NAME_LENGTH || !isHttpToken(name)) {
      addIssue(
        issues,
        path,
        `Header names must be valid HTTP tokens up to ${MAX_HEADER_NAME_LENGTH} characters.`
      )
    }
    if (
      typeof headerValue !== 'string' ||
      headerValue.length > MAX_HEADER_VALUE_LENGTH ||
      !isHeaderValue(headerValue)
    ) {
      addIssue(
        issues,
        path,
        `Header values must be safe strings up to ${MAX_HEADER_VALUE_LENGTH} characters.`
      )
    }
  })
  if (totalBytes > MAX_HEADER_BYTES) {
    addIssue(issues, path, `Combined header data must not exceed ${MAX_HEADER_BYTES} UTF-8 bytes.`)
  }
}

function addIssue(issues: V3ValidationIssue[], path: string, message: string) {
  issues.push({ path, message })
}

function validateRule(value: unknown, index: number, issues: V3ValidationIssue[]) {
  const path = `rules[${index}]`
  if (!isObject(value)) {
    addIssue(issues, path, 'Expected a rule object.')
    return
  }
  if (!hasOnlyKeys(value, ['id', 'enabled', 'match', 'request', 'response'])) {
    addIssue(issues, path, 'Rule contains an unsupported field.')
  }
  if (typeof value.id !== 'string' || value.id.trim() === '' || value.id.length > MAX_ID_LENGTH)
    addIssue(issues, `${path}.id`, `Expected a non-empty string up to ${MAX_ID_LENGTH} characters.`)
  if (typeof value.enabled !== 'boolean') addIssue(issues, `${path}.enabled`, 'Expected a boolean.')
  if (!isObject(value.match) || !hasOnlyKeys(value.match, ['url', 'method', 'type'])) {
    addIssue(issues, `${path}.match`, 'Expected a URL matcher with supported fields only.')
  } else {
    if (
      typeof value.match.url !== 'string' ||
      value.match.url.trim() === '' ||
      value.match.url.length > MAX_MATCH_URL_LENGTH
    ) {
      addIssue(
        issues,
        `${path}.match.url`,
        `Expected a non-empty string up to ${MAX_MATCH_URL_LENGTH} characters.`
      )
    }
    if (
      value.match.method !== undefined &&
      (typeof value.match.method !== 'string' ||
        value.match.method.length > MAX_METHOD_LENGTH ||
        !isHttpToken(value.match.method))
    ) {
      addIssue(
        issues,
        `${path}.match.method`,
        `Expected an HTTP method token up to ${MAX_METHOD_LENGTH} characters.`
      )
    }
    if (
      value.match.type !== undefined &&
      value.match.type !== 'normal' &&
      value.match.type !== 'regex'
    ) {
      addIssue(issues, `${path}.match.type`, 'Expected "normal" or "regex".')
    }
    if (value.match.type === 'regex' && typeof value.match.url === 'string') {
      try {
        new RegExp(value.match.url, 'i')
      } catch {
        addIssue(issues, `${path}.match.url`, 'Expected a valid regular expression.')
      }
    }
  }

  for (const [actionName, payloadName, allowedActionKeys, allowedPayloadKeys] of [
    ['request', 'redirect', ['enabled', 'redirect'], ['url']],
    ['response', 'replace', ['enabled', 'replace'], ['status', 'headers', 'body', 'code']],
  ] as const) {
    const action = value[actionName]
    if (action === undefined) continue
    const actionPath = `${path}.${actionName}`
    if (!isObject(action) || !hasOnlyKeys(action, [...allowedActionKeys])) {
      addIssue(issues, actionPath, 'Expected an action object with supported fields only.')
      continue
    }
    if (typeof action.enabled !== 'boolean')
      addIssue(issues, `${actionPath}.enabled`, 'Expected a boolean.')
    const payload = action[payloadName]
    const payloadPath = `${actionPath}.${payloadName}`
    if (!isObject(payload) || !hasOnlyKeys(payload, [...allowedPayloadKeys])) {
      addIssue(issues, payloadPath, 'Expected an action payload with supported fields only.')
      continue
    }
    if (actionName === 'request') {
      if (
        typeof payload.url !== 'string' ||
        payload.url.trim() === '' ||
        payload.url.length > MAX_REDIRECT_URL_LENGTH
      ) {
        addIssue(
          issues,
          `${payloadPath}.url`,
          `Expected a non-empty URL up to ${MAX_REDIRECT_URL_LENGTH} characters.`
        )
      } else {
        try {
          const target = new URL(payload.url, 'https://ajax-proxy.invalid/')
          if (!['http:', 'https:'].includes(target.protocol)) {
            addIssue(issues, `${payloadPath}.url`, 'Only HTTP(S) redirect URLs are allowed.')
          }
        } catch {
          addIssue(issues, `${payloadPath}.url`, 'Expected a valid HTTP(S) or relative URL.')
        }
      }
      continue
    }
    if (
      payload.status !== undefined &&
      (!Number.isInteger(payload.status) ||
        (payload.status as number) < 200 ||
        (payload.status as number) > 599)
    ) {
      addIssue(issues, `${payloadPath}.status`, 'Expected an integer from 200 to 599.')
    }
    if (payload.headers !== undefined)
      validateHeaders(payload.headers, `${payloadPath}.headers`, issues)
    if (payload.body !== undefined && !isJsonValue(payload.body)) {
      addIssue(issues, `${payloadPath}.body`, 'Expected a JSON value.')
    }
    if (
      payload.code !== undefined &&
      (typeof payload.code !== 'string' || payload.code.length > MAX_FUNCTION_CODE_LENGTH)
    ) {
      addIssue(
        issues,
        `${payloadPath}.code`,
        `Expected a string up to ${MAX_FUNCTION_CODE_LENGTH} characters.`
      )
    }
  }

  if (value.request === undefined && value.response === undefined) {
    addIssue(issues, path, 'A rule must define a request or response action.')
  }
}

export function validateV3Backup(value: unknown): V3BackupValidation {
  const issues: V3ValidationIssue[] = []
  if (!isObject(value))
    return { ok: false, issues: [{ path: '$', message: 'Expected a backup object.' }] }
  if (value.format !== V3_BACKUP_FORMAT) {
    const looksLikeV2 = 'proxy_routes' in value || 'redirect' in value || 'globalSwitchOn' in value
    return {
      ok: false,
      issues: [
        {
          path: 'format',
          message: looksLikeV2
            ? 'V2 backup files are not supported. Export a V3 backup instead.'
            : `Expected format "${V3_BACKUP_FORMAT}".`,
        },
      ],
    }
  }
  if (!hasOnlyKeys(value, ['format', 'formatVersion', 'settings', 'tags', 'rules'])) {
    addIssue(issues, '$', 'Backup contains an unsupported field.')
  }
  if (value.formatVersion !== V3_BACKUP_VERSION) {
    addIssue(issues, 'formatVersion', `Expected version ${V3_BACKUP_VERSION}.`)
  }
  if (
    !isObject(value.settings) ||
    !hasOnlyKeys(value.settings, ['globalEnabled', 'mode', 'language'])
  ) {
    addIssue(issues, 'settings', 'Expected settings with supported fields only.')
  } else {
    if (typeof value.settings.globalEnabled !== 'boolean') {
      addIssue(issues, 'settings.globalEnabled', 'Expected a boolean.')
    }
    if (value.settings.mode !== 'interceptor' && value.settings.mode !== 'redirector') {
      addIssue(issues, 'settings.mode', 'Expected "interceptor" or "redirector".')
    }
    if (value.settings.language !== 'zh-CN' && value.settings.language !== 'en') {
      addIssue(issues, 'settings.language', 'Expected "zh-CN" or "en".')
    }
  }
  if (!Array.isArray(value.tags)) {
    addIssue(issues, 'tags', 'Expected an array.')
  } else {
    if (value.tags.length > MAX_TAGS)
      addIssue(issues, 'tags', `At most ${MAX_TAGS} tags are allowed.`)
    const ids = new Set<string>()
    value.tags.forEach((tag, index) => {
      const path = `tags[${index}]`
      if (!isObject(tag) || !hasOnlyKeys(tag, ['id', 'name', 'used'])) {
        addIssue(issues, path, 'Expected a tag object with supported fields only.')
        return
      }
      if (typeof tag.id !== 'string' || tag.id.trim() === '' || tag.id.length > MAX_ID_LENGTH)
        addIssue(
          issues,
          `${path}.id`,
          `Expected a non-empty string up to ${MAX_ID_LENGTH} characters.`
        )
      else if (ids.has(tag.id)) addIssue(issues, `${path}.id`, 'Tag IDs must be unique.')
      else ids.add(tag.id)
      if (
        typeof tag.name !== 'string' ||
        tag.name.trim() === '' ||
        tag.name.length > MAX_LABEL_LENGTH
      )
        addIssue(
          issues,
          `${path}.name`,
          `Expected a non-empty string up to ${MAX_LABEL_LENGTH} characters.`
        )
      if (typeof tag.used !== 'boolean') addIssue(issues, `${path}.used`, 'Expected a boolean.')
    })
  }
  if (!Array.isArray(value.rules)) {
    addIssue(
      issues,
      'rules',
      'Expected an array. Empty arrays are valid and clear the stored rules.'
    )
  } else {
    if (value.rules.length > MAX_RULES)
      addIssue(issues, 'rules', `At most ${MAX_RULES} rules are allowed.`)
    const ids = new Set<string>()
    value.rules.forEach((rule, index) => {
      validateRule(rule, index, issues)
      if (isObject(rule) && typeof rule.id === 'string') {
        if (ids.has(rule.id)) addIssue(issues, `rules[${index}].id`, 'Rule IDs must be unique.')
        ids.add(rule.id)
      }
    })
  }
  return issues.length === 0
    ? { ok: true, data: value as unknown as V3Backup }
    : { ok: false, issues }
}

export function parseV3BackupJson(text: string): V3BackupParseResult {
  if (text.length > V3_BACKUP_MAX_BYTES) {
    return {
      ok: false,
      issues: [
        { path: '$', message: `Backup JSON must not exceed ${V3_BACKUP_MAX_BYTES} UTF-8 bytes.` },
      ],
    }
  }
  if (new TextEncoder().encode(text).length > V3_BACKUP_MAX_BYTES) {
    return {
      ok: false,
      issues: [
        { path: '$', message: `Backup JSON must not exceed ${V3_BACKUP_MAX_BYTES} UTF-8 bytes.` },
      ],
    }
  }
  let value: unknown
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, issues: [{ path: '$', message: `Invalid JSON: ${message}` }] }
  }
  const validation = validateV3Backup(value)
  if (!validation.ok) return validation

  const data = JSON.parse(JSON.stringify(validation.data)) as V3Backup
  const warnings: V3ValidationIssue[] = []
  data.rules.forEach((rule, index) => {
    const code = rule.response?.replace.code
    if (typeof code !== 'string' || code.trim() === '') return
    warnings.push({
      path: `rules[${index}].response.replace.code`,
      message: 'Imported function code is untrusted and will not run until explicitly enabled.',
    })
    if (rule.response?.enabled) rule.response.enabled = false
  })
  return { ok: true, data, warnings }
}

export function formatV3ValidationIssues(issues: V3ValidationIssue[]) {
  return issues.map(({ path, message }) => `${path}: ${message}`)
}
