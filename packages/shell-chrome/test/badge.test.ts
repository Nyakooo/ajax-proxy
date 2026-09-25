import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getRealStorage: vi.fn(),
  setStorage: vi.fn(),
  noticePanelsByServiceWorker: vi.fn(),
}))

vi.mock('@proxy/shared-utils', () => ({
  NoticeKey: { HIT_RATE: 'hit-rate' },
  StorageKey: { GLOBAL_SWITCH: 'global-switch', MODE: 'mode', INTERCEPT_LIST: 'intercept-list' },
  getRealStorage: mocks.getRealStorage,
  setStorage: mocks.setStorage,
  noticePanelsByServiceWorker: mocks.noticePanelsByServiceWorker,
}))

vi.mock('../src/service-worker/notice', () => ({ chromeNativeNotice: vi.fn() }))

import { chromeBadge } from '../src/service-worker/badge'

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
})
