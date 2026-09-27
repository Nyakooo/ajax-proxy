import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Popup from '../src/Popup.vue'

const revision = `sha256:${'a'.repeat(64)}`
const makeConfig = () => ({
  format: 'ajax-proxy-backup', formatVersion: 8,
  settings: { globalEnabled: true, mode: 'interceptor', language: 'en' },
  tags: [{ id: 'team', name: 'Team', used: true }], disabledOrigins: [],
  rules: [
    { id: 'r1', enabled: true, match: { method: 'GET', url: '/api/profile' }, request: { enabled: true, redirect: { url: '/new' } }, tagIds: ['team'] },
    { id: 'r2', enabled: false, pinned: true, match: { method: 'POST', url: '/api/orders' }, response: { enabled: true, replace: { body: {} } } },
  ],
})

function setup({ saveConfig = vi.fn(async () => ({ ok: true, revision: `sha256:${'b'.repeat(64)}` })), snapshotConfig = makeConfig() } = {}) {
  const listener = vi.fn()
  const service = {
    getSnapshot: vi.fn(async () => ({ ok: true, snapshot: { config: snapshotConfig, hitCounters: { r1: 3 }, revision } })),
    saveConfig,
    subscribe: vi.fn((fn) => { listener.mockImplementation(fn); return vi.fn() }),
  }
  const wrapper = mount(Popup, { props: { service } })
  return { wrapper, service, listener }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.removeItem('ajax-proxy:ui:theme')
  document.documentElement.classList.remove('app-dark')
  document.body.innerHTML = ''
})

describe('Popup', () => {
  it('loads all rules, filters by domain search fields and supports pinned only', async () => {
    const { wrapper } = setup()
    await flushPromises()
    expect(wrapper.findAll('.rule-card')).toHaveLength(2)
    expect(wrapper.findAll('.rule-card .rule-url').map((node) => node.text())).toEqual(['/api/orders', '/api/profile'])
    expect(wrapper.text()).toContain('3 hits')

    await wrapper.get('input[type="search"]').setValue('method:GET team')
    expect(wrapper.findAll('.rule-card')).toHaveLength(1)
    expect(wrapper.text()).toContain('/api/profile')

    await wrapper.get('input[type="search"]').setValue('')
    await wrapper.get('.pinned-filter input').setValue(true)
    expect(wrapper.findAll('.rule-card')).toHaveLength(1)
    expect(wrapper.text()).toContain('/api/orders')
  })

  it('saves pinning and deletes only after an explicit confirmation', async () => {
    const { wrapper, service } = setup()
    await flushPromises()
    await wrapper.get('[aria-label="Pin rule"]').trigger('click')
    await flushPromises()
    expect(service.saveConfig).toHaveBeenCalledWith(
      expect.objectContaining({ rules: expect.arrayContaining([expect.objectContaining({ id: 'r1', pinned: true })]) }), revision
    )

    await wrapper.get('[aria-label="Delete rule: /api/profile"]').trigger('click')
    expect(service.saveConfig).toHaveBeenCalledTimes(1)
    await wrapper.get('.confirm-delete').trigger('click')
    await flushPromises()
    expect(service.saveConfig).toHaveBeenCalledTimes(2)
    expect(service.saveConfig.mock.calls[1][0].rules.map((rule: { id: string }) => rule.id)).toEqual(['r2'])
  })

  it('keeps the displayed configuration after a failed save', async () => {
    const saveConfig = vi.fn(async () => ({ ok: false, error: 'storage-write-failed' }))
    const { wrapper, service, listener } = setup({ saveConfig })
    await flushPromises()
    saveConfig.mockImplementation(async () => {
      await listener({ key: 'ajax-proxy:notice:v3-config' })
      return { ok: false, error: 'storage-write-failed' }
    })
    await wrapper.get('.global-switch input').setValue(false)
    await flushPromises()
    expect((wrapper.get('.global-switch input').element as HTMLInputElement).checked).toBe(true)
    expect(wrapper.get('[role="alert"]').text()).toContain('Could not save')
    expect(service.getSnapshot).toHaveBeenCalledTimes(2)
  })

  it('opens rule editing through the runtime message and uses local language', async () => {
    const sendMessage = vi.fn()
    vi.stubGlobal('chrome', { runtime: { sendMessage } })
    const { wrapper } = setup()
    await flushPromises()
    await wrapper.get('[aria-label="Edit rule: /api/profile"]').trigger('click')
    expect(sendMessage).toHaveBeenCalledWith({ type: 'ajax-proxy:open-panel', ruleId: 'r1' })
    expect(wrapper.text()).toContain('Enable Ajax Proxy')
  })

  it('uses Chinese for a fresh install with no saved configuration', async () => {
    const { wrapper } = setup({ snapshotConfig: null })
    await flushPromises()
    expect(wrapper.attributes('lang')).toBe('zh-CN')
    expect(wrapper.get('.global-switch').text()).toContain('启用 Ajax Proxy')
  })

  it('returns no runtime response for snapshot requests handled by another view', async () => {
    const { wrapper, service, listener } = setup()
    await flushPromises()
    const before = service.getSnapshot.mock.calls.length
    const response = listener({
      from: 'ajax-proxy:notice:from:panels',
      to: 'ajax-proxy:notice:to:service-worker',
      key: 'ajax-proxy:notice:v3:get-snapshot',
    })
    expect(response).toBeUndefined()
    expect(service.getSnapshot).toHaveBeenCalledTimes(before)
    wrapper.unmount()
  })

  it('shows an error when the background rejects opening a panel or does not respond', async () => {
    vi.stubGlobal('chrome', { runtime: { sendMessage: vi.fn(async () => ({ ok: false })) } })
    const { wrapper } = setup()
    await flushPromises()
    await wrapper.get('[aria-label="Edit rule: /api/profile"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Could not open')

    vi.stubGlobal('chrome', { runtime: {} })
    await wrapper.get('.footer-primary').trigger('click')
    expect(wrapper.get('[role="alert"]').text()).toContain('Could not open')
  })

  it('shows shortcut tab creation failures', async () => {
    vi.stubGlobal('chrome', { runtime: {}, tabs: { create: vi.fn(async () => { throw new Error('denied') }) } })
    const { wrapper } = setup()
    await flushPromises()
    await wrapper.get('.footer-secondary').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Could not open')
  })

  it('follows the selected dark theme, including the document class and logo', async () => {
    const { wrapper } = setup()
    await flushPromises()
    const lightLogo = wrapper.get('.brand-mark').attributes('src')
    await wrapper.get('.theme-select select').setValue('dark')
    await flushPromises()
    expect(wrapper.classes()).toContain('popup-dark')
    expect(document.documentElement.classList.contains('app-dark')).toBe(true)
    expect(wrapper.get('.brand-mark').attributes('src')).not.toBe(lightLogo)
  })
})
