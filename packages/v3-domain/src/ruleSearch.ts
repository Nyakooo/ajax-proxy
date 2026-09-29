import type { V3Rule, V3Tag } from './rules'

export type V3RuleSearchTag = string | Pick<V3Tag, 'id' | 'name'>

const searchableStringFields = ['note', 'notes', 'remark', 'remarks', 'label', 'labels'] as const

function recordStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(recordStrings)
  return []
}

function searchText(rule: V3Rule, tags: readonly V3RuleSearchTag[]): string {
  const extendedRule = rule as V3Rule & Record<string, unknown>
  const redirect = rule.request?.redirect
  const redirectUrl = redirect && 'url' in redirect ? redirect.url : ''
  const fields = [
    rule.title ?? '',
    rule.id,
    rule.match.url,
    rule.match.method ?? '',
    redirectUrl,
    ...searchableStringFields.flatMap((field) => recordStrings(extendedRule[field])),
    ...tags.flatMap((tag) => {
      if (typeof tag === 'string') return [tag]
      return rule.tagIds?.includes(tag.id) ? [tag.id, tag.name] : []
    }),
  ]
  return fields.join('\n').toLocaleLowerCase()
}

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
export function matchesRuleSearch(
  rule: V3Rule,
  query: string,
  tags: readonly V3RuleSearchTag[] = []
): boolean {
  const text = searchText(rule, tags)
  const terms = query.trim().split(/\s+/).filter(Boolean)
  for (const rawTerm of terms) {
    const term = rawTerm.toLocaleLowerCase()
    const separator = term.indexOf(':')
    const field = separator > 0 ? term.slice(0, separator) : ''
    const value = separator > 0 ? term.slice(separator + 1) : ''
    if (field === 'method') {
      if (!value || (rule.match.method ?? 'ANY').toLocaleLowerCase() !== value) return false
    } else if (field === 'title') {
      if (!value || !(rule.title ?? '').toLocaleLowerCase().includes(value)) return false
    } else if (field === 'type' && (value === 'redirect' || value === 'response')) {
      if (value === 'redirect' ? !rule.request : !rule.response) return false
    } else if (field === 'status' && (value === 'enabled' || value === 'disabled')) {
      if (rule.enabled !== (value === 'enabled')) return false
    } else if (field === 'pinned' && (value === 'true' || value === 'false')) {
      if ((rule.pinned === true) !== (value === 'true')) return false
    } else if (!text.includes(term)) {
      return false
    }
  }
  return true
}
