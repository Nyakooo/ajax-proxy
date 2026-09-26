import { describe, expect, it, vi } from 'vitest'
import { NoticeFrom, NoticeTo, V3PanelMessageKey } from '@proxy/protocol'
import { createV3ConfigService } from '../src/services/v3Config.js'

const backup = {
  format: 'ajax-proxy-backup',
  formatVersion: 3,
  settings: { globalEnabled: false, mode: 'interceptor', language: 'zh-CN' },
  tags: [],
  rules: [],
}

describe('V3 config panel adapter', () => {
  it('reads a V3 snapshot through a strict extension message', async () => {
    const response = { ok: true, snapshot: { config: backup, hitCounters: {} } }
    const runtime = { sendMessage: vi.fn().mockResolvedValue(response) }
    const service = createV3ConfigService(runtime)

    await expect(service.getSnapshot()).resolves.toEqual(response)
    expect(runtime.sendMessage).toHaveBeenCalledWith({
      from: NoticeFrom.PANELS,
      to: NoticeTo.SERVICE_WORKER,
      key: V3PanelMessageKey.GET_SNAPSHOT,
    })
  })

  it('validates the response snapshot instead of accepting malformed storage data', async () => {
    const runtime = {
      sendMessage: vi.fn().mockResolvedValue({
        ok: true,
        snapshot: { config: { format: 'v2' }, hitCounters: {} },
      }),
    }
    const service = createV3ConfigService(runtime)

    await expect(service.getSnapshot()).resolves.toEqual({ ok: false, error: 'invalid-response' })
  })

  it('returns a clear error when extension messaging is unavailable', async () => {
    const service = createV3ConfigService(undefined)

    await expect(service.getSnapshot()).resolves.toEqual({
      ok: false,
      error: 'extension-api-unavailable',
    })
  })

  it('reports messaging failures without leaking browser-specific exceptions', async () => {
    const runtime = { sendMessage: vi.fn().mockRejectedValue(new Error('runtime unavailable')) }
    const service = createV3ConfigService(runtime)

    await expect(service.getSnapshot()).resolves.toEqual({ ok: false, error: 'message-failed' })
  })

  it('validates a config locally before sending SAVE_CONFIG', async () => {
    const runtime = { sendMessage: vi.fn().mockResolvedValue({ ok: true }) }
    const service = createV3ConfigService(runtime)

    await expect(service.saveConfig({ format: 'v2' })).resolves.toMatchObject({
      ok: false,
      issues: [{ path: 'format' }],
    })
    expect(runtime.sendMessage).not.toHaveBeenCalled()
  })

  it('sends normalized valid snapshots and explicit clears through SAVE_CONFIG', async () => {
    const runtime = { sendMessage: vi.fn().mockResolvedValue({ ok: true }) }
    const service = createV3ConfigService(runtime)

    await expect(service.saveConfig(backup)).resolves.toEqual({ ok: true })
    await expect(service.saveConfig(null)).resolves.toEqual({ ok: true })
    expect(runtime.sendMessage).toHaveBeenNthCalledWith(1, {
      from: NoticeFrom.PANELS,
      to: NoticeTo.SERVICE_WORKER,
      key: V3PanelMessageKey.SAVE_CONFIG,
      value: { config: { ...backup, formatVersion: 5, disabledOrigins: [] } },
    })
    expect(runtime.sendMessage).toHaveBeenNthCalledWith(2, {
      from: NoticeFrom.PANELS,
      to: NoticeTo.SERVICE_WORKER,
      key: V3PanelMessageKey.SAVE_CONFIG,
      value: { config: null },
    })
  })

  it('rejects invalid save responses', async () => {
    const runtime = { sendMessage: vi.fn().mockResolvedValue({ ok: 'yes' }) }
    const service = createV3ConfigService(runtime)

    await expect(service.saveConfig(backup)).resolves.toEqual({
      ok: false,
      error: 'invalid-response',
    })
  })

  it('rejects malformed issues and unexpected response fields', async () => {
    const runtime = {
      sendMessage: vi
        .fn()
        .mockResolvedValueOnce({ ok: false, issues: [{ path: 2, message: 'invalid' }] })
        .mockResolvedValueOnce({
          ok: true,
          snapshot: { config: backup, hitCounters: {} },
          extra: true,
        }),
    }
    const service = createV3ConfigService(runtime)

    await expect(service.saveConfig(backup)).resolves.toEqual({
      ok: false,
      error: 'invalid-response',
    })
    await expect(service.getSnapshot()).resolves.toEqual({ ok: false, error: 'invalid-response' })
  })
})
