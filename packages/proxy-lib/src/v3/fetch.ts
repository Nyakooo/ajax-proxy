import { selectV3Rule } from '@proxy/v3-domain'
import type { V3Rule } from '@proxy/v3-domain'
import type {
  V3FetchOutcomeReason,
  V3FetchOutcomeStage,
  V3FetchOutcomeStatus,
} from '@proxy/protocol'
import type { V3RuntimeHostOptions } from './runtimeOptions'
import { replaceFetchResponse } from './responseAction'

export type V3Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
export type V3FetchOptions = V3RuntimeHostOptions
let correlationSequence = 0

function createCorrelationId(): string {
  return `v3-fetch-${++correlationSequence}`
}

function reportOutcome(
  options: V3FetchOptions,
  rule: V3Rule,
  correlationId: string | undefined,
  stage: V3FetchOutcomeStage,
  outcome: V3FetchOutcomeStatus,
  reason: V3FetchOutcomeReason
) {
  if (!correlationId) return
  try {
    options.onFetchOutcome?.(rule, correlationId, stage, outcome, reason)
  } catch {
    // Outcome diagnostics must never change the native Fetch result.
  }
}

async function redirectRequest(request: Request, targetUrl: string): Promise<Request> {
  const destination = new URL(targetUrl, request.url)
  if (destination.protocol !== 'http:' && destination.protocol !== 'https:') {
    throw new TypeError('V3 redirect targets must use HTTP or HTTPS.')
  }
  const body = request.body ? await request.clone().arrayBuffer() : undefined
  const headers = new Headers(request.headers)
  if (destination.origin !== new URL(request.url).origin) {
    for (const name of ['authorization', 'proxy-authorization', 'cookie', 'cookie2']) {
      headers.delete(name)
    }
  }
  return new Request(destination, {
    method: request.method,
    headers,
    body,
    credentials: request.credentials,
    mode: request.mode,
    cache: request.cache,
    redirect: request.redirect,
    referrer: request.referrer,
    referrerPolicy: request.referrerPolicy,
    integrity: request.integrity,
    keepalive: request.keepalive,
    signal: request.signal,
  })
}

/**
 * Build a Fetch wrapper that applies one V3 rule across the request and
 * response stages. The extension host owns configuration, diagnostics, and mounting.
 */
export function createV3Fetch(fetcher: V3Fetch, options: V3FetchOptions): V3Fetch {
  return async (input, init) => {
    const originalRequest = new Request(input, init)
    const selection = selectV3Rule(options.getRules(), {
      url: originalRequest.url,
      method: originalRequest.method,
    })
    if (!selection) {
      try {
        options.onNoMatch?.({ url: originalRequest.url, method: originalRequest.method })
      } catch {
        // Diagnostics must not affect the native request.
      }
      return fetcher(input, init)
    }

    try {
      options.onMatched?.(selection.rule, selection.index, selection.originalRequest)
    } catch {
      // Statistics and notifications must not change the network result.
    }

    let requestForResponse = originalRequest
    let requestSnapshot!: Request
    let networkResponse!: Response
    const outcomeArmed =
      options.onFetchOutcome !== undefined && (options.isFetchOutcomeDiagnosticsArmed?.() ?? true)
    const correlationId = outcomeArmed ? createCorrelationId() : undefined
    const redirect = selection.rule.request
    if (redirect?.enabled) {
      try {
        requestForResponse = await redirectRequest(originalRequest, redirect.redirect.url)
      } catch {
        // A construction/body replay failure can safely fall back before network dispatch.
        requestForResponse = originalRequest
        requestSnapshot = originalRequest.clone()
        reportOutcome(
          options,
          selection.rule,
          correlationId,
          'request',
          'fallback',
          'redirect-construction-failed'
        )
        try {
          networkResponse = await fetcher(input, init)
        } catch (networkError) {
          reportOutcome(
            options,
            selection.rule,
            correlationId,
            'request',
            'failed',
            'network-failed'
          )
          throw networkError
        }
      }
      if (requestForResponse !== originalRequest) {
        requestSnapshot = requestForResponse.clone()
        try {
          networkResponse = await fetcher(requestForResponse)
        } catch (networkError) {
          // Once the redirected request is dispatched, preserve its native network error.
          reportOutcome(
            options,
            selection.rule,
            correlationId,
            'request',
            'failed',
            'network-failed'
          )
          throw networkError
        }
        reportOutcome(
          options,
          selection.rule,
          correlationId,
          'request',
          'applied',
          'redirect-applied'
        )
      }
    } else {
      requestSnapshot = originalRequest.clone()
      try {
        networkResponse = await fetcher(input, init)
      } catch (networkError) {
        reportOutcome(options, selection.rule, correlationId, 'request', 'failed', 'network-failed')
        throw networkError
      }
    }
    return replaceFetchResponse(
      networkResponse,
      requestForResponse,
      selection.rule,
      options.executeResponseFunction,
      requestSnapshot,
      (code) => options.onFunctionError?.(selection.rule, selection.originalRequest, code),
      (outcome, reason) =>
        reportOutcome(options, selection.rule, correlationId, 'response', outcome, reason)
    )
  }
}
