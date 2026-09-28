/** Normalize an absolute HTTP(S) URL to its exact origin. */
export function normalizeV3Origin(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.origin
  } catch {
    return null
  }
}

/** Check whether an exact HTTP(S) origin is present in a disabled-origin list. */
export function isV3OriginDisabled(origin: string, disabledOrigins: readonly string[]): boolean {
  const normalizedOrigin = normalizeV3Origin(origin)
  return normalizedOrigin !== null && disabledOrigins.includes(normalizedOrigin)
}
