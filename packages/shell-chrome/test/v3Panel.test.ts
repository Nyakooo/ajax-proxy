import { afterEach, describe, expect, it, vi } from 'vitest'
import { NoticeFrom, NoticeTo, StorageKey, V3PanelMessageKey } from '@proxy/protocol'
import type { V3PanelStorage } from '../src/service-worker/v3Panel'
import {
  createV3PanelMessageHandler,
  createV3PanelStartupMessageHandler,
  readV3PanelSnapshot,
  saveV3PanelConfig,
} from '../src/service-worker/v3Panel'

const backup = {
  format: 'ajax-proxy-backup',
  formatVersion: 3,
  settings: { globalEnabled: true, mode: 'interceptor', language: 'zh-CN' },
  tags: [],
  rules: [
    {
      id: 'rule-1',
      enabled: true,
      match: { url: '/api/profile', method: 'GET' },
      response: { enabled: true, replace: { body: { ok: true } } },
    },
  ],
}

function createStorage(initial: Record<string, unknown> = {}): V3PanelStorage {
  return {
    read: vi.fn(async (key: StorageKey, defaultValue: unknown) =>
      Object.hasOwn(initial, key) ? initial[key] : defaultValue
    ),
    write: vi.fn(async (key: StorageKey, value: unknown) => {
      initial[key] = value
    }),
  }
}

function createMessageHandler(storage: V3PanelStorage, sendResponse = vi.fn()) {
  const handler = createV3PanelMessageHandler({
    extensionId: 'test-extension',
    extensionUrl: 'chrome-extension://test-extension/',
    storage,
    sendResponse,
  })
  return { handler, sendResponse }
}

const trustedPanelSender = {
  id: 'test-extension',
  url: 'chrome-extension://test-extension/panels-v3/index.html',
}

afterEach(() => vi.clearAllMocks())

