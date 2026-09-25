import { validateV3Backup } from '@proxy/v3-domain'
import type { V3Backup, V3Rule, V3ValidationIssue } from '@proxy/v3-domain'
import { NoticeTo } from '@proxy/protocol'
import type { V3Hit } from '@proxy/protocol'
import { createV3Fetch } from './fetch'
import { createV3ResponseFunctionExecutor } from './responseFunctionSandbox'
import { createV3XHR } from './xhr'

export interface V3RuntimeController {
  readonly fetch: typeof window.fetch
  readonly xhr: typeof window.XMLHttpRequest
  readonly backup: V3Backup | null
  update(target: unknown): V3RuntimeUpdateResult
}

export type V3RuntimeUpdateResult =
  { ok: true; status: 'updated' | 'cleared' } | { ok: false; issues: V3ValidationIssue[] }

function notifyV3Match(host: Window, rule: V3Rule, request: { url: string; method: string }) {
  try {
    const detail: V3Hit = {
      kind: 'v3-hit',
      rule_id: rule.id,
      match_url: rule.match.url,
      method: request.method,
      url: request.url,
    }
    host.dispatchEvent(new CustomEvent(NoticeTo.CONTENT, { detail }))
  } catch {
    // Diagnostics must not affect the request path.
  }
}

export function createV3RuntimeController(
  host: Window,
  pageFetchAtLoad: typeof window.fetch,
  pageXHRAtLoad: typeof window.XMLHttpRequest
): V3RuntimeController {
  let backup: V3Backup | null = null
  const options = {
    getRules: () => (backup?.settings.globalEnabled ? backup.rules : []),
    onMatched: (rule: V3Rule, _index: number, request: { url: string; method: string }) =>
      notifyV3Match(host, rule, request),
    executeResponseFunction: createV3ResponseFunctionExecutor(host),
  }
  const fetch = createV3Fetch(pageFetchAtLoad, options)
  const xhr = createV3XHR(pageXHRAtLoad, options) as unknown as typeof window.XMLHttpRequest

  return {
    fetch,
    xhr,
    get backup() {
      return backup
    },
    update(target) {
      if (target === null) {
        backup = null
        return { ok: true, status: 'cleared' }
      }
      const result = validateV3Backup(target)
      if (!result.ok) return result
      backup = result.data
      return { ok: true, status: 'updated' }
    },
  }
}
