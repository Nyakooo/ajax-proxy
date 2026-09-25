export type PageBadgeHit = {
  match_url: string
  method: string
  url?: string
  rule_index?: number
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
