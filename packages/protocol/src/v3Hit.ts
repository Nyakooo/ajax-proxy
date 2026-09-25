/** Diagnostic event emitted by the page-world V3 request proxy. */
export type V3Hit = {
  kind: 'v3-hit'
  rule_id: string
  match_url: string
  method: string
  url?: string
}

/** Service-worker notice sent after a V3 rule hit has been recorded. */
export type V3HitNotice = {
  rule_id: string
  count: number
  match_url: string
  method: string
  url: string
}

/** Validate the untrusted service-worker hit notice before exposing it to panels. */
export function isV3HitNotice(value: unknown): value is V3HitNotice {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return false
    const data = value as Record<string, unknown>
    if (
      Object.keys(data).some(
        (key) => !['rule_id', 'count', 'match_url', 'method', 'url'].includes(key)
      )
    )
      return false
    return (
      Object.keys(data).length === 5 &&
      typeof data.rule_id === 'string' &&
      data.rule_id.length > 0 &&
      Number.isSafeInteger(data.count) &&
      (data.count as number) > 0 &&
      typeof data.match_url === 'string' &&
      data.match_url.length > 0 &&
      typeof data.method === 'string' &&
      data.method.length > 0 &&
      typeof data.url === 'string' &&
      data.url.length > 0
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
    const data = value as Record<string, unknown>
    if (
      Object.keys(data).some(
        (key) => !['kind', 'rule_id', 'match_url', 'method', 'url'].includes(key)
      )
    )
      return false
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
      (data.url === undefined || (typeof data.url === 'string' && data.url.length <= 8192))
    )
  } catch {
    return false
  }
}
