import type { V3Rule } from './rules';
/**
 * Insert a rule before the item at `index` (clamped to the collection bounds).
 * A duplicate ID is rejected by returning the original collection unchanged.
 */
export declare function insertV3Rule(rules: readonly V3Rule[], rule: V3Rule, index: number): readonly V3Rule[];
/** Append a rule, rejecting duplicate IDs without changing the collection. */
export declare function appendV3Rule(rules: readonly V3Rule[], rule: V3Rule): readonly V3Rule[];
/** Replace a rule by ID. Unknown IDs and replacement ID conflicts are no-ops. */
export declare function replaceV3Rule(rules: readonly V3Rule[], id: string, replacement: V3Rule): readonly V3Rule[];
/** Delete a rule by ID. An unknown ID leaves the original collection unchanged. */
export declare function deleteV3Rule(rules: readonly V3Rule[], id: string): readonly V3Rule[];
/** Toggle a rule by ID. An unknown ID leaves the original collection unchanged. */
export declare function setV3RuleEnabled(rules: readonly V3Rule[], id: string, enabled: boolean): readonly V3Rule[];
/** Move a rule to a target index, clamped to the valid range. */
export declare function moveV3Rule(rules: readonly V3Rule[], id: string, toIndex: number): readonly V3Rule[];
