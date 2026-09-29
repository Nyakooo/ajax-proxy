import type { V3Rule, V3Tag } from './rules';
export type V3RuleSearchTag = string | Pick<V3Tag, 'id' | 'name'>;
/**
 * Match a rule against an AND-separated, case-insensitive search query.
 * Ordinary terms search title, URL, method, note/remark, rule ID, redirect target,
 * label, and supplied tag strings or referenced tag objects. Strings are
 * treated as prefiltered labels; objects are filtered by the rule's tag IDs.
 * Supported filters are
 * `method:`, `type:redirect|response`, `status:enabled|disabled`, and
 * `pinned:true|false`. `title:` searches the explicit rule title only.
 * Missing `pinned` is treated as false.
 */
export declare function matchesRuleSearch(rule: V3Rule, query: string, tags?: readonly V3RuleSearchTag[]): boolean;
