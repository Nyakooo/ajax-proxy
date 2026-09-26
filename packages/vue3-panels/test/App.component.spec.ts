/* eslint-disable vue/one-component-per-file */
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { V3_BACKUP_VERSION } from '@proxy/v3-domain'
import { V3PanelMessageKey } from '@proxy/protocol'
import { i18n } from '../src/i18n/index.js'

const AppButton = defineComponent({
  props: { label: { type: String, default: '' } },
  emits: ['click'],
  setup(props, { emit }) {
    return () => h('button', { type: 'button', onClick: () => emit('click') }, props.label)
  },
})

const ToggleSwitch = defineComponent({
  props: {
    modelValue: { type: Boolean, default: false },
    ariaLabel: { type: String, default: '' },
    disabled: { type: Boolean, default: false },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h(
        'button',
        {
          type: 'button',
          role: 'switch',
          'aria-label': props.ariaLabel,
          'aria-checked': String(props.modelValue),
          disabled: props.disabled,
          onClick: () => emit('update:modelValue', !props.modelValue),
        },
        String(props.modelValue)
      )
  },
})

const passthrough = defineComponent({
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => h('span', attrs, slots.default?.())
  },
})

const initialConfig = () => ({
  format: 'ajax-proxy-backup',
  formatVersion: V3_BACKUP_VERSION,
  settings: { globalEnabled: true, mode: 'interceptor', language: 'zh-CN' },
  tags: [],
  rules: [],
  disabledOrigins: [],
})

let mountedWrapper
let previousChrome

afterEach(() => {
  mountedWrapper?.unmount()
  mountedWrapper = undefined
  if (previousChrome === undefined) delete globalThis.chrome
  else globalThis.chrome = previousChrome
  previousChrome = undefined
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

async function mountApp(saveResponses = []) {
  previousChrome = globalThis.chrome
  let storedConfig = initialConfig()
  const sentMessages = []
  const sendMessage = vi.fn(async (message) => {
    sentMessages.push(message)
    if (message.key === V3PanelMessageKey.GET_SNAPSHOT) {
      return { ok: true, snapshot: { config: storedConfig, hitCounters: {} } }
    }
    if (message.key === V3PanelMessageKey.SAVE_CONFIG) {
      const response = saveResponses.shift() ?? { ok: true }
      if (response.ok) storedConfig = message.value.config
      return response
    }
    throw new Error(`Unexpected extension message: ${message.key}`)
  })
  globalThis.chrome = { runtime: { sendMessage } } as typeof chrome

  vi.resetModules()
  const { default: App } = await import('../src/App.vue')
  mountedWrapper = mount(App, {
    attachTo: document.body,
    global: {
      plugins: [i18n],
      components: {
        AppButton,
        AppTag: passthrough,
        ToggleSwitch,
        InputText: passthrough,
      },
    },
  })
  await flushPromises()
  await vi.waitFor(() => expect(sentMessages.length).toBeGreaterThan(0))
  await flushPromises()
  return { wrapper: mountedWrapper, sentMessages }
}

function buttonByText(wrapper, text) {
  const button = wrapper.findAll('button').find((candidate) => candidate.text() === text)
  if (!button) throw new Error(`Could not find button: ${text}`)
  return button
}

describe('App site switch persistence flow', () => {
  it('persists only the normalized origin and removes it when re-enabled', async () => {
    const { wrapper, sentMessages } = await mountApp()

    await buttonByText(wrapper, '站点开关').trigger('click')
    await flushPromises()
    await wrapper.get('#site-switch-origin').setValue('https://example.com:8443/path?private=value')
    await wrapper.get('.site-switch-form').trigger('submit')
    await flushPromises()

    const saves = () =>
      sentMessages.filter((message) => message.key === V3PanelMessageKey.SAVE_CONFIG)
    expect(saves()).toHaveLength(1)
    expect(saves()[0].value.config.disabledOrigins).toEqual(['https://example.com:8443'])
    expect(JSON.stringify(saves()[0].value.config)).not.toContain('/path?private=value')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)

    await buttonByText(wrapper, '站点开关').trigger('click')
    await flushPromises()
    expect(wrapper.get('.disabled-origin-list').text()).toContain('https://example.com:8443')
    await wrapper.get('[aria-label="启用站点 https://example.com:8443"]').trigger('click')
    await flushPromises()

    expect(saves()).toHaveLength(2)
    expect(saves()[1].value.config.disabledOrigins).toEqual([])
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(wrapper.get('.site-switches-empty').exists()).toBe(true)
  })

  it('keeps the dialog open and shows an error when saving the disabled origin fails', async () => {
    const { wrapper, sentMessages } = await mountApp([{ ok: false, error: 'storage-write-failed' }])

    await buttonByText(wrapper, '站点开关').trigger('click')
    await flushPromises()
    await wrapper.get('#site-switch-origin').setValue('https://example.com/path?private=value')
    await wrapper.get('.site-switch-form').trigger('submit')
    await flushPromises()

    const save = sentMessages.find((message) => message.key === V3PanelMessageKey.SAVE_CONFIG)
    expect(save.value.config.disabledOrigins).toEqual(['https://example.com'])
    expect(JSON.stringify(save.value.config)).not.toContain('/path?private=value')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(wrapper.get('.operation-alert').text()).toContain('storage-write-failed')
    expect(wrapper.find('.disabled-origin-list').exists()).toBe(false)
  })
})

describe('App global switch persistence flow', () => {
  it('sends a disabled global setting and keeps the enabled UI after save failure', async () => {
    const { wrapper, sentMessages } = await mountApp([{ ok: false, error: 'storage-write-failed' }])
    const globalSwitch = wrapper.get('[role="switch"][aria-label="全局启用 Ajax Proxy"]')

    expect(globalSwitch.attributes('aria-checked')).toBe('true')
    expect(wrapper.find('.sidebar-footer').text()).toContain('正在监视当前页面')
    await globalSwitch.trigger('click')
    await flushPromises()

    const saves = sentMessages.filter((message) => message.key === V3PanelMessageKey.SAVE_CONFIG)
    expect(saves).toHaveLength(1)
    expect(saves[0].value.config.settings.globalEnabled).toBe(false)
    expect(
      wrapper.get('[role="switch"][aria-label="全局启用 Ajax Proxy"]').attributes('aria-checked')
    ).toBe('true')
    expect(wrapper.get('.enable-control').text()).toContain('代理已启用')
    expect(wrapper.find('.sidebar-footer').text()).toContain('正在监视当前页面')
    expect(wrapper.get('.operation-alert').text()).toContain('storage-write-failed')
  })

  it('updates the global switch and sidebar status after a successful save', async () => {
    const { wrapper, sentMessages } = await mountApp()
    const globalSwitch = wrapper.get('[role="switch"][aria-label="全局启用 Ajax Proxy"]')

    await globalSwitch.trigger('click')
    await flushPromises()

    const saves = sentMessages.filter((message) => message.key === V3PanelMessageKey.SAVE_CONFIG)
    expect(saves).toHaveLength(1)
    expect(saves[0].value.config.settings.globalEnabled).toBe(false)
    expect(
      wrapper.get('[role="switch"][aria-label="全局启用 Ajax Proxy"]').attributes('aria-checked')
    ).toBe('false')
    expect(wrapper.get('.enable-control').text()).toContain('代理已停用')
    expect(wrapper.find('.sidebar-footer').text()).toContain('规则暂不作用于页面')
  })
})
