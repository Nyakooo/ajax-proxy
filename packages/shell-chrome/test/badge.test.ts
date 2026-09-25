import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getRealStorage: vi.fn(),
  setStorage: vi.fn(),
  noticePanelsByServiceWorker: vi.fn(),
  validateV3Backup: vi.fn((value: unknown) => {
    if (
      typeof value === 'object' &&
      value !== null &&
      'formatVersion' in value &&
      value.formatVersion === 3
    ) {
      return { ok: true as const, data: value }
    }
    return { ok: false as const, issues: [] }
  }),
}))

vi.mock('@proxy/shared-utils', () => ({
  NoticeKey: { HIT_RATE: 'hit-rate', V3_HIT: 'v3-hit' },
  StorageKey: {
    GLOBAL_SWITCH: 'global-switch',
    MODE: 'mode',
    INTERCEPT_LIST: 'intercept-list',
    V3_CONFIG: 'v3-config',
    V3_HITS: 'v3-hits',
  },
  getRealStorage: mocks.getRealStorage,
  setStorage: mocks.setStorage,
  noticePanelsByServiceWorker: mocks.noticePanelsByServiceWorker,
}))

vi.mock('../src/service-worker/notice', () => ({ chromeNativeNotice: vi.fn() }))
vi.mock('@proxy/v3-domain', () => ({ validateV3Backup: mocks.validateV3Backup }))

import { chromeBadge } from '../src/service-worker/badge'
import { chromeBadgeV3 } from '../src/service-worker/badge'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('chromeBadge rule selection', () => {
  it('increments only the rule selected by the request notice', async () => {
    const rules = [
      { switch_on: true, match_url: '/api', method: 'POST', hit: 2 },
      { switch_on: true, match_url: '/api', method: 'POST', hit: 4 },
    ]
    mocks.getRealStorage.mockImplementation(async (key) => {
      if (key === 'v3-config') return null
      if (key === 'global-switch') return true
      if (key === 'mode') return 'interceptor'
      if (key === 'intercept-list') return rules
      return undefined
    })
    const setBadgeText = vi.fn()
    const setBadgeBackgroundColor = vi.fn()
    vi.stubGlobal('chrome', { action: { setBadgeText, setBadgeBackgroundColor } })

    await chromeBadge({ match_url: '/api', method: 'POST', rule_index: 0 } as never)

    expect(rules.map((rule) => rule.hit)).toEqual([3, 4])
    expect(setBadgeText).toHaveBeenCalledWith({ text: '+7' })
    expect(mocks.setStorage).toHaveBeenCalledWith('intercept-list', rules)
    expect(mocks.noticePanelsByServiceWorker).toHaveBeenCalledWith('hit-rate')
  })

  it('stores V3 hits separately and keeps legacy badge refreshes on the V3 total', async () => {
    const backup = {
      formatVersion: 3,
      settings: { globalEnabled: true },
      rules: [
        {
          id: 'v3-rule',
          enabled: true,
          match: { url: '/api', method: 'POST' },
          response: { enabled: true, replace: {} },
        },
      ],
    }
    let counters: Record<string, number> = {}
    mocks.getRealStorage.mockImplementation(async (key) => {
      if (key === 'v3-config') return backup
      if (key === 'v3-hits') return counters
      if (key === 'global-switch') return true
      if (key === 'mode') return 'interceptor'
      if (key === 'intercept-list') return [{ switch_on: true, match_url: '/legacy', hit: 99 }]
      return undefined
    })
    mocks.setStorage.mockImplementation(async (key, value) => {
      if (key === 'v3-hits') counters = value
    })
    const setBadgeText = vi.fn()
    const setBadgeBackgroundColor = vi.fn()
    vi.stubGlobal('chrome', { action: { setBadgeText, setBadgeBackgroundColor } })

    await Promise.all([
      chromeBadgeV3({ kind: 'v3-hit', rule_id: 'v3-rule', match_url: '/api', method: 'POST' }),
      chromeBadgeV3({ kind: 'v3-hit', rule_id: 'v3-rule', match_url: '/api', method: 'POST' }),
    ])
    await chromeBadge({ match_url: '/legacy', method: 'GET' })

    expect(counters).toEqual({ 'v3-rule': 2 })
    expect(mocks.setStorage).toHaveBeenCalledTimes(2)
    expect(mocks.setStorage).toHaveBeenCalledWith('v3-hits', { 'v3-rule': 2 })
    expect(setBadgeText).toHaveBeenLastCalledWith({ text: '+2' })
    expect(setBadgeBackgroundColor).toHaveBeenLastCalledWith({ color: '#006d75' })
    expect(mocks.noticePanelsByServiceWorker).toHaveBeenCalledWith('v3-hit', {
      rule_id: 'v3-rule',
      count: 2,
    })
  })

  it('ignores V3 hit events for inactive or mismatched rules', async () => {
    const backup = {
      formatVersion: 3,
      settings: { globalEnabled: false },
      rules: [
        {
          id: 'v3-rule',
          enabled: true,
          match: { url: '/api', method: 'POST' },
          response: { enabled: true, replace: {} },
        },
      ],
    }
    mocks.getRealStorage.mockImplementation(async (key) => {
      if (key === 'v3-config') return backup
      if (key === 'v3-hits') return {}
      return undefined
    })
    const setBadgeText = vi.fn()
    vi.stubGlobal('chrome', { action: { setBadgeText, setBadgeBackgroundColor: vi.fn() } })

    await chromeBadgeV3({ kind: 'v3-hit', rule_id: 'v3-rule', match_url: '/api', method: 'POST' })
    expect(mocks.setStorage).not.toHaveBeenCalled()

    backup.settings.globalEnabled = true
    await chromeBadgeV3({ kind: 'v3-hit', rule_id: 'unknown', match_url: '/api', method: 'POST' })
    await chromeBadgeV3({ kind: 'v3-hit', rule_id: 'v3-rule', match_url: '/wrong', method: 'POST' })
    await chromeBadgeV3({ kind: 'v3-hit', rule_id: 'v3-rule', match_url: '/api', method: 'GET' })
    expect(mocks.setStorage).not.toHaveBeenCalled()
  })

  it('continues counting after a storage write fails', async () => {
    const backup = {
      formatVersion: 3,
      settings: { globalEnabled: true },
      rules: [
        {
          id: 'v3-rule',
          enabled: true,
          match: { url: '/api', method: 'POST' },
          response: { enabled: true, replace: {} },
        },
      ],
    }
    let counters: Record<string, number> = {}
    mocks.getRealStorage.mockImplementation(async (key) => {
      if (key === 'v3-config') return backup
      if (key === 'v3-hits') return counters
      return undefined
    })
    mocks.setStorage
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockImplementation(async (_key, value) => {
        counters = value
      })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('chrome', {
      action: { setBadgeText: vi.fn(), setBadgeBackgroundColor: vi.fn() },
    })
    const hit = { kind: 'v3-hit' as const, rule_id: 'v3-rule', match_url: '/api', method: 'POST' }

    await chromeBadgeV3(hit)
    await chromeBadgeV3(hit)

    expect(counters).toEqual({ 'v3-rule': 1 })
    expect(consoleError).toHaveBeenCalledOnce()
  })
})
