import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getRealStorage: vi.fn(),
  noticePanelsByServiceWorker: vi.fn(),
  validateV3Backup: vi.fn((value: unknown) => {
    if (
      typeof value === 'object' &&
      value !== null &&
      'rules' in value &&
      Array.isArray(value.rules) &&
      'settings' in value
    )
      return { ok: true as const, data: value }
    return { ok: false as const, issues: [] }
  }),
}))

vi.mock('@proxy/shared-utils', () => ({
  NoticeKey: { V3_FUNCTION_ERROR: 'v3-function-error' },
  StorageKey: { V3_CONFIG: 'v3-config' },
  getRealStorage: mocks.getRealStorage,
  noticePanelsByServiceWorker: mocks.noticePanelsByServiceWorker,
}))

vi.mock('@proxy/v3-domain', () => ({ validateV3Backup: mocks.validateV3Backup }))

import { notifyV3FunctionError } from '../src/service-worker/v3FunctionError'

const errorNotice = {
  rule_id: 'rule-a',
  match_url: '/api/items',
  method: 'POST',
  code: 'execution-failed',
}

const config = (ruleOverrides: Record<string, unknown> = {}, globalEnabled = true) => ({
  settings: { globalEnabled },
  rules: [
    {
      id: 'rule-a',
      enabled: true,
      match: { url: '/api/items', method: 'POST' },
      response: { enabled: true, replace: { code: 'return { body: "mock" }' } },
      ...ruleOverrides,
    },
  ],
})

afterEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

describe('notifyV3FunctionError', () => {
  it('forwards only errors for a matching active function response rule', async () => {
    const activeConfig = config()
    mocks.getRealStorage.mockResolvedValue(activeConfig)

    expect(await notifyV3FunctionError(errorNotice)).toBe(true)
    expect(mocks.getRealStorage).toHaveBeenCalledExactlyOnceWith('v3-config', null)
    expect(mocks.noticePanelsByServiceWorker).toHaveBeenCalledExactlyOnceWith(
      'v3-function-error',
      errorNotice
    )

    mocks.noticePanelsByServiceWorker.mockClear()
    const inactiveConfigs = [
      config({}, false),
      config({ enabled: false }),
      config({ match: { url: '/different', method: 'POST' } }),
      config({ response: { enabled: false, replace: { code: 'return {}' } } }),
      config({ response: { enabled: true, replace: { code: '  ' } } }),
    ]

    for (const inactiveConfig of inactiveConfigs) {
      mocks.getRealStorage.mockResolvedValueOnce(inactiveConfig)
      expect(await notifyV3FunctionError(errorNotice)).toBe(false)
    }
    expect(mocks.noticePanelsByServiceWorker).not.toHaveBeenCalled()
  })

  it('propagates a config storage rejection without forwarding a notice', async () => {
    mocks.getRealStorage.mockRejectedValueOnce(new Error('storage unavailable'))

    await expect(notifyV3FunctionError(errorNotice)).rejects.toThrow('storage unavailable')
    expect(mocks.noticePanelsByServiceWorker).not.toHaveBeenCalled()
  })

  it('rejects malformed function error envelopes before reading storage', async () => {
    expect(
      await notifyV3FunctionError({ ...errorNotice, private_url: 'https://secret.test/' })
    ).toBe(false)
    expect(mocks.getRealStorage).not.toHaveBeenCalled()
    expect(mocks.noticePanelsByServiceWorker).not.toHaveBeenCalled()
  })
})
