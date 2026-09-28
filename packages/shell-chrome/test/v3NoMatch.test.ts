import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getRealStorage: vi.fn(),
  removeStorage: vi.fn(),
  noticePanelsByServiceWorker: vi.fn(),
  validateV3Backup: vi.fn((value: unknown) => {
    if (
      typeof value === 'object' &&
      value !== null &&
      'rules' in value &&
      Array.isArray(value.rules)
    )
      return { ok: true as const, data: value }
    return { ok: false as const, issues: [] }
  }),
}))

vi.mock('@proxy/shared-utils', () => ({
  NoticeKey: { V3_NO_MATCH: 'v3-no-match' },
  StorageKey: { V3_CONFIG: 'v3-config', V3_DIAGNOSTICS_ARMED: 'diagnostics-armed' },
  getRealStorage: mocks.getRealStorage,
  removeStorage: mocks.removeStorage,
  noticePanelsByServiceWorker: mocks.noticePanelsByServiceWorker,
}))

vi.mock('@proxy/v3-domain', () => ({ validateV3Backup: mocks.validateV3Backup }))

import { notifyV3NoMatch } from '../src/service-worker/v3NoMatch'

const backup = (enabled = true) => ({
  settings: { globalEnabled: enabled },
  rules: [{ id: 'rule-a' }, { id: 'rule-b' }],
})

const event = {
  kind: 'v3-no-match',
  method: 'GET',
  rules: [
    { rule_id: 'rule-a', reason: 'url-mismatch' },
    { rule_id: 'rule-b', reason: 'method-mismatch' },
  ],
  truncated: false,
}

function setup({ config = backup(), armed = true } = {}) {
  mocks.getRealStorage.mockImplementation(async (key: string) => {
    if (key === 'v3-config') return config
    if (key === 'diagnostics-armed') return armed
    return null
  })
}

afterEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

describe('notifyV3NoMatch', () => {
  it('rejects payloads with extra fields or invalid rule reasons', async () => {
    setup()
    expect(await notifyV3NoMatch({ ...event, url: '/private?token=secret' })).toBe(false)
    expect(
      await notifyV3NoMatch({ ...event, rules: [{ rule_id: 'rule-a', reason: 'matched' }] })
    ).toBe(false)
    expect(mocks.removeStorage).not.toHaveBeenCalled()
    expect(mocks.noticePanelsByServiceWorker).not.toHaveBeenCalled()
  })

  it('forwards the first 100 configured rules with the truncated marker', async () => {
    const config = {
      ...backup(),
      rules: Array.from({ length: 101 }, (_, index) => ({ id: `rule-${index + 1}` })),
    }
    const truncatedEvent = {
      ...event,
      rules: config.rules.slice(0, 100).map(({ id }) => ({ rule_id: id, reason: 'url-mismatch' })),
      truncated: true,
    }
    setup({ config })

    expect(await notifyV3NoMatch(truncatedEvent)).toBe(true)
    expect(mocks.removeStorage).toHaveBeenCalledOnce()
    expect(mocks.noticePanelsByServiceWorker).toHaveBeenCalledOnce()
    expect(mocks.noticePanelsByServiceWorker).toHaveBeenCalledWith('v3-no-match', truncatedEvent)
  })

  it('rejects inconsistent truncation metadata and rule ordering before consuming the arm', async () => {
    const config = {
      ...backup(),
      rules: Array.from({ length: 101 }, (_, index) => ({ id: `rule-${index + 1}` })),
    }
    const truncatedEvent = {
      ...event,
      rules: config.rules.slice(0, 100).map(({ id }) => ({ rule_id: id, reason: 'url-mismatch' })),
      truncated: true,
    }
    setup({ config })

    expect(await notifyV3NoMatch({ ...truncatedEvent, truncated: false })).toBe(false)
    const wrongRuleOrder = {
      ...truncatedEvent,
      rules: truncatedEvent.rules.map((entry, index) =>
        index === 99 ? { ...entry, rule_id: 'wrong-rule' } : entry
      ),
    }
    expect(await notifyV3NoMatch(wrongRuleOrder)).toBe(false)
    expect(mocks.getRealStorage.mock.calls.some(([key]) => key === 'diagnostics-armed')).toBe(false)
    expect(mocks.removeStorage).not.toHaveBeenCalled()
    expect(mocks.noticePanelsByServiceWorker).not.toHaveBeenCalled()
  })

  it('does not consume the arm for inactive, invalid or mismatched configurations', async () => {
    setup({ config: backup(false) })
    const globallyDisabled = {
      ...event,
      rules: event.rules.map((entry) => ({ ...entry, reason: 'global-disabled' })),
    }
    expect(await notifyV3NoMatch(globallyDisabled)).toBe(true)

    vi.clearAllMocks()
    mocks.getRealStorage.mockImplementation(async (key: string) => {
      if (key === 'v3-config') return null
      if (key === 'diagnostics-armed') return true
      return null
    })
    expect(await notifyV3NoMatch(event)).toBe(false)
    expect(mocks.removeStorage).not.toHaveBeenCalled()

    mocks.getRealStorage.mockImplementation(async (key: string) => {
      if (key === 'v3-config') return backup()
      if (key === 'diagnostics-armed') return true
      return null
    })
    expect(
      await notifyV3NoMatch({ ...event, rules: [{ ...event.rules[0], rule_id: 'other' }] })
    ).toBe(false)
    expect(mocks.removeStorage).not.toHaveBeenCalled()
  })

  it('does not forward when diagnostics are not armed', async () => {
    setup({ armed: false })
    expect(await notifyV3NoMatch(event)).toBe(false)
    expect(mocks.removeStorage).not.toHaveBeenCalled()
    expect(mocks.noticePanelsByServiceWorker).not.toHaveBeenCalled()
  })

  it('propagates storage read failures without poisoning the next queued event', async () => {
    setup()
    mocks.getRealStorage.mockRejectedValueOnce(new Error('storage unavailable'))

    await expect(notifyV3NoMatch(event)).rejects.toThrow('storage unavailable')
    expect(mocks.removeStorage).not.toHaveBeenCalled()
    expect(mocks.noticePanelsByServiceWorker).not.toHaveBeenCalled()

    expect(await notifyV3NoMatch(event)).toBe(true)
    expect(mocks.removeStorage).toHaveBeenCalledOnce()
    expect(mocks.noticePanelsByServiceWorker).toHaveBeenCalledOnce()
  })

  it('consumes the arm and forwards only the first of concurrent valid events', async () => {
    let armed = true
    setup()
    mocks.getRealStorage.mockImplementation(async (key: string) => {
      if (key === 'v3-config') return backup()
      if (key === 'diagnostics-armed') return armed
      return null
    })
    mocks.removeStorage.mockImplementation(async (key: string) => {
      expect(key).toBe('diagnostics-armed')
      armed = false
    })

    const results = await Promise.all([
      notifyV3NoMatch(event),
      notifyV3NoMatch(event),
      notifyV3NoMatch(event),
    ])

    expect(results).toEqual([true, false, false])
    expect(mocks.removeStorage).toHaveBeenCalledOnce()
    expect(mocks.noticePanelsByServiceWorker).toHaveBeenCalledOnce()
    expect(mocks.noticePanelsByServiceWorker).toHaveBeenCalledWith('v3-no-match', event)
  })
})
