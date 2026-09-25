import type { V3Rule } from './rules'

/**
 * Insert a rule before the item at `index` (clamped to the collection bounds).
 * A duplicate ID is rejected by returning the original collection unchanged.
 */
export function insertV3Rule(
  rules: readonly V3Rule[],
  rule: V3Rule,
  index: number
): readonly V3Rule[] {
  if (rules.some((existing) => existing.id === rule.id)) return rules
  const safeIndex = Number.isFinite(index)
    ? Math.min(rules.length, Math.max(0, Math.trunc(index)))
    : rules.length
  return [...rules.slice(0, safeIndex), rule, ...rules.slice(safeIndex)]
}

/** Append a rule, rejecting duplicate IDs without changing the collection. */
export function appendV3Rule(rules: readonly V3Rule[], rule: V3Rule): readonly V3Rule[] {
  return insertV3Rule(rules, rule, rules.length)
}

/** Replace a rule by ID. Unknown IDs and replacement ID conflicts are no-ops. */
export function replaceV3Rule(
  rules: readonly V3Rule[],
  id: string,
  replacement: V3Rule
): readonly V3Rule[] {
  const index = rules.findIndex((rule) => rule.id === id)
  if (index < 0) return rules
  if (replacement.id !== id && rules.some((rule) => rule.id === replacement.id)) return rules
  const next = [...rules]
  next[index] = replacement
  return next
}

/** Delete a rule by ID. An unknown ID leaves the original collection unchanged. */
export function deleteV3Rule(rules: readonly V3Rule[], id: string): readonly V3Rule[] {
  const index = rules.findIndex((rule) => rule.id === id)
  if (index < 0) return rules
  return [...rules.slice(0, index), ...rules.slice(index + 1)]
}

/** Toggle a rule by ID. An unknown ID leaves the original collection unchanged. */
export function setV3RuleEnabled(
  rules: readonly V3Rule[],
  id: string,
  enabled: boolean
): readonly V3Rule[] {
  const index = rules.findIndex((rule) => rule.id === id)
  if (index < 0) return rules
  if (rules[index].enabled === enabled) return rules
  const next = [...rules]
  next[index] = { ...rules[index], enabled }
  return next
}

/** Move a rule to a target index, clamped to the valid range. */
export function moveV3Rule(
  rules: readonly V3Rule[],
  id: string,
  toIndex: number
): readonly V3Rule[] {
  const fromIndex = rules.findIndex((rule) => rule.id === id)
  if (fromIndex < 0 || rules.length < 2) return rules
  const safeIndex = Number.isFinite(toIndex)
    ? Math.min(rules.length - 1, Math.max(0, Math.trunc(toIndex)))
    : rules.length - 1
  if (fromIndex === safeIndex) return rules
  const next = [...rules]
  const [rule] = next.splice(fromIndex, 1)
  next.splice(safeIndex, 0, rule)
  return next
}
