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
})
