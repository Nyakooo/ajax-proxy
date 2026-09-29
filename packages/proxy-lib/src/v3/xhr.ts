import { isV3RedirectExcluded, selectV3Rule } from '@proxy/v3-domain'
import type { V3RedirectConfig, V3Rule } from '@proxy/v3-domain'
import type { V3RuntimeHostOptions } from './runtimeOptions'
import type { V3FetchOutcomeStage, V3FetchOutcomeStatus, V3XHROutcomeReason } from '@proxy/protocol'

export type V3XHROptions = V3RuntimeHostOptions

export type V3XHRConstructor = new () => XMLHttpRequest

interface Replacement {
  body?: string
  status: number
  statusText: string
  json?: unknown
}

interface ReplacementResolution {
  replacement?: Replacement
  failure?: 'failed' | 'unsupported'
  hasStatus: boolean
  hasBody: boolean
}

interface MockResponse {
  status: number
  statusText: string
  body: string
  headers: Map<string, { name: string; value: string }>
}

const statusTexts: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  203: 'Non-Authoritative Information',
  204: 'No Content',
  205: 'Reset Content',
  206: 'Partial Content',
  301: 'Moved Permanently',
  302: 'Found',
  303: 'See Other',
  304: 'Not Modified',
  307: 'Temporary Redirect',
  308: 'Permanent Redirect',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  410: 'Gone',
  418: "I'm a Teapot",
  422: 'Unprocessable Content',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
}

function prepareMock(xhr: XMLHttpRequest, rule: V3Rule, method: string): MockResponse | undefined {
  const config = rule.response?.replace
  if (!rule.response?.enabled || rule.response.mode !== 'mock' || !config || config.code) return
  const status = config.status ?? 200
  if (!Number.isInteger(status) || status < 200 || status > 599) return
  const responseType = xhr.responseType
  if (!['', 'text', 'json', 'arraybuffer', 'blob', 'document'].includes(responseType)) return
  let body = ''
  try {
    if (config.body !== undefined) body = JSON.stringify(config.body) ?? ''
  } catch {
    return
  }
  const headers = new Map<string, { name: string; value: string }>()
  for (const [name, value] of Object.entries(config.headers ?? {})) {
    const key = name.toLowerCase()
    const prior = headers.get(key)
    headers.set(key, {
      name: prior?.name ?? name,
      value: prior ? `${prior.value}, ${value}` : value,
    })
  }
  if (!headers.has('content-type')) {
    headers.set('content-type', { name: 'Content-Type', value: 'application/json' })
  }
  if (method.toUpperCase() === 'HEAD' || [204, 205, 304].includes(status)) body = ''
  return { status, statusText: statusTexts[status] ?? '', body, headers }
}

function makeProgressEvent(type: string): Event {
  return typeof ProgressEvent === 'undefined' ? new Event(type) : new ProgressEvent(type)
}

const correlationNonce = Math.random().toString(36).slice(2, 10)
let correlationSequence = 0

function createCorrelationId(): string {
  return `v3-xhr-${Date.now().toString(36)}-${correlationNonce}-${++correlationSequence}`
}

function absoluteUrl(value: string | URL): string {
  // srcdoc frames have an about:srcdoc location but resolve relative requests
  // against their inherited document base URL.
  const base =
    typeof document !== 'undefined' && document.baseURI
      ? document.baseURI
      : typeof location === 'undefined'
        ? 'http://localhost/'
        : location.href
  return new URL(String(value), base).href
}

function isFunctionRedirect(
  config: V3RedirectConfig
): config is Extract<V3RedirectConfig, { type: 'function' }> {
  return 'type' in config && config.type === 'function'
}

function resolveRedirect(value: string, originalUrl: string): string | undefined {
  try {
    const target = new URL(value, originalUrl)
    if (target.protocol !== 'http:' && target.protocol !== 'https:') return undefined
    return target.href
  } catch {
    return undefined
  }
}

