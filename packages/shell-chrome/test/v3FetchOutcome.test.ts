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
  StorageKey: { V3_CONFIG: 'v3-config', V3_FETCH_OUTCOMES_ARMED: 'fetch-outcomes-armed' },
  getRealStorage: mocks.getRealStorage,
  noticePanelsByServiceWorker: mocks.noticePanelsByServiceWorker,
}))

vi.mock('@proxy/v3-domain', () => ({ validateV3Backup: mocks.validateV3Backup }))

import { notifyV3FetchOutcome } from '../src/service-worker/v3FetchOutcome'

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
  kind: 'v3-fetch-outcome',
  correlation_id: 'request-1',
  rule_id: 'rule-a',
  stage: 'request',
  outcome: 'applied',
  reason: 'redirect-applied',
}

function setup({ config = backup(), armed = true } = {}) {
  mocks.getRealStorage.mockImplementation(async (key: string) => {
    if (key === 'v3-config') return config
    if (key === 'fetch-outcomes-armed') return armed
    return null
  })
}

afterEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

describe('notifyV3FetchOutcome', () => {
  it('rejects unknown rules and rules whose action is not enabled', async () => {
    setup()
    expect(await notifyV3FetchOutcome({ ...requestOutcome, rule_id: 'unknown-rule' })).toBe(false)
    expect(await notifyV3FetchOutcome({ ...requestOutcome, rule_id: 'rule-disabled' })).toBe(false)
    expect(mocks.noticePanelsByServiceWorker).not.toHaveBeenCalled()
  })

  it('forwards nothing when the persistent opt-in arm is off', async () => {
    setup({ armed: false })
    expect(await notifyV3FetchOutcome(requestOutcome)).toBe(false)
    expect(mocks.noticePanelsByServiceWorker).not.toHaveBeenCalled()
  })

  it('rejects invalid payloads and stage, action, or reason/status mismatches', async () => {
    setup()
    const invalidCases = [
      { ...requestOutcome, private_url: 'https://example.test/?token=secret' },
      { ...requestOutcome, stage: 'response', reason: 'redirect-applied' },
      { ...requestOutcome, outcome: 'fallback', reason: 'redirect-applied' },
    ]
    for (const value of invalidCases) expect(await notifyV3FetchOutcome(value)).toBe(false)

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
      await notifyV3FetchOutcome({
        ...requestOutcome,
        stage: 'response',
        outcome: 'applied',
        reason: 'response-replacement-applied',
      })
    ).toBe(false)

    setup()

    expect(
      await notifyV3FetchOutcome({
        ...requestOutcome,
        stage: 'response',
        outcome: 'applied',
        reason: 'response-replacement-applied',
      })
    ).toBe(true)
    expect(mocks.noticePanelsByServiceWorker).toHaveBeenCalledOnce()
    expect(mocks.noticePanelsByServiceWorker).toHaveBeenCalledWith(
      'v3-fetch-outcome',
      expect.objectContaining({ reason: 'response-replacement-applied' })
    )
  })

  it('forwards request and response outcomes with the same correlation id as separate events', async () => {
    setup()
    const responseOutcome = {
      ...requestOutcome,
      stage: 'response',
      outcome: 'fallback',
      reason: 'response-replacement-failed',
    }

    expect(await notifyV3FetchOutcome(requestOutcome)).toBe(true)
    expect(await notifyV3FetchOutcome(responseOutcome)).toBe(true)
    expect(mocks.noticePanelsByServiceWorker).toHaveBeenCalledTimes(2)
    expect(mocks.noticePanelsByServiceWorker).toHaveBeenNthCalledWith(
      1,
      'v3-fetch-outcome',
      requestOutcome
    )
    expect(mocks.noticePanelsByServiceWorker).toHaveBeenNthCalledWith(
      2,
      'v3-fetch-outcome',
      responseOutcome
    )
    expect(mocks.getRealStorage).toHaveBeenCalledWith('fetch-outcomes-armed', false)
  })

  it('forwards network failures for rules with only an enabled response action', async () => {
    setup({
      config: backup({
        rules: [
          {
            id: 'rule-a',
            enabled: true,
            request: { enabled: false },
            response: { enabled: true },
          },
        ],
      }),
    })
    const networkFailure = {
      ...requestOutcome,
      outcome: 'failed',
      reason: 'network-failed',
    }

    expect(await notifyV3FetchOutcome(networkFailure)).toBe(true)
    expect(mocks.noticePanelsByServiceWorker).toHaveBeenCalledExactlyOnceWith(
      'v3-fetch-outcome',
      networkFailure
    )
  })
})
