import type { V3Rule } from './rules'

/**
 * Return rules in execution order: pinned rules first, then unpinned rules.
 * Ordering inside either group is the same as the input array. The input and
 * the rule objects are never modified; missing `pinned` is treated as false.
 */
export function orderPinnedRules<T extends Pick<V3Rule, 'pinned'>>(rules: readonly T[]): T[] {
  const pinned: T[] = []
  const unpinned: T[] = []
  for (const rule of rules) (rule.pinned === true ? pinned : unpinned).push(rule)
  return [...pinned, ...unpinned]
}