function getReplacement(xhr: XMLHttpRequest, rule: V3Rule): ReplacementResolution | undefined {
  const config = rule.response?.replace
  if (!rule.response?.enabled || !config) return undefined
  // A failed network request has no HTTP response to replace. Keep status 0
  // and the native response visible rather than turning the error into success.
  if (xhr.status === 0) return undefined
  if ((config.code?.trim() ?? '') !== '') {
    return { failure: 'unsupported', hasStatus: false, hasBody: false }
  }
  // XHR response headers cannot be faithfully replaced, so this prototype only
  // exposes body/status overrides and leaves the browser's response headers intact.
  // If a rule requests header changes, leave the complete response untouched
  // instead of silently applying only part of its response action.
  if (config.headers && Object.keys(config.headers).length > 0) {
    return { failure: 'unsupported', hasStatus: false, hasBody: false }
  }
  const type = xhr.responseType
  if (type !== '' && type !== 'text' && type !== 'json') {
    return { failure: 'unsupported', hasStatus: false, hasBody: false }
  }
  try {
    const status = config.status ?? xhr.status
    if (!Number.isInteger(status) || status < 200 || status > 599) {
      return { failure: 'failed', hasStatus: false, hasBody: false }
    }
    const body = config.body === undefined ? undefined : JSON.stringify(config.body)
    if (config.body !== undefined && body === undefined) {
      return { failure: 'failed', hasStatus: false, hasBody: false }
    }
    const json = type === 'json' && body !== undefined ? JSON.parse(body) : undefined
    return {
      replacement: { body, status, statusText: xhr.statusText, json },
      hasStatus: config.status !== undefined,
      hasBody: config.body !== undefined,
    }
  } catch {
    return { failure: 'failed', hasStatus: false, hasBody: false }
  }
}

function outcomeReason(
  stage: V3FetchOutcomeStage,
  outcome: V3FetchOutcomeStatus,
  reason: V3XHROutcomeReason,
  options: V3XHROptions,
  rule: V3Rule,
  correlationId: string | undefined
) {
  if (!correlationId || !(options.isFetchOutcomeDiagnosticsArmed?.() ?? true)) return
  try {
    options.onXHROutcome?.(rule, correlationId, stage, outcome, reason)
  } catch {
    // Outcome diagnostics must not affect XHR behavior.
  }
}

/**
 * Create an isolated XMLHttpRequest prototype for V3 rules.
 * It does not patch the global constructor; the extension host owns mounting and state.
 * Native events and response headers remain browser-owned and are not rewritten.
 */