describe('V3 panel configuration adapter', () => {
  it('returns an empty snapshot when no V3 configuration is stored', async () => {
    const storage = createStorage()

    await expect(readV3PanelSnapshot(storage)).resolves.toEqual({
      ok: true,
      snapshot: { config: null, hitCounters: {} },
    })
    expect(storage.read).toHaveBeenCalledOnce()
    expect(storage.read).toHaveBeenCalledWith(StorageKey.V3_CONFIG, null)
  })

  it('validates the stored snapshot and keeps only counters for known rules', async () => {
    const storage = createStorage({
      [StorageKey.V3_CONFIG]: backup,
      [StorageKey.V3_HITS]: { 'rule-1': 5, deleted: 90, unsafe: Number.MAX_SAFE_INTEGER + 1 },
    })

    await expect(readV3PanelSnapshot(storage)).resolves.toEqual({
      ok: true,
      snapshot: {
        config: { ...backup, formatVersion: 5, disabledOrigins: [] },
        hitCounters: { 'rule-1': 5 },
      },
    })
    expect(storage.read).toHaveBeenCalledWith(StorageKey.V3_CONFIG, null)
    expect(storage.read).toHaveBeenCalledWith(StorageKey.V3_HITS, {})
  })

  it('returns validation issues for invalid stored config without exposing it', async () => {
    const storage = createStorage({
      [StorageKey.V3_CONFIG]: { format: 'old-or-invalid' },
      [StorageKey.V3_HITS]: { 'rule-1': 5 },
    })

    const result = await readV3PanelSnapshot(storage)
    expect(result).toMatchObject({ ok: false, issues: [{ path: 'format' }] })
    expect(storage.read).toHaveBeenCalledOnce()
  })

  it('maps storage read rejection to a stable error', async () => {
    const storage = createStorage()
    vi.mocked(storage.read).mockRejectedValueOnce(new Error('storage unavailable'))

    await expect(readV3PanelSnapshot(storage)).resolves.toEqual({
      ok: false,
      error: 'storage-read-failed',
    })
  })

  it('maps storage write rejection to a stable error', async () => {
    const storage = createStorage()
    vi.mocked(storage.write).mockRejectedValueOnce(new Error('storage unavailable'))

    await expect(saveV3PanelConfig(backup, storage)).resolves.toEqual({
      ok: false,
      error: 'storage-write-failed',
    })
  })

  it('rejects invalid backups without writing any V3 or V2 key', async () => {
    const storage = createStorage()

    await expect(saveV3PanelConfig({ format: 'v2' }, storage)).resolves.toMatchObject({
      ok: false,
      issues: [{ path: 'format' }],
    })
    expect(storage.write).not.toHaveBeenCalled()
  })

  it('writes a validated V3 snapshot only to its dedicated storage key', async () => {
    const storage = createStorage()

    await expect(saveV3PanelConfig(backup, storage)).resolves.toEqual({ ok: true })
    expect(storage.write).toHaveBeenCalledOnce()
    expect(storage.write).toHaveBeenCalledWith(StorageKey.V3_CONFIG, {
      ...backup,
      formatVersion: 5,
      disabledOrigins: [],
    })
    expect(storage.write).not.toHaveBeenCalledWith(StorageKey.INTERCEPT_LIST, expect.anything())
  })

  it('supports an explicit null clear without changing V2 settings', async () => {
    const storage = createStorage()

    await expect(saveV3PanelConfig(null, storage)).resolves.toEqual({ ok: true })
    expect(storage.write).toHaveBeenCalledWith(StorageKey.V3_CONFIG, null)
    expect(storage.write).not.toHaveBeenCalledWith(StorageKey.GLOBAL_SWITCH, expect.anything())
  })

  it('maps a rejected explicit null clear to storage-write-failed without other writes', async () => {
    const storage = createStorage()
    vi.mocked(storage.write).mockRejectedValueOnce(new Error('storage unavailable'))

    await expect(saveV3PanelConfig(null, storage)).resolves.toEqual({
      ok: false,
      error: 'storage-write-failed',
    })
    expect(storage.write).toHaveBeenCalledExactlyOnceWith(StorageKey.V3_CONFIG, null)
  })

  it('fails the full snapshot when reading hit counters rejects after a valid config read', async () => {
    const storage = createStorage()
    vi.mocked(storage.read).mockImplementation(async (key, defaultValue) => {
      if (key === StorageKey.V3_CONFIG) return backup
      if (key === StorageKey.V3_HITS) throw new Error('counter storage unavailable')
      return defaultValue
    })

    await expect(readV3PanelSnapshot(storage)).resolves.toEqual({
      ok: false,
      error: 'storage-read-failed',
    })
    expect(storage.read.mock.calls.map(([key]) => key)).toEqual([
      StorageKey.V3_CONFIG,
      StorageKey.V3_HITS,
    ])
  })

  it('rejects messages from non-panel senders and accepts a trusted GET asynchronously', async () => {
    const storage = createStorage()
    const { handler, sendResponse } = createMessageHandler(storage)
    const message = {
      from: NoticeFrom.PANELS,
      to: NoticeTo.SERVICE_WORKER,
      key: V3PanelMessageKey.GET_SNAPSHOT,
    }

    expect(handler(message, { ...trustedPanelSender, id: 'other-extension' })).toBe(false)
    expect(handler(message, { ...trustedPanelSender, tab: { id: 1 } })).toBe(true)
    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({
        ok: true,
        snapshot: { config: null, hitCounters: {} },
      })
    )
    expect(handler(message, { ...trustedPanelSender, url: 'https://example.test/' })).toBe(false)
    expect(
      handler(message, {
        ...trustedPanelSender,
        url: 'chrome-extension://test-extension/panels/index.html',
      })
    ).toBe(false)
    expect(handler({ ...message, extra: true }, trustedPanelSender)).toBe(false)
    expect(handler(message, trustedPanelSender)).toBe(true)
    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({
        ok: true,
        snapshot: { config: null, hitCounters: {} },
      })
    )
  })

  it('accepts a trusted SAVE asynchronously and forwards its validation response', async () => {
    const storage = createStorage()
    const { handler, sendResponse } = createMessageHandler(storage)
    const message = {
      from: NoticeFrom.PANELS,
      to: NoticeTo.SERVICE_WORKER,
      key: V3PanelMessageKey.SAVE_CONFIG,
      value: { config: backup },
    }

    expect(handler(message, trustedPanelSender)).toBe(true)
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }))
    expect(storage.write).toHaveBeenCalledWith(StorageKey.V3_CONFIG, {
      ...backup,
      formatVersion: 5,
      disabledOrigins: [],
    })
  })

  it('forwards a trusted SAVE storage rejection as a stable asynchronous error', async () => {
    const storage = createStorage()
    vi.mocked(storage.write).mockRejectedValueOnce(new Error('storage unavailable'))
    const { handler, sendResponse } = createMessageHandler(storage)
    const message = {
      from: NoticeFrom.PANELS,
      to: NoticeTo.SERVICE_WORKER,
      key: V3PanelMessageKey.SAVE_CONFIG,
      value: { config: backup },
    }

    expect(handler(message, trustedPanelSender)).toBe(true)
    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledExactlyOnceWith({
        ok: false,
        error: 'storage-write-failed',
      })
    )
    expect(storage.write).toHaveBeenCalledExactlyOnceWith(StorageKey.V3_CONFIG, {
      ...backup,
      formatVersion: 5,
      disabledOrigins: [],
    })
    expect(storage.read).not.toHaveBeenCalled()
  })

  it('registers V3 requests before storage is ready and handles them after initialization', async () => {
    const storage = createStorage()
    let resolveStorageReady!: () => void
    const storageReady = new Promise<void>((resolve) => {
      resolveStorageReady = resolve
    })
    const sendResponse = vi.fn()
    const handler = createV3PanelStartupMessageHandler({
      extensionId: 'test-extension',
      extensionUrl: 'chrome-extension://test-extension/',
      storageReady,
      storage,
    })
    const message = {
      from: NoticeFrom.PANELS,
      to: NoticeTo.SERVICE_WORKER,
      key: V3PanelMessageKey.SAVE_CONFIG,
      value: { config: backup },
    }

    expect(handler(message, trustedPanelSender, sendResponse)).toBe(true)
    expect(storage.write).not.toHaveBeenCalled()
    resolveStorageReady()

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }))
    expect(storage.write).toHaveBeenCalledWith(StorageKey.V3_CONFIG, {
      ...backup,
      formatVersion: 5,
      disabledOrigins: [],
    })
  })

  it.each([
    ['a different extension ID', { ...trustedPanelSender, id: 'other-extension' }, undefined],
    [
      'a non-V3 extension page',
      { ...trustedPanelSender, url: 'chrome-extension://test-extension/panels/index.html' },
      undefined,
    ],
    ['a malformed message', trustedPanelSender, { from: NoticeFrom.PANELS, extra: true }],
  ])(
    'rejects startup messages from %s before using storage or responding',
    (_case, sender, value) => {
      const storage = createStorage()
      const sendResponse = vi.fn()
      const handler = createV3PanelStartupMessageHandler({
        extensionId: 'test-extension',
        extensionUrl: 'chrome-extension://test-extension/',
        storageReady: Promise.resolve(),
        storage,
      })
      const message = value ?? {
        from: NoticeFrom.PANELS,
        to: NoticeTo.SERVICE_WORKER,
        key: V3PanelMessageKey.GET_SNAPSHOT,
      }

      expect(handler(message, sender, sendResponse)).toBe(false)
      expect(storage.read).not.toHaveBeenCalled()
      expect(storage.write).not.toHaveBeenCalled()
      expect(sendResponse).not.toHaveBeenCalled()
    }
  )

  it('answers startup requests when storage initialization fails', async () => {
    const sendResponse = vi.fn()
    const handler = createV3PanelStartupMessageHandler({
      extensionId: 'test-extension',
      extensionUrl: 'chrome-extension://test-extension/',
      storageReady: Promise.reject(new Error('storage unavailable')),
    })
    const message = {
      from: NoticeFrom.PANELS,
      to: NoticeTo.SERVICE_WORKER,
      key: V3PanelMessageKey.SAVE_CONFIG,
      value: { config: backup },
    }

    expect(handler(message, trustedPanelSender, sendResponse)).toBe(true)
    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'storage-write-failed' })
    )
  })

  it('returns a stable read error when startup initialization fails for a snapshot request', async () => {
    const storage = createStorage()
    const sendResponse = vi.fn()
    const handler = createV3PanelStartupMessageHandler({
      extensionId: 'test-extension',
      extensionUrl: 'chrome-extension://test-extension/',
      storageReady: Promise.reject(new Error('storage unavailable')),
      storage,
    })
    const message = {
      from: NoticeFrom.PANELS,
      to: NoticeTo.SERVICE_WORKER,
      key: V3PanelMessageKey.GET_SNAPSHOT,
    }

    expect(handler(message, trustedPanelSender, sendResponse)).toBe(true)
    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'storage-read-failed' })
    )
    expect(storage.read).not.toHaveBeenCalled()
    expect(storage.write).not.toHaveBeenCalled()
  })
})
