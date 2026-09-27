/** Diagnostic event emitted by the page-world V3 request proxy. */
export type V3Hit = {
  kind: 'v3-hit'
  rule_id: string
  match_url: string
  method: string
  url?: string
  /** Present only when a static Mock response intercepted this request. */
  response_mode?: 'mock'
  status?: number
  network_skipped?: true
}

/** Service-worker notice sent after a V3 rule hit has been recorded. */
export type V3HitNotice = {
  rule_id: string
  count: number
  match_url: string
  method: string
  url: string
  /** Present only when a static Mock response intercepted this request. */
  response_mode?: 'mock'
  status?: number
  network_skipped?: true
}

const MOCK_KEYS = ['response_mode', 'status', 'network_skipped'] as const
const HIT_NOTICE_REQUIRED_KEYS = ['rule_id', 'count', 'match_url', 'method', 'url'] as const
const HIT_NOTICE_KEYS = [...HIT_NOTICE_REQUIRED_KEYS, ...MOCK_KEYS] as const
const HIT_REQUIRED_KEYS = ['kind', 'rule_id', 'match_url', 'method'] as const
const HIT_KEYS = [...HIT_REQUIRED_KEYS, 'url', ...MOCK_KEYS] as const

/** Copy allowed own data properties without invoking getters or proxy get traps. */
function copyOwnDataProperties(
  value: object,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[]
): Record<string, unknown> | null {
  try {
    const keys = Reflect.ownKeys(value)
    if (
      keys.some((key) => typeof key !== 'string' || !allowedKeys.includes(key)) ||
      requiredKeys.some((key) => !keys.includes(key))
    )
      return null

    const data: Record<string, unknown> = Object.create(null)
    for (const key of keys as string[]) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (descriptor === undefined || !('value' in descriptor)) return null
      data[key] = descriptor.value
    }
    return data
  } catch {
    return null
  }
}

function isMockMetadata(data: Record<string, unknown>) {
  const hasMockMetadata = MOCK_KEYS.some((key) => key in data)
  if (!hasMockMetadata) return true
  return (
    data.response_mode === 'mock' &&
    Number.isInteger(data.status) &&
    (data.status as number) >= 200 &&
    (data.status as number) <= 599 &&
    data.network_skipped === true
  )
}

/** Validate the untrusted service-worker hit notice before exposing it to panels. */
export function isV3HitNotice(value: unknown): value is V3HitNotice {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return false
    const data = copyOwnDataProperties(value, HIT_NOTICE_KEYS, HIT_NOTICE_REQUIRED_KEYS)
    if (data === null) return false
    return (
      typeof data.rule_id === 'string' &&
      data.rule_id.length > 0 &&
      Number.isSafeInteger(data.count) &&
      (data.count as number) > 0 &&
      typeof data.match_url === 'string' &&
      data.match_url.length > 0 &&
      typeof data.method === 'string' &&
      data.method.length > 0 &&
      typeof data.url === 'string' &&
      data.url.length > 0 &&
      isMockMetadata(data)
    )
  } catch {
    return false
  }
}

/** Validate the untrusted page-world event before forwarding it to extension contexts. */
export function isV3Hit(value: unknown): value is V3Hit {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return false
    const data = copyOwnDataProperties(value, HIT_KEYS, HIT_REQUIRED_KEYS)
    if (data === null) return false
    return (
      data.kind === 'v3-hit' &&
      typeof data.rule_id === 'string' &&
      data.rule_id.length >= 1 &&
      data.rule_id.length <= 256 &&
      typeof data.match_url === 'string' &&
      data.match_url.length >= 1 &&
      data.match_url.length <= 4096 &&
      typeof data.method === 'string' &&
      /^[A-Z]{1,16}$/.test(data.method) &&
      (data.url === undefined || (typeof data.url === 'string' && data.url.length <= 8192)) &&
      isMockMetadata(data)
    )
  } catch {
    return false
  }
}
