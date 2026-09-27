/* eslint-disable vue/one-component-per-file */
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { V3_BACKUP_VERSION } from '@proxy/v3-domain'
import { NoticeFrom, NoticeKey, NoticeTo, V3PanelMessageKey } from '@proxy/protocol'
import { i18n } from '../src/i18n/index.js'

const AppButton = defineComponent({
  props: { label: { type: String, default: '' } },
  emits: ['click'],
  setup(props, { emit }) {
    return () =>
      h('button', { type: 'button', onClick: (event) => emit('click', event) }, props.label)
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
const initialRevision = `sha256:${'a'.repeat(64)}`
const savedRevision = `sha256:${'b'.repeat(64)}`

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

async function mountApp(saveResponses = [], startingConfig = initialConfig()) {
  i18n.global.locale.value = 'zh-CN'
  previousChrome = globalThis.chrome
  let storedConfig = structuredClone(startingConfig)
  let storedRevision = initialRevision
  let extensionMessageListener
  const sentMessages = []
  const sendMessage = vi.fn(async (message) => {
    sentMessages.push(message)
    if (message.key === V3PanelMessageKey.GET_SNAPSHOT) {
      return {
        ok: true,
        snapshot: { config: storedConfig, hitCounters: {}, revision: storedRevision },
      }
    }
    if (message.key === V3PanelMessageKey.SAVE_CONFIG) {
      const response = saveResponses.shift() ?? { ok: true }
      if (response.error === 'config-conflict') {
        storedConfig = response.current.config
        storedRevision = response.current.revision
        return response
      }
      if (response.ok) {
        storedConfig = message.value.config
        storedRevision = savedRevision
        return { ...response, revision: storedRevision }
      }
      return response
    }
    throw new Error(`Unexpected extension message: ${message.key}`)
  })
  globalThis.chrome = {
    runtime: {
      sendMessage,
      onMessage: {
        addListener(listener) {
          extensionMessageListener = listener
        },
        removeListener(listener) {
          if (extensionMessageListener === listener) extensionMessageListener = undefined
        },
      },
    },
  } as typeof chrome

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
  return {
    wrapper: mountedWrapper,
    sentMessages,
    sendExtensionMessage(message) {
      if (!extensionMessageListener) throw new Error('No extension message listener is registered')
      extensionMessageListener(message)
    },
  }
}

function buttonByText(wrapper, text) {
  const button = wrapper.findAll('button').find((candidate) => candidate.text() === text)
  if (!button) throw new Error(`Could not find button: ${text}`)
  return button
}

describe('App dialog focus return', () => {
  it('returns focus to each toolbar trigger when its dialog closes', async () => {
    const { wrapper } = await mountApp()

    const siteTrigger = buttonByText(wrapper, '站点开关')
    await siteTrigger.trigger('click')
    await flushPromises()
    await wrapper.get('.site-switches-dialog').trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(document.activeElement).toBe(siteTrigger.element)

    const templatesTrigger = buttonByText(wrapper, '规则模板')
    await templatesTrigger.trigger('click')
    await flushPromises()
    await wrapper.get('.rule-templates-dialog').trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(document.activeElement).toBe(templatesTrigger.element)

    const backupTrigger = buttonByText(wrapper, '备份 / 恢复')
    await backupTrigger.trigger('click')
    await flushPromises()
    await wrapper.get('.backup-dialog').trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(document.activeElement).toBe(backupTrigger.element)
  })
})

describe('App rule filter focus return', () => {
  it('returns focus to the filter trigger when Escape closes its popover', async () => {
    const { wrapper } = await mountApp()
    const trigger = buttonByText(wrapper, '筛选')
    trigger.element.focus()

    await trigger.trigger('click')
    await flushPromises()
    expect(trigger.attributes('aria-expanded')).toBe('true')
    await wrapper.get('.rule-filter-popover').trigger('keydown', { key: 'Escape' })
    await flushPromises()

    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger.element)
  })
})

describe('App no-match diagnostics localization', () => {
  it('localizes no-match controls and reason labels in the selected language', async () => {
    const startingConfig = {
      ...initialConfig(),
      rules: [
        {
          id: 'known-rule',
          enabled: true,
          match: { url: '/expected', method: 'POST', type: 'normal' },
          response: { enabled: true, replace: { body: '{"ok":true}' } },
        },
      ],
    }
    const { wrapper, sendExtensionMessage } = await mountApp([], startingConfig)

    sendExtensionMessage({
      from: NoticeFrom.SERVICE_WORKER,
      to: NoticeTo.PANELS,
      key: NoticeKey.V3_NO_MATCH,
      value: {
        kind: 'v3-no-match',
        method: 'GET',
        rules: [{ rule_id: 'known-rule', reason: 'method-mismatch' }],
        truncated: false,
      },
    })
    sendExtensionMessage({
      from: NoticeFrom.SERVICE_WORKER,
      to: NoticeTo.PANELS,
      key: NoticeKey.V3_FETCH_OUTCOME,
      value: {
        kind: 'v3-fetch-outcome',
        correlation_id: 'smoke-outcome-id',
        rule_id: 'known-rule',
        stage: 'response',
        outcome: 'applied',
        reason: 'response-replacement-applied',
      },
    })
    sendExtensionMessage({
      from: NoticeFrom.SERVICE_WORKER,
      to: NoticeTo.PANELS,
      key: NoticeKey.V3_FETCH_OUTCOME,
      value: {
        kind: 'v3-xhr-outcome',
        correlation_id: 'smoke-xhr-outcome-id',
        rule_id: 'known-rule',
        stage: 'response',
        outcome: 'failed',
        reason: 'response-replacement-failed',
      },
    })
    await flushPromises()

    const diagnostics = wrapper.get('.no-match-diagnostics')
    const outcomes = wrapper.get('.fetch-outcome-diagnostics')
    expect(diagnostics.text()).toContain('未命中诊断')
    expect(diagnostics.text()).toContain('捕获下一条未匹配请求')
    expect(diagnostics.text()).toContain('请求方法不匹配')
    expect(diagnostics.text()).not.toContain('method-mismatch')
    expect(outcomes.text()).toContain('Fetch · 响应阶段 · 已应用 · 响应已替换')
    expect(outcomes.text()).toContain('Fetch / XHR 动作结果')
    expect(outcomes.text()).toContain('捕获 Fetch / XHR 动作结果')
    expect(outcomes.text()).toContain('关联 ID:')
    expect(outcomes.text()).toContain('XHR · 响应阶段 · 失败 · 响应替换失败，已使用原始响应')
    expect(outcomes.text()).not.toContain('response-replacement-applied')
    expect(outcomes.text()).not.toContain('response-replacement-failed')

    await wrapper.get('.language-toggle button[aria-label="English"]').trigger('click')

    expect(diagnostics.text()).toContain('No-match diagnostics')
    expect(diagnostics.text()).toContain('Capture the next unmatched request')
    expect(diagnostics.text()).toContain('Request method does not match')
    expect(diagnostics.text()).not.toContain('method-mismatch')
    expect(outcomes.text()).toContain('Fetch · Response · Applied · Response replaced')
    expect(outcomes.text()).toContain(
      'XHR · Response · Failed · Response replacement failed; original response used'
    )
    expect(outcomes.text()).toContain('Fetch / XHR action outcomes')
    expect(outcomes.text()).toContain('Capture Fetch / XHR action outcomes')
    expect(outcomes.text()).toContain('Correlation ID:')
    expect(outcomes.text()).not.toContain('response-replacement-applied')
    expect(outcomes.text()).not.toContain('response-replacement-failed')
  })
})

describe('App site switch persistence flow', () => {
  it('persists only the normalized origin and removes it when re-enabled', async () => {
    const { wrapper, sentMessages } = await mountApp()

    const siteTrigger = buttonByText(wrapper, '站点开关')
    await siteTrigger.trigger('click')
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
    expect(document.activeElement).toBe(siteTrigger.element)

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

describe('App redirect exclusion persistence flow', () => {
  it('saves edited exclusions into the V3 snapshot', async () => {
    const { wrapper, sentMessages } = await mountApp()

    const redirectNavigation = wrapper
      .findAll('.nav-item')
      .find((button) => button.text().includes('重定向规则'))
    expect(redirectNavigation).toBeDefined()
    await redirectNavigation!.trigger('click')
    await buttonByText(wrapper, '创建重定向规则').trigger('click')
    await wrapper
      .get('.rule-editor form')
      .findAll('input:not([type="checkbox"]):not([type="radio"])')[0]
      .setValue('/api')
    await wrapper
      .get('.rule-editor form')
      .findAll('input:not([type="checkbox"]):not([type="radio"])')[1]
      .setValue('/target')
    await wrapper.get('[data-testid="redirect-exclusions"]').setValue('/health\nskip=1')
    await wrapper.get('.rule-editor form').trigger('submit')
    await flushPromises()

    const save = sentMessages.find((message) => message.key === V3PanelMessageKey.SAVE_CONFIG)
    expect(save.value.config.rules[0].request.redirect).toEqual({
      url: '/target',
      exclusions: ['/health', 'skip=1'],
    })
  })

  it('persists a function redirect as a disabled V3 action after code confirmation', async () => {
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    const { wrapper, sentMessages } = await mountApp()

    const redirectNavigation = wrapper
      .findAll('.nav-item')
      .find((button) => button.text().includes('重定向规则'))
    await redirectNavigation!.trigger('click')
    await buttonByText(wrapper, '创建重定向规则').trigger('click')
    await wrapper
      .get('.rule-editor form')
      .find('input[name="redirect-mode"][value="function"]')
      .setValue(true)
    await flushPromises()
    await wrapper
      .get('.rule-editor form')
      .findAll('input:not([type="checkbox"]):not([type="radio"])')[0]
      .setValue('/api')
    await wrapper.get('.rule-editor form').trigger('submit')
    await flushPromises()

    const save = sentMessages.find((message) => message.key === V3PanelMessageKey.SAVE_CONFIG)
    expect(save.value.config.formatVersion).toBe(7)
    expect(save.value.config.rules[0].request).toEqual({
      enabled: false,
      redirect: { type: 'function', code: 'return request.url' },
    })
    expect(globalThis.confirm).toHaveBeenCalledTimes(1)
  })
})

describe('App concurrent configuration conflict flow', () => {
  it('requires confirmation before loading the latest config after a conflict', async () => {
    const remoteConfig = {
      ...initialConfig(),
      settings: { ...initialConfig().settings, globalEnabled: false },
    }
    const remoteRevision = `sha256:${'c'.repeat(64)}`
    const { wrapper, sentMessages } = await mountApp([
      {
        ok: false,
        error: 'config-conflict',
        current: { config: remoteConfig, revision: remoteRevision },
      },
    ])
    const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValue(false)

    await wrapper.get('[role="switch"][aria-label="全局启用 Ajax Proxy"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('.operation-alert').text()).toContain('配置已在其他面板中更新')
    expect(wrapper.get('.operation-alert').text()).toContain('加载最新配置')
    expect(sentMessages.at(-1).value.expectedRevision).toBe(initialRevision)

    await buttonByText(wrapper, '加载最新配置').trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalledOnce()
    expect(wrapper.get('.operation-alert').exists()).toBe(true)

    confirm.mockReturnValue(true)
    await buttonByText(wrapper, '加载最新配置').trigger('click')
    await flushPromises()
    expect(wrapper.find('.operation-alert').exists()).toBe(false)
    expect(
      wrapper.get('[role="switch"][aria-label="全局启用 Ajax Proxy"]').attributes('aria-checked')
    ).toBe('false')
    expect(
      sentMessages.filter((message) => message.key === V3PanelMessageKey.GET_SNAPSHOT)
    ).toHaveLength(2)
  })
})

describe('App backup restore persistence flow', () => {
  it('keeps the current config after a failed restore and applies the normalized backup on retry', async () => {
    const { wrapper, sentMessages } = await mountApp([
      { ok: false, error: 'storage-write-failed' },
      { ok: true },
    ])
    const backup = {
      format: 'ajax-proxy-backup',
      formatVersion: V3_BACKUP_VERSION,
      settings: { globalEnabled: false, mode: 'interceptor', language: 'en' },
      tags: [],
      rules: [
        {
          id: 'restored-json-rule',
          enabled: true,
          match: { url: '/restored', method: 'GET', type: 'normal' },
          response: { enabled: true, replace: { body: '{"restored":true}' } },
        },
      ],
      disabledOrigins: ['https://blocked.example'],
    }
    const expectedConfig = {
      ...backup,
      rules: [
        {
          ...backup.rules[0],
          response: {
            ...backup.rules[0].response,
            enabled: true,
          },
        },
      ],
    }

    const backupTrigger = buttonByText(wrapper, '备份 / 恢复')
    await backupTrigger.trigger('click')
    await wrapper.get('[data-testid="backup-json-input"]').setValue(JSON.stringify(backup))
    await buttonByText(wrapper, '验证备份').trigger('click')
    await flushPromises()
    expect(wrapper.find('.backup-valid').exists()).toBe(true)

    const restoreButton = wrapper.get('[data-testid="backup-restore-button"]')
    await restoreButton.trigger('click')
    await flushPromises()

    const saves = () =>
      sentMessages.filter((message) => message.key === V3PanelMessageKey.SAVE_CONFIG)
    expect(saves()).toHaveLength(1)
    expect(saves()[0].value.config).toEqual(expectedConfig)
    expect(wrapper.get('[role="dialog"]').exists()).toBe(true)
    expect(
      wrapper.get('[role="switch"][aria-label="全局启用 Ajax Proxy"]').attributes('aria-checked')
    ).toBe('true')
    expect(wrapper.get('[aria-label="界面语言"]').find('[aria-pressed="true"]').text()).toBe('中')
    expect(wrapper.find('.rule-row').exists()).toBe(false)
    expect(wrapper.get('.operation-alert').text()).toContain('storage-write-failed')

    await wrapper.get('[data-testid="backup-restore-button"]').trigger('click')
    await flushPromises()

    expect(saves()).toHaveLength(2)
    expect(saves()[1].value.config).toEqual(expectedConfig)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(
      wrapper
        .get('[role="switch"][aria-label="Enable Ajax Proxy globally"]')
        .attributes('aria-checked')
    ).toBe('false')
    expect(
      wrapper.get('[aria-label="Interface language"]').find('[aria-pressed="true"]').text()
    ).toBe('EN')
    expect(wrapper.get('.rule-row').text()).toContain('/restored')
    expect(document.activeElement).toBe(backupTrigger.element)
  })

  it('retries an append import without replacing config and remaps same-name tags', async () => {
    const existingConfig = {
      ...initialConfig(),
      settings: { globalEnabled: true, mode: 'interceptor', language: 'zh-CN' },
      tags: [{ id: 'current-tag', name: 'Shared', used: true }],
      rules: [
        {
          id: 'existing-rule',
          enabled: true,
          match: { url: '/existing', method: 'GET', type: 'normal' },
          response: { enabled: true, replace: { body: '{"existing":true}' } },
        },
      ],
      disabledOrigins: ['https://existing-block.example'],
    }
    const { wrapper, sentMessages } = await mountApp(
      [{ ok: false, error: 'storage-write-failed' }, { ok: true }],
      existingConfig
    )
    const backup = {
      format: 'ajax-proxy-backup',
      formatVersion: V3_BACKUP_VERSION,
      settings: { globalEnabled: false, mode: 'redirector', language: 'en' },
      tags: [{ id: 'imported-tag', name: 'shared', used: true }],
      rules: [
        {
          ...existingConfig.rules[0],
          response: { enabled: true, replace: { body: '{"overwritten":true}' } },
        },
        {
          id: 'imported-rule',
          enabled: true,
          tagIds: ['imported-tag'],
          match: { url: '/imported', method: 'GET', type: 'normal' },
          response: { enabled: true, replace: { body: '{"imported":true}' } },
        },
      ],
      disabledOrigins: ['https://imported-block.example'],
    }
    const expectedConfig = {
      ...existingConfig,
      tags: [{ id: 'current-tag', name: 'Shared', used: true }],
      rules: [existingConfig.rules[0], { ...backup.rules[1], tagIds: ['current-tag'] }],
    }

    await buttonByText(wrapper, '备份 / 恢复').trigger('click')
    await wrapper.get('[data-testid="backup-json-input"]').setValue(JSON.stringify(backup))
    await buttonByText(wrapper, '验证备份').trigger('click')
    await flushPromises()
    expect(wrapper.find('.backup-valid').exists()).toBe(true)
    expect(
      wrapper.get('[data-testid="backup-import-rules-button"]').attributes('disabled')
    ).toBeUndefined()

    await wrapper.get('[data-testid="backup-import-rules-button"]').trigger('click')
    await flushPromises()

    const saves = () =>
      sentMessages.filter((message) => message.key === V3PanelMessageKey.SAVE_CONFIG)
    expect(saves()).toHaveLength(1)
    expect(saves()[0].value.config).toEqual(expectedConfig)
    expect(wrapper.get('[role="dialog"]').exists()).toBe(true)
    expect(
      wrapper.get('[role="switch"][aria-label="全局启用 Ajax Proxy"]').attributes('aria-checked')
    ).toBe('true')
    expect(wrapper.get('[aria-label="界面语言"]').find('[aria-pressed="true"]').text()).toBe('中')
    expect(wrapper.findAll('.rule-row')).toHaveLength(1)
    expect(wrapper.get('.rule-row').text()).toContain('/existing')
    expect(wrapper.get('.operation-alert').text()).toContain('storage-write-failed')

    await wrapper.get('[data-testid="backup-import-rules-button"]').trigger('click')
    await flushPromises()

    expect(saves()).toHaveLength(2)
    expect(saves()[1].value.config).toEqual(expectedConfig)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.findAll('.rule-row')).toHaveLength(2)
    expect(wrapper.findAll('.rule-row').some((row) => row.text().includes('/imported'))).toBe(true)
  })
})
