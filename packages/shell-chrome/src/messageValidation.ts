export type PageBadgeHit = {
  match_url: string
  method: string
  url?: string
  rule_index?: number
}

export type PageV3Hit = {
  kind: 'v3-hit'
  rule_id: string
  match_url: string
  method: string
  url?: string
}

export function isPageV3Hit(value: unknown): value is PageV3Hit {
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

export function isPageBadgeHit(value: unknown): value is PageBadgeHit {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return false
    const data = value as Record<string, unknown>
    if (
      Object.keys(data).some((key) => !['match_url', 'method', 'url', 'rule_index'].includes(key))
    )
      return false
    return (
      typeof data.match_url === 'string' &&
      data.match_url.length > 0 &&
      data.match_url.length <= 4096 &&
      typeof data.method === 'string' &&
      /^[A-Z]{1,16}$/.test(data.method) &&
      (data.url === undefined || (typeof data.url === 'string' && data.url.length <= 8192)) &&
      (data.rule_index === undefined ||
        (typeof data.rule_index === 'number' &&
          Number.isSafeInteger(data.rule_index) &&
          data.rule_index >= 0))
    )
  } catch {
    return false
  }
}
