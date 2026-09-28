import { describe, expect, it, vi } from 'vitest'
import { createActiveTabOriginService } from '../src/services/activeTabOrigin.js'

function createEvent() {
  const listeners = new Set()
  return {
    addListener: vi.fn((listener) => listeners.add(listener)),
    removeListener: vi.fn((listener) => listeners.delete(listener)),
    emit(...args) {
      for (const listener of listeners) listener(...args)
    },
  }
}

function createTabs(query) {
  return {
    query: vi.fn(query),
    onActivated: createEvent(),
    onUpdated: createEvent(),
  }
}

describe('active tab origin service', () => {
  it('reports the origin of the active tab and refreshes for activation and URL changes', async () => {
    const tabs = createTabs(async () => [{ url: 'https://api.example.com:8443/path?q=1' }])
    const service = createActiveTabOriginService(tabs)
    const listener = vi.fn()
    const remove = service.subscribe(listener)

    await vi.waitFor(() =>
      expect(listener).toHaveBeenLastCalledWith('https://api.example.com:8443')
    )
    tabs.onActivated.emit({ tabId: 9, windowId: 3 })
    tabs.onUpdated.emit(
      9,
      { url: 'https://api.example.com/next' },
      { url: 'https://api.example.com/next' }
    )
    await vi.waitFor(() => expect(tabs.query).toHaveBeenCalledTimes(3))

    remove()
    expect(tabs.onActivated.removeListener).toHaveBeenCalledTimes(1)
    expect(tabs.onUpdated.removeListener).toHaveBeenCalledTimes(1)
  })

  it('clears the origin for restricted URLs, missing tabs, and query errors', async () => {
    const tabs = createTabs(vi.fn().mockResolvedValueOnce([{ url: 'chrome://extensions/' }]))
    const listener = vi.fn()
    createActiveTabOriginService(tabs).subscribe(listener)
    await vi.waitFor(() => expect(listener).toHaveBeenLastCalledWith(''))

    tabs.query.mockResolvedValueOnce([])
    tabs.onActivated.emit({ tabId: 9, windowId: 3 })
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2))

    tabs.query.mockRejectedValueOnce(new Error('restricted'))
    tabs.onActivated.emit({ tabId: 9, windowId: 3 })
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(3))
    expect(listener).toHaveBeenLastCalledWith('')
  })

  it('does not refresh for an update without an active tab or URL change', async () => {
    const tabs = createTabs(async () => [{ url: 'https://example.com' }])
    createActiveTabOriginService(tabs).subscribe(vi.fn())
    await vi.waitFor(() => expect(tabs.query).toHaveBeenCalledTimes(1))

    tabs.onUpdated.emit(9, { status: 'complete' }, { active: false })
    expect(tabs.query).toHaveBeenCalledTimes(1)
  })

  it('does not emit results after cleanup and tolerates unavailable tabs', async () => {
    let resolveQuery
    const tabs = createTabs(() => new Promise((resolve) => (resolveQuery = resolve)))
    const listener = vi.fn()
    const remove = createActiveTabOriginService(tabs).subscribe(listener)
    await vi.waitFor(() => expect(tabs.query).toHaveBeenCalledTimes(1))
    remove()
    resolveQuery([{ url: 'https://example.com' }])
    await Promise.resolve()
    expect(listener).not.toHaveBeenCalled()
    expect(createActiveTabOriginService(null).subscribe(listener)()).toBeUndefined()
  })
})
