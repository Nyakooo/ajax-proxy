import { selectV3Rule } from '@proxy/v3-domain'
import type { V3Rule } from '@proxy/v3-domain'

export interface V3XHROptions {
  getRules: () => readonly V3Rule[]
  onMatched?: (rule: V3Rule, index: number) => void
}

export type V3XHRConstructor = new () => XMLHttpRequest

interface Replacement {
  body?: string
  status: number
  statusText: string
  json?: unknown
}

function absoluteUrl(value: string | URL): string {
  const base = typeof location === 'undefined' ? 'http://localhost/' : location.href
  return new URL(String(value), base).href
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

function getReplacement(xhr: XMLHttpRequest, rule: V3Rule): Replacement | undefined {
  const config = rule.response?.replace
  if (!rule.response?.enabled || !config || (config.code?.trim() ?? '') !== '') return undefined
  // XHR response headers cannot be faithfully replaced, so this prototype only
  // exposes body/status overrides and leaves the browser's response headers intact.
  // If a rule requests header changes, leave the complete response untouched
  // instead of silently applying only part of its response action.
  if (config.headers && Object.keys(config.headers).length > 0) return undefined
  const type = xhr.responseType
  if (type !== '' && type !== 'text' && type !== 'json') return undefined
  try {
    const status = config.status ?? xhr.status
    if (!Number.isInteger(status) || status < 200 || status > 599) return undefined
    const body = config.body === undefined ? undefined : JSON.stringify(config.body)
    if (config.body !== undefined && body === undefined) return undefined
    const json = type === 'json' && body !== undefined ? JSON.parse(body) : undefined
    return {
      body,
      status,
      statusText: xhr.statusText,
      json,
    }
  } catch {
    return undefined
  }
}

/**
 * Create an isolated XMLHttpRequest prototype for V3 rules.
 * It does not patch the global constructor or participate in extension runtime state.
 * Native events and response headers remain browser-owned and are not rewritten.
 */
export function createV3XHR(NativeXHR: V3XHRConstructor, options: V3XHROptions): V3XHRConstructor {
  return class extends NativeXHR {
    constructor() {
      super()
      let selected: V3Rule | undefined
      let replacement: Replacement | undefined
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

      const proxy = new Proxy(this, {
        get(target, property) {
          if (property === 'open') {
            return (...args: Parameters<XMLHttpRequest['open']>) => {
              const [method, url, async] = args
              selected = undefined
              replacement = undefined

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
                  try {
                    options.onMatched?.(match.rule, match.index)
                  } catch {
                    // Metrics/notification failures must not affect the request.
                  }
                }
              } catch {
                selected = undefined
              }

              const redirect = selected?.request
              const redirectValue: unknown = redirect?.redirect?.url
              const targetUrl =
                redirect?.enabled && typeof redirectValue === 'string'
                  ? resolveRedirect(redirectValue, originalUrl)
                  : undefined
              // Only static targets are supported. Function source is intentionally ignored.
              if (!targetUrl) return target.open(...args)
              args[1] = targetUrl
              try {
                return target.open(...args)
              } catch {
                // open has not sent a request yet, so falling back is safe here.
                args[1] = url
                return target.open(...args)
              }
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

          if (
            property === 'response' ||
            property === 'responseText' ||
            property === 'status' ||
            property === 'statusText'
          ) {
            if (target.readyState === 4 && selected && !replacement) {
              replacement = getReplacement(target, selected)
            }
            if (replacement) {
              if (property === 'status') return replacement.status
              if (property === 'statusText') return replacement.statusText
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
