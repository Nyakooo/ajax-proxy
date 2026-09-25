/** Diagnostic event emitted by the page-world V3 request proxy. */
export type V3Hit = {
  kind: 'v3-hit'
  rule_id: string
  match_url: string
  method: string
  url?: string
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
