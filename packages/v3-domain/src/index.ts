export const V3_BACKUP_FORMAT = 'ajax-proxy-backup' as const
export const V3_BACKUP_VERSION = 3 as const

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

export type V3BackupParseResult = V3BackupValidation

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]) {
  return Object.keys(value).every((key) => allowed.includes(key))
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJsonValue)
  if (!isObject(value)) return false
  return Object.values(value).every(isJsonValue)
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
  if (typeof value.id !== 'string' || value.id.trim() === '')
    addIssue(issues, `${path}.id`, 'Expected a non-empty string.')
  if (typeof value.enabled !== 'boolean') addIssue(issues, `${path}.enabled`, 'Expected a boolean.')
  if (!isObject(value.match) || !hasOnlyKeys(value.match, ['url', 'method', 'type'])) {
    addIssue(issues, `${path}.match`, 'Expected a URL matcher with supported fields only.')
  } else {
    if (typeof value.match.url !== 'string' || value.match.url.trim() === '') {
      addIssue(issues, `${path}.match.url`, 'Expected a non-empty string.')
    }
    if (value.match.method !== undefined && typeof value.match.method !== 'string') {
      addIssue(issues, `${path}.match.method`, 'Expected a string when provided.')
    }
    if (
      value.match.type !== undefined &&
      value.match.type !== 'normal' &&
      value.match.type !== 'regex'
    ) {
      addIssue(issues, `${path}.match.type`, 'Expected "normal" or "regex".')
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
      if (typeof payload.url !== 'string' || payload.url.trim() === '') {
        addIssue(issues, `${payloadPath}.url`, 'Expected a non-empty string.')
      }
      continue
    }
    if (
      payload.status !== undefined &&
      (!Number.isInteger(payload.status) ||
        (payload.status as number) < 100 ||
        (payload.status as number) > 599)
    ) {
      addIssue(issues, `${payloadPath}.status`, 'Expected an integer from 100 to 599.')
    }
    if (
      payload.headers !== undefined &&
      (!isObject(payload.headers) ||
        !Object.values(payload.headers).every((header) => typeof header === 'string'))
    ) {
      addIssue(issues, `${payloadPath}.headers`, 'Expected a string-valued header map.')
    }
    if (payload.body !== undefined && !isJsonValue(payload.body)) {
      addIssue(issues, `${payloadPath}.body`, 'Expected a JSON value.')
    }
    if (payload.code !== undefined && typeof payload.code !== 'string') {
      addIssue(issues, `${payloadPath}.code`, 'Expected a string when provided.')
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
    const ids = new Set<string>()
    value.tags.forEach((tag, index) => {
      const path = `tags[${index}]`
      if (!isObject(tag) || !hasOnlyKeys(tag, ['id', 'name', 'used'])) {
        addIssue(issues, path, 'Expected a tag object with supported fields only.')
        return
      }
      if (typeof tag.id !== 'string' || tag.id.trim() === '')
        addIssue(issues, `${path}.id`, 'Expected a non-empty string.')
      else if (ids.has(tag.id)) addIssue(issues, `${path}.id`, 'Tag IDs must be unique.')
      else ids.add(tag.id)
      if (typeof tag.name !== 'string' || tag.name.trim() === '')
        addIssue(issues, `${path}.name`, 'Expected a non-empty string.')
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
  let value: unknown
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, issues: [{ path: '$', message: `Invalid JSON: ${message}` }] }
  }
  return validateV3Backup(value)
}

export function formatV3ValidationIssues(issues: V3ValidationIssue[]) {
  return issues.map(({ path, message }) => `${path}: ${message}`)
}
