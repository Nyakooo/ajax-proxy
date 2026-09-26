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
  NoticeKey: { V3_FETCH_OUTCOME: 'v3-fetch-outcome' },
  StorageKey: { V3_CONFIG: 'v3-config', V3_FETCH_OUTCOMES_ARMED: 'outcomes-armed' },
  getRealStorage: mocks.getRealStorage,
  noticePanelsByServiceWorker: mocks.noticePanelsByServiceWorker,
}))

vi.mock('@proxy/v3-domain', () => ({ validateV3Backup: mocks.validateV3Backup }))

import { notifyV3XHROutcome } from '../src/service-worker/v3XHROutcome'

const backup = (overrides: Record<string, unknown> = {}) => ({
  settings: { globalEnabled: true },
  rules: [
    {
      id: 'rule-a',
      enabled: true,
      request: { enabled: true },
      response: { enabled: true },
    },
    {
      id: 'rule-disabled',
      enabled: false,
      request: { enabled: true },
      response: { enabled: true },
    },
  ],
  ...overrides,
})

const requestOutcome = {
  kind: 'v3-xhr-outcome',
  correlation_id: 'xhr-1',
  rule_id: 'rule-a',
  stage: 'request',
  outcome: 'applied',
  reason: 'redirect-applied',
}

function setup({ config = backup(), armed = true } = {}) {
  mocks.getRealStorage.mockImplementation(async (key: string) => {
    if (key === 'v3-config') return config
    if (key === 'outcomes-armed') return armed
    return null
  })
}

afterEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

describe('notifyV3XHROutcome', () => {
  it('requires an enabled rule/action and the transient opt-in gate', async () => {
    setup()
    expect(await notifyV3XHROutcome({ ...requestOutcome, rule_id: 'unknown' })).toBe(false)
    expect(await notifyV3XHROutcome({ ...requestOutcome, rule_id: 'rule-disabled' })).toBe(false)

    setup({ config: backup({ settings: { globalEnabled: false } }) })
    expect(await notifyV3XHROutcome(requestOutcome)).toBe(false)

    setup({
      config: backup({
        rules: [
          {
            id: 'rule-a',
            enabled: true,
            request: { enabled: true },
            response: { enabled: false },
          },
        ],
      }),
    })
    expect(
      await notifyV3XHROutcome({
        ...requestOutcome,
        stage: 'response',
        reason: 'response-replacement-applied',
      })
    ).toBe(false)

    setup({ armed: false })
    expect(await notifyV3XHROutcome(requestOutcome)).toBe(false)
    expect(mocks.noticePanelsByServiceWorker).not.toHaveBeenCalled()
  })

  it('rejects malformed, data-bearing, and inconsistent outcomes', async () => {
    setup()
    for (const value of [
      { ...requestOutcome, private_body: 'secret' },
      { ...requestOutcome, stage: 'response' },
      { ...requestOutcome, outcome: 'fallback', reason: 'redirect-applied' },
      {
        ...requestOutcome,
        stage: 'response',
        outcome: 'fallback',
        reason: 'response-replacement-failed',
      },
    ]) {
      expect(await notifyV3XHROutcome(value)).toBe(false)
    }
    expect(mocks.noticePanelsByServiceWorker).not.toHaveBeenCalled()
  })

  it('forwards valid request and response outcomes ephemerally', async () => {
    setup()
    const values = [
      requestOutcome,
      {
        ...requestOutcome,
        outcome: 'fallback',
        reason: 'redirect-target-unsupported',
      },
      {
        ...requestOutcome,
        outcome: 'failed',
        reason: 'send-failed',
      },
      {
        ...requestOutcome,
        stage: 'response',
        reason: 'response-replacement-applied',
      },
      {
        ...requestOutcome,
        stage: 'response',
        outcome: 'failed',
        reason: 'response-replacement-failed',
      },
      {
        ...requestOutcome,
        stage: 'response',
        outcome: 'unsupported',
        reason: 'response-replacement-unsupported',
      },
    ]
    for (const value of values) expect(await notifyV3XHROutcome(value)).toBe(true)
    expect(mocks.noticePanelsByServiceWorker).toHaveBeenCalledTimes(values.length)
    expect(mocks.noticePanelsByServiceWorker).toHaveBeenCalledWith('v3-fetch-outcome', values[0])
  })

  it('propagates config storage failures without reading the diagnostic arm', async () => {
    setup()
    const storageError = new Error('config storage unavailable')
    mocks.getRealStorage.mockRejectedValueOnce(storageError)

    await expect(notifyV3XHROutcome(requestOutcome)).rejects.toBe(storageError)
    expect(mocks.getRealStorage).toHaveBeenCalledTimes(1)
    expect(mocks.getRealStorage).toHaveBeenCalledWith('v3-config', null)
    expect(mocks.noticePanelsByServiceWorker).not.toHaveBeenCalled()
  })

  it('propagates diagnostic arm storage failures without forwarding an outcome', async () => {
    setup()
    const storageError = new Error('diagnostic arm storage unavailable')
    mocks.getRealStorage.mockImplementation(async (key: string) => {
      if (key === 'v3-config') return backup()
      throw storageError
    })

    await expect(notifyV3XHROutcome(requestOutcome)).rejects.toBe(storageError)
    expect(mocks.getRealStorage.mock.calls).toEqual([
      ['v3-config', null],
      ['outcomes-armed', false],
    ])
    expect(mocks.noticePanelsByServiceWorker).not.toHaveBeenCalled()
  })
})
