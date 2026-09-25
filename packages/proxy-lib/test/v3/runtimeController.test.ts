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
    const host = { dispatchEvent: vi.fn() } as unknown as Window
    const controller = createV3RuntimeController(
      host,
      vi.fn(async () => new Response('native')) as typeof window.fetch,
      class {} as unknown as typeof window.XMLHttpRequest
    )

    expect(controller.backup).toBeNull()
    expect(controller.update(backup)).toBe(true)
    const active = controller.backup
    expect(active).toEqual(backup)

    expect(controller.update({ ...backup, formatVersion: 2 })).toBe(false)
    expect(controller.backup).toBe(active)

    expect(
      controller.update({ ...backup, settings: { ...backup.settings, globalEnabled: false } })
    ).toBe(true)
    expect(controller.backup?.settings.globalEnabled).toBe(false)

    expect(controller.update(null)).toBe(true)
    expect(controller.backup).toBeNull()
  })
})
