import type { V3Hit } from '@proxy/protocol'
import type { V3Backup } from './backup'

export type V3HitCounters = Record<string, number>

function isCounterRecord(value: unknown): value is V3HitCounters {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  try {
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
  } catch {
    return false
  }
}

/** Keep only safe, non-negative counters for rules in the validated backup. */
export function sanitizeV3HitCounters(value: unknown, backup: V3Backup): V3HitCounters {
  if (!isCounterRecord(value)) return {}
  const knownIds = new Set(backup.rules.map((rule) => rule.id))
  return Object.fromEntries(
    Object.entries(value).filter(
      ([id, count]) => knownIds.has(id) && Number.isSafeInteger(count) && count >= 0
    )
  )
}

/** Sum valid counters belonging to rules in the backup. */
export function getV3HitTotal(value: unknown, backup: V3Backup): number {
  if (!isCounterRecord(value)) return 0
  const knownIds = new Set(backup.rules.map((rule) => rule.id))
  let total = 0
  for (const [id, count] of Object.entries(value)) {
    if (knownIds.has(id) && Number.isSafeInteger(count) && count >= 0) total += count
  }
  return total
}

/** Revalidate a hit against the active backup and produce the cleaned next counters. */
export function recordV3Hit(
  backup: V3Backup,
  countersValue: unknown,
  hit: V3Hit
): { counters: V3HitCounters; count: number } | undefined {
  const rule = backup.rules.find((candidate) => candidate.id === hit.rule_id)
  if (
    !rule ||
    !rule.enabled ||
    (!rule.request?.enabled && !rule.response?.enabled) ||
    rule.match.url !== hit.match_url
  )
    return undefined
  if (
    rule.match.method &&
    rule.match.method.toUpperCase() !== 'ANY' &&
    rule.match.method.toUpperCase() !== hit.method
  )
    return undefined

  const counters = sanitizeV3HitCounters(countersValue, backup)
  const count = counters[hit.rule_id] ?? 0
  if (count < Number.MAX_SAFE_INTEGER) counters[hit.rule_id] = count + 1
  return { counters, count: counters[hit.rule_id] }
}