export function createV3XHR(NativeXHR: V3XHRConstructor, options: V3XHROptions): V3XHRConstructor {
  return class extends NativeXHR {
    constructor() {
      super()
      let selected: V3Rule | undefined
      let mockResponse: MockResponse | undefined
      let mockRequested = false
      let mockReadyState = 0
      let mockFailureType: 'abort' | 'timeout' | 'error' | undefined
      let mockResponseValue: unknown = null
      let mockResponseText = ''
      let mockSent = false
      let mockUrl = ''
      let mockTimer: ReturnType<typeof setTimeout> | undefined
      let mockTimeoutTimer: ReturnType<typeof setTimeout> | undefined
      let replacementResolution: ReplacementResolution | undefined
      let replacementResolved = false
      let replacementOutcomeReported = false
      let requestOutcome: { outcome: V3FetchOutcomeStatus; reason: V3XHROutcomeReason } | undefined
      let correlationId: string | undefined
      let stripSensitiveHeaders = false
      let redirectHeaders: Record<string, string> | undefined
      let redirectHeadersApplied = false
      const listenerWrappers = new WeakMap<object, Map<string, Map<boolean, EventListener>>>()
      const handlerProperties = new Map<
        PropertyKey,
        { original: unknown; wrapper: EventListener }
      >()

      const wrapEvent = (event: Event, active: () => boolean) =>
        new Proxy(event, {
          get(target, property) {
            if (property === 'target') return proxy
            if (property === 'currentTarget' && active()) return proxy
            const value = Reflect.get(target, property, target)
            return typeof value === 'function' ? value.bind(target) : value
          },
        })

      const wrapListener = (
        listener: EventListenerOrEventListenerObject,
        type: string,
        capture: boolean
      ) => {
        let byType = listenerWrappers.get(listener)
        if (!byType) {
          byType = new Map()
          listenerWrappers.set(listener, byType)
        }
        let byCapture = byType.get(type)
        if (!byCapture) {
          byCapture = new Map()
          byType.set(type, byCapture)
        }
        let wrapper = byCapture.get(capture)
        if (!wrapper) {
          wrapper = (event) => {
            let active = true
            const wrappedEvent = wrapEvent(event, () => active)
            try {
              if (typeof listener === 'function') listener.call(proxy, wrappedEvent)
              else listener.handleEvent.call(listener, wrappedEvent)
            } finally {
              active = false
            }
          }
          byCapture.set(capture, wrapper)
        }
        return wrapper
      }

      const clearMockTimers = () => {
        if (mockTimer !== undefined) clearTimeout(mockTimer)
        if (mockTimeoutTimer !== undefined) clearTimeout(mockTimeoutTimer)
        mockTimer = undefined
        mockTimeoutTimer = undefined
      }

      const dispatchMock = (type: string) => this.dispatchEvent(makeProgressEvent(type))
      const mockFailure = (type: 'abort' | 'timeout' | 'error') => {
        clearMockTimers()
        mockFailureType = type
        mockReadyState = 4
        mockResponseValue = null
        mockResponseText = ''
        dispatchMock('readystatechange')
        dispatchMock(type)
        dispatchMock('loadend')
      }

      const scheduleMockResponse = () => {
        mockTimer = setTimeout(() => {
          mockTimer = undefined
          if (!mockResponse || !mockSent || mockReadyState === 4) return
          mockReadyState = 2
          dispatchMock('readystatechange')
          mockTimer = setTimeout(() => {
            mockTimer = undefined
            if (!mockResponse || !mockSent || mockReadyState === 4) return
            mockReadyState = 3
            dispatchMock('readystatechange')
            mockTimer = setTimeout(() => {
              mockTimer = undefined
              if (!mockResponse || !mockSent || mockReadyState === 4) return
              const noBody = !mockResponse.body
              mockResponseText = noBody ? '' : mockResponse.body
              const responseType = this.responseType
              if (noBody) {
                if (responseType === 'json') mockResponseValue = null
                else if (responseType === 'arraybuffer') mockResponseValue = new ArrayBuffer(0)
                else if (responseType === 'blob') mockResponseValue = new Blob()
                else if (responseType === 'document') mockResponseValue = null
                else mockResponseValue = ''
              } else if (responseType === 'json') {
                try {
                  mockResponseValue = JSON.parse(mockResponse.body)
                } catch {
                  mockResponseValue = null
                }
              } else if (responseType === 'arraybuffer') {
                mockResponseValue = new TextEncoder().encode(mockResponse.body).buffer
              } else if (responseType === 'blob') {
                mockResponseValue = new Blob([mockResponse.body], {
                  type: mockResponse.headers.get('content-type')?.value ?? '',
                })
              } else if (responseType === 'document') {
                const mimeType = mockResponse.headers
                  .get('content-type')
                  ?.value.split(';', 1)[0]
                  .trim()
                  .toLowerCase()
                if (
                  typeof DOMParser !== 'undefined' &&
                  [
                    'text/html',
                    'application/xml',
                    'text/xml',
                    'application/xhtml+xml',
                    'image/svg+xml',
                  ].includes(mimeType ?? '')
                ) {
                  mockResponseValue = new DOMParser().parseFromString(
                    mockResponse.body,
                    mimeType as DOMParserSupportedType
                  )
                } else mockResponseValue = null
              } else mockResponseValue = mockResponse.body
              mockReadyState = 4
              if (mockTimeoutTimer !== undefined) clearTimeout(mockTimeoutTimer)
              mockTimeoutTimer = undefined
              dispatchMock('readystatechange')
              dispatchMock('progress')
              dispatchMock('load')
              dispatchMock('loadend')
              if (selected && correlationId) {
                outcomeReason(
                  'request',
                  'applied',
                  'mock-network-skipped',
                  options,
                  selected,
                  correlationId
                )
              }
            }, 1)
          }, 1)
        }, 1)
      }

      const proxy = new Proxy(this, {
        get(target, property) {
          if (property === 'open') {
            return (...args: Parameters<XMLHttpRequest['open']>) => {
              const [method, url, async] = args
              selected = undefined
              mockRequested = false
              clearMockTimers()
              mockResponse = undefined
              mockReadyState = 0
              mockFailureType = undefined
              mockResponseValue = null
              mockResponseText = ''
              mockSent = false
              mockUrl = ''
              replacementResolution = undefined
              replacementResolved = false
              replacementOutcomeReported = false
              requestOutcome = undefined
              correlationId = undefined
              stripSensitiveHeaders = false
              redirectHeaders = undefined
              redirectHeadersApplied = false

              // Synchronous XHR has different response and event timing. Leave it native.
              if (async === false) {
                return target.open(...args)
              }

              let originalUrl: string
              try {
                originalUrl = absoluteUrl(url)
              } catch {
                return target.open(...args)
              }
              try {
                const match = selectV3Rule(options.getRules(), {
                  url: originalUrl,
                  method,
                })
                if (match) {
                  selected = match.rule
                  mockRequested =
                    match.rule.response?.enabled === true && match.rule.response.mode === 'mock'
                  const matchedMock = prepareMock(target, match.rule, method)
                  if (matchedMock) {
                    mockResponse = matchedMock
                    mockReadyState = 1
                    mockUrl = originalUrl
                  }
                  try {
                    if (matchedMock) {
                      options.onMatched?.(match.rule, match.index, match.originalRequest, {
                        responseMode: 'mock',
                        status: matchedMock.status,
                        networkSkipped: true,
                      })
                    } else options.onMatched?.(match.rule, match.index, match.originalRequest)
                  } catch {
                    // Metrics/notification failures must not affect the request.
                  }
                } else {
                  try {
                    options.onNoMatch?.({ url: originalUrl, method: method.toUpperCase() })
                  } catch {
                    // Diagnostics must not affect the native request.
                  }
                }
              } catch {
                selected = undefined
              }

              const redirect = selected?.request
              const redirectExcluded = selected
                ? isV3RedirectExcluded(selected, originalUrl)
                : false
              const redirectConfig = redirect?.redirect
              const configuredHeaders =
                redirectConfig && !isFunctionRedirect(redirectConfig)
                  ? redirectConfig.headers
                  : undefined
              const redirectValue =
                redirectConfig && !isFunctionRedirect(redirectConfig)
                  ? redirectConfig.url
                  : undefined
              const targetUrl =
                !mockRequested &&
                redirect?.enabled &&
                !redirectExcluded &&
                typeof redirectValue === 'string'
                  ? resolveRedirect(redirectValue, originalUrl)
                  : undefined
              // XHR open() is synchronous, so dynamic redirect functions are unsupported.
              if (!targetUrl) {
                if (redirect?.enabled && selected && !redirectExcluded) {
                  requestOutcome = {
                    outcome: 'fallback',
                    reason: 'redirect-target-unsupported',
                  }
                }
                return target.open(...args)
              }
              args[1] = targetUrl
              try {
                stripSensitiveHeaders = new URL(targetUrl).origin !== new URL(originalUrl).origin
                const result = target.open(...args)
                redirectHeaders = configuredHeaders ? { ...configuredHeaders } : undefined
                requestOutcome = { outcome: 'applied', reason: 'redirect-applied' }
                return result
              } catch {
                // open has not sent a request yet, so falling back is safe here.
                args[1] = url
                stripSensitiveHeaders = false
                const result = target.open(...args)
                requestOutcome = { outcome: 'fallback', reason: 'redirect-open-failed' }
                return result
              }
            }
          }

          if (property === 'send') {
            return (...args: Parameters<XMLHttpRequest['send']>) => {
              if (mockResponse) {
                if (mockSent)
                  throw new DOMException('The request has already been sent.', 'InvalidStateError')
                mockSent = true
                const armed =
                  options.onXHROutcome !== undefined &&
                  (options.isFetchOutcomeDiagnosticsArmed?.() ?? true)
                if (armed && selected) correlationId ??= createCorrelationId()
                dispatchMock('loadstart')
                const timeout = Number(target.timeout)
                if (timeout > 0) {
                  mockTimeoutTimer = setTimeout(() => mockFailure('timeout'), timeout)
                }
                scheduleMockResponse()
                return
              }
              const armed =
                options.onXHROutcome !== undefined &&
                (options.isFetchOutcomeDiagnosticsArmed?.() ?? true)
              if (armed && selected) {
                const response = selected.response
                if (requestOutcome || (response?.enabled && response.replace)) {
                  correlationId ??= createCorrelationId()
                }
              }
              try {
                if (redirectHeaders && !redirectHeadersApplied) {
                  redirectHeadersApplied = true
                  for (const [name, value] of Object.entries(redirectHeaders)) {
                    if (
                      stripSensitiveHeaders &&
                      ['authorization', 'proxy-authorization', 'cookie', 'cookie2'].includes(
                        name.toLowerCase()
                      )
                    ) {
                      continue
                    }
                    target.setRequestHeader(name, value)
                  }
                }
                const result = target.send(...args)
                if (requestOutcome && selected && correlationId) {
                  outcomeReason(
                    'request',
                    requestOutcome.outcome,
                    requestOutcome.reason,
                    options,
                    selected,
                    correlationId
                  )
                }
                requestOutcome = undefined
                return result
              } catch (error) {
                if (requestOutcome && selected && correlationId) {
                  outcomeReason(
                    'request',
                    'failed',
                    'send-failed',
                    options,
                    selected,
                    correlationId
                  )
                }
                requestOutcome = undefined
                throw error
              }
            }
          }

          if (property === 'abort') {
            return () => {
              if (mockResponse && mockSent && mockReadyState !== 4) {
                mockFailure('abort')
                return
              }
              return target.abort()
            }
          }

          if (property === 'readyState' && mockResponse) return mockReadyState
          if (property === 'status' && mockResponse)
            return mockReadyState < 2 || mockFailureType ? 0 : mockResponse.status
          if (property === 'statusText' && mockResponse)
            return mockReadyState < 2 || mockFailureType ? '' : mockResponse.statusText
          if (property === 'responseURL' && mockResponse) return mockReadyState < 2 ? '' : mockUrl
          if (property === 'response' && mockResponse)
            return mockReadyState === 4 && !mockFailureType ? mockResponseValue : null
          if (property === 'responseText' && mockResponse) {
            if (target.responseType !== '' && target.responseType !== 'text') {
              throw new DOMException(
                'responseText is only available for text responses.',
                'InvalidStateError'
              )
            }
            return mockReadyState === 4 && !mockFailureType ? mockResponseText : ''
          }
          if (property === 'getResponseHeader' && mockResponse) {
            return (name: string) => {
              if (mockReadyState < 2 || mockFailureType) return null
              return mockResponse?.headers.get(name.toLowerCase())?.value ?? null
            }
          }
          if (property === 'getAllResponseHeaders' && mockResponse) {
            return () =>
              mockReadyState < 2 || mockFailureType
                ? ''
                : [...(mockResponse?.headers.values() ?? [])]
                    .map(({ name, value }) => `${name}: ${value}\r\n`)
                    .join('')
          }

          if (property === 'setRequestHeader') {
            return (name: string, value: string) => {
              if (
                redirectHeaders &&
                Object.keys(redirectHeaders).some(
                  (configuredName) => configuredName.toLowerCase() === name.toLowerCase()
                )
              ) {
                return
              }
              if (
                stripSensitiveHeaders &&
                ['authorization', 'proxy-authorization', 'cookie', 'cookie2'].includes(
                  name.toLowerCase()
                )
              )
                return
              return target.setRequestHeader(name, value)
            }
          }

          if (property === 'addEventListener') {
            return (
              type: string,
              listener: EventListenerOrEventListenerObject | null,
              eventOptions?: boolean | AddEventListenerOptions
            ) => {
              if (!listener) return
              const capture =
                typeof eventOptions === 'boolean' ? eventOptions : (eventOptions?.capture ?? false)
              target.addEventListener(type, wrapListener(listener, type, capture), eventOptions)
            }
          }

          if (property === 'removeEventListener') {
            return (
              type: string,
              listener: EventListenerOrEventListenerObject | null,
              eventOptions?: boolean | EventListenerOptions
            ) => {
              if (!listener) return
              const capture =
                typeof eventOptions === 'boolean' ? eventOptions : (eventOptions?.capture ?? false)
              const wrapper = listenerWrappers.get(listener)?.get(type)?.get(capture)
              if (wrapper) target.removeEventListener(type, wrapper, eventOptions)
            }
          }

          if (typeof property === 'string' && handlerProperties.has(property)) {
            return handlerProperties.get(property)?.original
          }

          if (property === 'response' || property === 'responseText' || property === 'status') {
            if (target.readyState === 4 && selected && !replacementResolved) {
              replacementResolved = true
              replacementResolution = getReplacement(target, selected)
            }
            if (replacementResolution && !replacementOutcomeReported && correlationId) {
              if (replacementResolution.failure) {
                replacementOutcomeReported = true
                outcomeReason(
                  'response',
                  replacementResolution.failure,
                  replacementResolution.failure === 'unsupported'
                    ? 'response-replacement-unsupported'
                    : 'response-replacement-failed',
                  options,
                  selected!,
                  correlationId
                )
              } else if (
                (property === 'status' && replacementResolution.hasStatus) ||
                ((property === 'response' || property === 'responseText') &&
                  replacementResolution.hasBody)
              ) {
                if (
                  property === 'responseText' &&
                  target.responseType !== '' &&
                  target.responseType !== 'text'
                ) {
                  // Preserve the native invalid-state behavior and do not claim application.
                } else {
                  replacementOutcomeReported = true
                  outcomeReason(
                    'response',
                    'applied',
                    'response-replacement-applied',
                    options,
                    selected!,
                    correlationId
                  )
                }
              }
            }
            const replacement = replacementResolution?.replacement
            if (replacement) {
              if (property === 'status') return replacement.status
              if (property === 'responseText' && replacement.body !== undefined) {
                if (target.responseType !== '' && target.responseType !== 'text') {
                  throw new DOMException(
                    'responseText is only available for text responses.',
                    'InvalidStateError'
                  )
                }
                return replacement.body
              }
              if (replacement.body !== undefined) {
                if (target.responseType === 'json') return replacement.json
                return replacement.body
              }
            }
          }

          const value = Reflect.get(target, property, target)
          return typeof value === 'function' ? value.bind(target) : value
        },
        set(target, property, value) {
          if (typeof property === 'string' && property.startsWith('on') && property in target) {
            const prior = handlerProperties.get(property)
            if (prior) target.removeEventListener(property.slice(2), prior.wrapper)
            if (typeof value === 'function') {
              const wrapper = wrapListener(value as EventListener, property.slice(2), false)
              handlerProperties.set(property, { original: value, wrapper })
              target.addEventListener(property.slice(2), wrapper)
              return true
            }
            handlerProperties.delete(property)
            return Reflect.set(target, property, value, target)
          }
          return Reflect.set(target, property, value, target)
        },
      })
      return proxy
    }
  }
}
