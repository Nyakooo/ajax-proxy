import { describe, expect, it, vi } from 'vitest'
import { createV3RuntimeController } from '../../src/v3/runtimeController'

const backup = {
  format: 'ajax-proxy-backup',
  formatVersion: 3,
  settings: { globalEnabled: true, mode: 'interceptor', language: 'en' },
  tags: [],
  rules: [],
}

describe('createV3RuntimeController', () => {
  it('owns V3 configuration lifecycle and retains active state on invalid updates', () => {
    const host = {
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Window
    const controller = createV3RuntimeController(
      host,
      vi.fn(async () => new Response('native')) as typeof window.fetch,
      class {} as unknown as typeof window.XMLHttpRequest
    )

    expect(controller.backup).toBeNull()
    expect(controller.update(backup)).toEqual({ ok: true, status: 'updated' })
    const active = controller.backup
    expect(active).toEqual(backup)

    const invalidUpdate = controller.update({ ...backup, formatVersion: 2 })
    expect(invalidUpdate).toMatchObject({
      ok: false,
      issues: [{ path: 'formatVersion' }],
    })
    expect(controller.backup).toBe(active)

    expect(
      controller.update({ ...backup, settings: { ...backup.settings, globalEnabled: false } })
    ).toEqual({ ok: true, status: 'updated' })
    expect(controller.backup?.settings.globalEnabled).toBe(false)

    expect(controller.update(null)).toEqual({ ok: true, status: 'cleared' })
    expect(controller.backup).toBeNull()
  })

  it('emits privacy-limited diagnostics only while armed and leaves fetch native', async () => {
    const dispatchEvent = vi.fn()
    const host = {
      dispatchEvent,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Window
    const fetcher = vi.fn(async () => new Response('native'))
    const controller = createV3RuntimeController(
      host,
      fetcher as typeof window.fetch,
      class {} as unknown as typeof window.XMLHttpRequest
    )
    const configuredBackup = {
      ...backup,
      rules: [
        {
          id: 'rule-a',
          enabled: true,
          match: { url: '/expected', method: 'GET' },
          request: { enabled: false, redirect: { url: 'https://unused.test/' } },
          response: { enabled: true, replace: { body: { mocked: true } } },
        },
      ],
    }
    controller.update(configuredBackup)

    await controller.fetch('https://example.test/private?token=secret')
    expect(dispatchEvent).not.toHaveBeenCalled()

    controller.setDiagnosticsArmed(true)
    await controller.fetch('https://example.test/private?token=secret')
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(dispatchEvent).toHaveBeenCalledOnce()
    const event = dispatchEvent.mock.calls[0][0] as CustomEvent
    expect(event.detail).toEqual({
      kind: 'v3-no-match',
      method: 'GET',
      rules: [{ rule_id: 'rule-a', reason: 'url-mismatch' }],
      truncated: false,
    })
    expect(JSON.stringify(event.detail)).not.toContain('private')
    expect(JSON.stringify(event.detail)).not.toContain('secret')
  })
})
