import { afterEach, describe, expect, it, vi } from 'vitest'

const { createPanel } = vi.hoisted(() => ({ createPanel: vi.fn() }))
vi.mock('../src/service-worker/panel', () => ({ createPanel }))
import { handlePopupMessage } from '../src/service-worker/popup'

const sender = {
  id: 'test-extension',
  url: 'chrome-extension://test-extension/panels-v3/popup.html',
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

function installRuntime() {
  vi.stubGlobal('chrome', {
    runtime: {
      id: sender.id,
      getURL: (path: string) => `chrome-extension://${sender.id}/${path}`,
    },
  })
}

describe('quick popup panel requests', () => {
  it('opens the selected action editor from the trusted popup', async () => {
    installRuntime()
    createPanel.mockResolvedValue(undefined)
    const reply = vi.fn()
    expect(
      handlePopupMessage(
        { type: 'ajax-proxy:open-panel', ruleId: 'rule-1', action: 'redirect' },
        sender,
        reply
      )
    ).toBe(true)
    await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({ ok: true }))
    expect(createPanel).toHaveBeenCalledWith('rule-1', 'redirect')
  })

  it('rejects web content, other extensions, invalid IDs and extra fields', () => {
    installRuntime()
    const request = { type: 'ajax-proxy:open-panel' }
    const reply = vi.fn()
    expect(handlePopupMessage(request, { ...sender, url: 'https://example.test' }, reply)).toBe(
      false
    )
    expect(handlePopupMessage(request, { ...sender, id: 'another' }, reply)).toBe(false)
    expect(handlePopupMessage({ ...request, ruleId: '' }, sender, reply)).toBe(false)
    expect(handlePopupMessage({ ...request, ruleId: 1 }, sender, reply)).toBe(false)
    expect(handlePopupMessage({ ...request, action: 'redirect' }, sender, reply)).toBe(false)
    expect(
      handlePopupMessage({ ...request, ruleId: 'rule-1', action: 'other' }, sender, reply)
    ).toBe(false)
    expect(handlePopupMessage({ ...request, unexpected: true }, sender, reply)).toBe(false)
    expect(createPanel).not.toHaveBeenCalled()
  })

  it('reports a panel opening failure without an unhandled rejection', async () => {
    installRuntime()
    createPanel.mockRejectedValue(new Error('window denied; tab denied'))
    const reply = vi.fn()
    handlePopupMessage({ type: 'ajax-proxy:open-panel' }, sender, reply)
    await vi.waitFor(() =>
      expect(reply).toHaveBeenCalledWith({
        ok: false,
        error: 'panel-open-failed',
        details: 'window denied; tab denied',
      })
    )
  })
})
