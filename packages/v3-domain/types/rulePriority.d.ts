import type { V3Rule } from './rules';
/**
 * Return rules in execution order: pinned rules first, then unpinned rules.
 * Ordering inside either group is the same as the input array. The input and
 * the rule objects are never modified; missing `pinned` is treated as false.
 */
export declare function orderPinnedRules<T extends Pick<V3Rule, 'pinned'>>(rules: readonly T[]): T[];
