import { selectV3Rule } from '@proxy/v3-domain'
import type { V3RuntimeHostOptions } from './runtimeOptions'
import { replaceFetchResponse } from './responseAction'

export type V3Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
export type V3FetchOptions = V3RuntimeHostOptions

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
    if (!selection) return fetcher(input, init)

    try {
      options.onMatched?.(selection.rule, selection.index, selection.originalRequest)
    } catch {
      // Statistics and notifications must not change the network result.
    }

    let requestForResponse = originalRequest
    let networkResponse: Response
    const redirect = selection.rule.request
    if (redirect?.enabled) {
      try {
        requestForResponse = await redirectRequest(originalRequest, redirect.redirect.url)
        networkResponse = await fetcher(requestForResponse)
      } catch (error) {
        // A construction/body replay failure can safely fall back before network dispatch.
        // Once the redirected request is dispatched, preserve its native network error.
        if (requestForResponse !== originalRequest) throw error
        requestForResponse = originalRequest
        networkResponse = await fetcher(input, init)
      }
    } else {
      networkResponse = await fetcher(input, init)
    }
    return replaceFetchResponse(networkResponse, requestForResponse, selection.rule)
  }
}
