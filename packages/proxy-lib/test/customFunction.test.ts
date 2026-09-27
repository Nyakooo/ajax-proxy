import { afterEach, describe, expect, it, vi } from 'vitest'

const request = { url: 'https://example.test/api', method: 'POST' }
const context = {
  req: request,
  res: { status: '200', customStatus: '201', response: 'original' },
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetModules()
})

function setupWindow() {
  vi.stubGlobal('window', { eval })
}

describe('custom function completion', () => {
  it('supports a legacy redirect function that calls next synchronously', async () => {
    setupWindow()
    const { execSetup } = await import('../src/redirectUrlFunc')

    await expect(
      execSetup(
        request,
        'function(req, next) { next({ url: req.url + "/legacy", headers: { "x-redirected-by": "legacy" } }) }'
      )
    ).resolves.toEqual({
      url: `${request.url}/legacy`,
      headers: { 'x-redirected-by': 'legacy' },
    })
  })

  it('waits for an asynchronous redirect callback', async () => {
    setupWindow()
    const { execSetup } = await import('../src/redirectUrlFunc')

    await expect(
      execSetup(
        request,
        'function(req, next) { setTimeout(() => next({ url: req.url + "/async" }), 0) }'
      )
    ).resolves.toEqual({ url: `${request.url}/async` })
  })

  it.each([
    ['null', 'function() { return null }'],
    ['a primitive', 'function() { return 42 }'],
    ['a missing URL', 'function() { return { headers: {} } }'],
    ['non-object headers', 'function(req) { return { url: req.url, headers: [] } }'],
    ['null headers', 'function(req) { return { url: req.url, headers: null } }'],
  ])('fails open when a redirect function returns %s', async (_description, funcText) => {
    setupWindow()
    const { execSetup } = await import('../src/redirectUrlFunc')

    const fallback = await execSetup(request, funcText)

    expect(fallback).toEqual({ url: request.url })
    expect(Reflect.get(fallback, Symbol.for('ajax-proxy.custom-function-fail-open'))).toBe(true)
  })

  it('uses the first result when a redirect function completes by callback and return value', async () => {
    setupWindow()
    const { execSetup } = await import('../src/redirectUrlFunc')

    await expect(
      execSetup(
        request,
        'function(req, next) { next({ url: req.url + "/callback" }); return { url: req.url + "/return" } }'
      )
    ).resolves.toEqual({ url: `${request.url}/callback` })
  })

  it('fails open when the configured redirect function does not evaluate to a function', async () => {
    setupWindow()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { execSetup } = await import('../src/redirectUrlFunc')

    const fallback = await execSetup(request, '42')

    expect(fallback).toEqual({ url: request.url })
    expect(Reflect.get(fallback, Symbol.for('ajax-proxy.custom-function-fail-open'))).toBe(true)
    expect(errorSpy).toHaveBeenCalledWith('[AjaxProxy][error] Invalid redirect function')
  })

  it('fails open when a redirect function throws synchronously', async () => {
    setupWindow()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { execSetup } = await import('../src/redirectUrlFunc')

    const fallback = await execSetup(request, 'function() { throw new Error("failed") }')

    expect(fallback).toEqual({ url: request.url })
    expect(Reflect.get(fallback, Symbol.for('ajax-proxy.custom-function-fail-open'))).toBe(true)
    expect(errorSpy).toHaveBeenCalledWith(
      '[AjaxProxy][error] redirect function failed',
      expect.any(Error)
    )
  })

  it('fails open when a redirect function rejects asynchronously', async () => {
    setupWindow()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { execSetup } = await import('../src/redirectUrlFunc')

    const fallback = await execSetup(
      request,
      'function() { return Promise.reject(new Error("failed")) }'
    )

    expect(fallback).toEqual({ url: request.url })
    expect(Reflect.get(fallback, Symbol.for('ajax-proxy.custom-function-fail-open'))).toBe(true)
    expect(errorSpy).toHaveBeenCalledWith(
      '[AjaxProxy][error] redirect function rejected',
      expect.any(Error)
    )
  })

  it('accepts a Promise result from an interceptor function', async () => {
    setupWindow()
    const { execSetup } = await import('../src/overrideFunc')

    await expect(
      execSetup(
        context,
        'async function(req, res) { return { override: "promised", status: 202 } }'
      )
    ).resolves.toEqual({ override: 'promised', status: 202 })
  })

  it('normalizes an object returned synchronously by an interceptor function', async () => {
    setupWindow()
    const { execSetup } = await import('../src/overrideFunc')

    await expect(
      execSetup(context, 'function(req, res) { return { override: "synchronous" } }')
    ).resolves.toEqual({ override: 'synchronous', status: '201' })
  })

  it('uses the original redirect target when the callback never completes', async () => {
    setupWindow()
    vi.useFakeTimers()
    const { execSetup } = await import('../src/redirectUrlFunc')
    const result = execSetup(request, 'function(req, next) { }')

    await vi.advanceTimersByTimeAsync(5000)

    const fallback = await result
    expect(fallback).toEqual({ url: request.url })
    expect(Reflect.get(fallback, Symbol.for('ajax-proxy.custom-function-fail-open'))).toBe(true)
  })

  it('returns the configured interceptor fallback after a synchronous error', async () => {
    setupWindow()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { execSetup } = await import('../src/overrideFunc')

    const fallback = await execSetup(
      context,
      'function(req, res, next) { throw new Error("failed") }'
    )
    expect(fallback).toEqual({ override: '', status: '201' })
    expect(Reflect.get(fallback, Symbol.for('ajax-proxy.custom-function-fail-open'))).toBe(true)
    expect(errorSpy).toHaveBeenCalledOnce()
  })

  it('returns the configured interceptor fallback after an asynchronous rejection', async () => {
    setupWindow()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { execSetup } = await import('../src/overrideFunc')

    const fallback = await execSetup(
      context,
      'async function(req, res) { return Promise.reject(new Error("failed")) }'
    )

    expect(fallback).toEqual({ override: '', status: '201' })
    expect(Reflect.get(fallback, Symbol.for('ajax-proxy.custom-function-fail-open'))).toBe(true)
    expect(errorSpy).toHaveBeenCalledOnce()
    expect(errorSpy).toHaveBeenCalledWith(
      '[AjaxProxy][error] interceptor function rejected',
      expect.any(Error)
    )
  })
})
