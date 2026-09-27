/* eslint-disable vue/one-component-per-file */
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { V3_BACKUP_VERSION } from '@proxy/v3-domain'
import { NoticeFrom, NoticeKey, NoticeTo, V3PanelMessageKey } from '@proxy/protocol'
import { i18n } from '../src/i18n/index.js'
import RedirectRuleEditor from '../src/components/RedirectRuleEditor.vue'

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

const InputText = defineComponent({
  inheritAttrs: false,
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () =>
      h('input', {
        ...attrs,
        value: props.modelValue,
        onInput: (event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
      })
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
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  window.localStorage.removeItem('ajax-proxy:ui:theme')
  window.history.replaceState(null, '', '/')
})

async function mountApp(
  saveResponses = [],
  startingConfig = initialConfig(),
  stubs = {},
  startingHitCounters = {}
) {
  i18n.global.locale.value = 'zh-CN'
  previousChrome = globalThis.chrome
  let storedConfig = structuredClone(startingConfig)
  let storedRevision = initialRevision
  const extensionMessageListeners = new Set()
  const sentMessages = []
  const sendMessage = vi.fn(async (message) => {
    sentMessages.push(message)
    if (message.key === V3PanelMessageKey.GET_SNAPSHOT) {
      return {
        ok: true,
        snapshot: {
          config: storedConfig,
          hitCounters: structuredClone(startingHitCounters),
          revision: storedRevision,
        },
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
      id: 'test-extension-id',
      sendMessage,
      onMessage: {
        addListener(listener) {
          extensionMessageListeners.add(listener)
        },
        removeListener(listener) {
          extensionMessageListeners.delete(listener)
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
        InputText,
      },
      stubs,
    },
  })
  await flushPromises()
  await vi.waitFor(() => expect(sentMessages.length).toBeGreaterThan(0))
  await flushPromises()
  return {
    wrapper: mountedWrapper,
    sentMessages,
    getStoredConfig: () => structuredClone(storedConfig),
    sendExtensionMessage(message) {
      if (!extensionMessageListeners.size)
        throw new Error('No extension message listener is registered')
      for (const listener of extensionMessageListeners) listener(message)
    },
    sendRuntimeMessage(message, sender = { id: 'test-extension-id' }) {
      for (const listener of extensionMessageListeners) listener(message, sender)
    },
  }
}

describe('App rule edit requests', () => {
  it('opens a targeted edit only in the selected panel tab', async () => {
    const rule = {
      id: 'targeted-rule',
      enabled: true,
      match: { url: '/api/targeted', method: 'GET', type: 'normal' },
      request: { enabled: true, redirect: { url: '/target' } },
      response: { enabled: true, replace: { body: { ok: true } } },
    }
    const { wrapper, sendRuntimeMessage } = await mountApp([], {
      ...initialConfig(),
      rules: [rule],
    })
    globalThis.chrome.tabs = { getCurrent: vi.fn((callback) => callback({ id: 42 })) }
    sendRuntimeMessage({ type: 'ajax-proxy:edit-rule', ruleId: rule.id, targetTabId: 43 })
    await flushPromises()
    expect(wrapper.find('.response-rule-editor').exists()).toBe(false)
    sendRuntimeMessage({ type: 'ajax-proxy:edit-rule', ruleId: rule.id, targetTabId: 42 })
    await flushPromises()
    expect(wrapper.find('.response-rule-editor').exists()).toBe(true)
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    sendRuntimeMessage({
      type: 'ajax-proxy:edit-rule',
      ruleId: rule.id,
      targetTabId: 42,
      action: 'redirect',
    })
    await flushPromises()
    expect(wrapper.find('.response-rule-editor').exists()).toBe(false)
    expect(wrapper.find('.redirect-rule-editor').exists()).toBe(true)
  })

  it('opens the response editor from the edit query after loading config', async () => {
    window.history.replaceState(null, '', '/?edit=response-rule')
    const rule = {
      id: 'response-rule',
      enabled: true,
      match: { url: '/api/response', method: 'GET', type: 'normal' },
      response: { enabled: true, replace: { body: { ok: true } } },
    }
    const { wrapper } = await mountApp([], { ...initialConfig(), rules: [rule] })

    expect(wrapper.find('.response-rule-editor').exists()).toBe(true)
    expect(wrapper.find('.redirect-rule-editor').exists()).toBe(false)
  })

  it('opens the redirect editor for redirect-only rules and reports missing IDs', async () => {
    window.history.replaceState(null, '', '/?edit=redirect-rule')
    const rule = {
      id: 'redirect-rule',
      enabled: true,
      match: { url: '/api/redirect', method: 'GET', type: 'normal' },
      request: { enabled: true, redirect: { url: '/target' } },
    }
    const { wrapper } = await mountApp([], { ...initialConfig(), rules: [rule] })
    expect(wrapper.find('.redirect-rule-editor').exists()).toBe(true)
    expect(wrapper.find('.response-rule-editor').exists()).toBe(false)
  })

  it('reports an unknown edit query without saving config', async () => {
    window.history.replaceState(null, '', '/?edit=missing-rule')
    const { wrapper, sentMessages } = await mountApp()
    expect(wrapper.get('[role="alert"]').text()).toContain('未找到规则 ID「missing-rule」')
    expect(sentMessages.some((message) => message.key === V3PanelMessageKey.SAVE_CONFIG)).toBe(
      false
    )
  })

  it('accepts worker edit requests only from the extension without a tab sender', async () => {
    const rule = {
      id: 'combined-rule',
      enabled: true,
      match: { url: '/api/combined', method: 'GET', type: 'normal' },
      request: { enabled: true, redirect: { url: '/target' } },
      response: { enabled: true, replace: { body: { ok: true } } },
    }
    const { wrapper, sendRuntimeMessage } = await mountApp([], {
      ...initialConfig(),
      rules: [rule],
    })

    sendRuntimeMessage(
      { type: 'ajax-proxy:edit-rule', ruleId: rule.id },
      { id: 'test-extension-id', tab: { id: 1 } }
    )
    await flushPromises()
    expect(wrapper.find('.response-rule-editor').exists()).toBe(false)

    sendRuntimeMessage({ type: 'ajax-proxy:edit-rule', ruleId: rule.id })
    await flushPromises()
    expect(wrapper.find('.response-rule-editor').exists()).toBe(true)
    expect(wrapper.find('.redirect-rule-editor').exists()).toBe(false)
  })

  it('confirms before replacing a different unsaved editor from a worker request', async () => {
    window.history.replaceState(null, '', '/?edit=first-rule')
    const makeRule = (id: string) => ({
      id,
      enabled: true,
      match: { url: `/api/${id}`, method: 'GET', type: 'normal' },
      response: { enabled: true, replace: { body: { id } } },
    })
    const { wrapper, sendRuntimeMessage } = await mountApp([], {
      ...initialConfig(),
      rules: [makeRule('first-rule'), makeRule('second-rule')],
    })
    const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValue(false)
    const openSecond = () =>
      sendRuntimeMessage({ type: 'ajax-proxy:edit-rule', ruleId: 'second-rule' })

    openSecond()
    await flushPromises()
    expect(confirm).toHaveBeenCalledOnce()
    expect(wrapper.get('.response-rule-editor input[autocomplete="off"]').element.value).toBe(
      '/api/first-rule'
    )

    confirm.mockReturnValue(true)
    openSecond()
    await flushPromises()
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(wrapper.get('.response-rule-editor input[autocomplete="off"]').element.value).toBe(
      '/api/second-rule'
    )
  })
})

function buttonByText(wrapper, text) {
  const button = wrapper.findAll('button').find((candidate) => candidate.text() === text)
  if (!button) throw new Error(`Could not find button: ${text}`)
  return button
}

function navigationButtonByText(wrapper, text) {
  const button = wrapper
    .get('nav[aria-label="工作区"]')
    .findAll('.nav-item')
    .find((candidate) => candidate.text().includes(text))
  if (!button) throw new Error(`Could not find navigation item: ${text}`)
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

describe('App search keyboard shortcut', () => {
  it('does not move focus outside an open modal dialog', async () => {
    const { wrapper } = await mountApp()
    await buttonByText(wrapper, '备份 / 恢复').trigger('click')
    await flushPromises()

    const dialog = wrapper.get('.backup-dialog')
    const closeButton = dialog.get('.editor-close').element as HTMLButtonElement
    closeButton.focus()
    const shortcut = new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    closeButton.dispatchEvent(shortcut)

    expect(shortcut.defaultPrevented).toBe(false)
    expect(dialog.element.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).toBe(closeButton)
  })

  it('focuses search with either platform modifier and leaves other editors alone', async () => {
    const { wrapper } = await mountApp()
    const searchInput = wrapper.get('input[placeholder="搜索 URL、method 或备注"]')
    const metaShortcut = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })

    window.dispatchEvent(metaShortcut)

    expect(metaShortcut.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(searchInput.element)
    expect(wrapper.get('.search-box kbd').text()).toBe('Ctrl / ⌘ K')

    const nativeSearchInput = searchInput.element as HTMLInputElement
    nativeSearchInput.blur()
    const controlShortcut = new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    window.dispatchEvent(controlShortcut)
    expect(controlShortcut.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(searchInput.element)

    await buttonByText(wrapper, '站点开关').trigger('click')
    await flushPromises()
    const siteInput = wrapper.get('.site-switches-dialog input')
    const editorShortcut = new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    siteInput.element.dispatchEvent(editorShortcut)

    expect(editorShortcut.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(siteInput.element)
  })
})

describe('App theme preference', () => {
  it('offers system, light, and dark modes and applies the selected mode', async () => {
    const { wrapper } = await mountApp()
    const theme = wrapper.get('select[aria-label="主题"]')
    expect(theme.element.value).toBe('system')
    expect(theme.findAll('option').map((option) => option.text())).toEqual([
      '跟随系统',
      '浅色',
      '深色',
    ])

    await theme.setValue('dark')
    await flushPromises()
    expect(document.documentElement.classList.contains('app-dark')).toBe(true)
    expect(window.localStorage.getItem('ajax-proxy:ui:theme')).toBe('dark')

    await theme.setValue('light')
    await flushPromises()
    expect(document.documentElement.classList.contains('app-dark')).toBe(false)
  })
})

describe('App visible selection and bulk rule actions', () => {
  it('clears selection hidden by a filter and updates only the selected visible rule', async () => {
    const makeRule = (id: string, url: string, enabled: boolean) => ({
      id,
      enabled,
      match: { url, method: 'POST', type: 'normal' },
      response: { enabled: true, replace: { body: { id } } },
    })
    const startingConfig = {
      ...initialConfig(),
      rules: [
        makeRule('enabled-rule', '/api/enabled', true),
        makeRule('selected-rule', '/api/selected', false),
        makeRule('hidden-rule', '/api/hidden', false),
      ],
    }
    const { wrapper, sentMessages } = await mountApp([], startingConfig)
    const filterTrigger = buttonByText(wrapper, '筛选')

    await filterTrigger.trigger('click')
    await wrapper.get('input[name="rule-status-filter"][value="disabled"]').trigger('change')
    await flushPromises()
    expect(wrapper.findAll('.rule-row').map((row) => row.text())).toHaveLength(2)

    const selectedRow = wrapper
      .findAll('.rule-row')
      .find((row) => row.text().includes('/api/selected'))
    await selectedRow.get('.rule-selection input').setValue(true)
    await flushPromises()
    expect(wrapper.get('.bulk-actions').text()).toContain('已选 1 条规则')

    const search = wrapper.get('input[placeholder="搜索 URL、method 或备注"]')
    await search.setValue('/api/hidden')
    await flushPromises()
    expect(wrapper.findAll('.rule-row').map((row) => row.text())).toHaveLength(1)
    expect(wrapper.find('.bulk-actions').exists()).toBe(false)

    await search.setValue('')
    await flushPromises()
    const selectedAgain = wrapper
      .findAll('.rule-row')
      .find((row) => row.text().includes('/api/selected'))
    await selectedAgain.get('.rule-selection input').setValue(true)

    await wrapper.get('input[name="rule-status-filter"][value="enabled"]').trigger('change')
    await flushPromises()
    expect(wrapper.findAll('.rule-row').map((row) => row.text())).toHaveLength(1)
    expect(wrapper.find('.bulk-actions').exists()).toBe(false)

    await wrapper.get('input[name="rule-status-filter"][value="disabled"]').trigger('change')
    await flushPromises()
    const selectedForBulkEnable = wrapper
      .findAll('.rule-row')
      .find((row) => row.text().includes('/api/selected'))
    await selectedForBulkEnable.get('.rule-selection input').setValue(true)
    await buttonByText(wrapper, '启用所选').trigger('click')
    await flushPromises()

    const saves = sentMessages.filter((message) => message.key === V3PanelMessageKey.SAVE_CONFIG)
    expect(saves).toHaveLength(1)
    expect(saves[0].value.config.rules.map(({ id, enabled }) => [id, enabled])).toEqual([
      ['enabled-rule', true],
      ['selected-rule', true],
      ['hidden-rule', false],
    ])
    expect(wrapper.find('.bulk-actions').exists()).toBe(false)
  })

  it('keeps the rule disabled and selected when a bulk enable save fails', async () => {
    const startingConfig = {
      ...initialConfig(),
      rules: [
        {
          id: 'selected-rule',
          enabled: false,
          match: { url: '/api/selected', method: 'POST', type: 'normal' },
          response: { enabled: true, replace: { body: { id: 'selected-rule' } } },
        },
      ],
    }
    const { wrapper, sentMessages } = await mountApp(
      [{ ok: false, error: 'storage-write-failed' }],
      startingConfig
    )

    await wrapper.get('.rule-selection input').setValue(true)
    await buttonByText(wrapper, '启用所选').trigger('click')
    await flushPromises()

    const saves = sentMessages.filter((message) => message.key === V3PanelMessageKey.SAVE_CONFIG)
    expect(saves).toHaveLength(1)
    expect(saves[0].value.config.rules[0].enabled).toBe(true)
    expect(
      wrapper.get('[role="switch"][aria-label="启用规则 /api/selected"]').attributes('aria-checked')
    ).toBe('false')
    expect(wrapper.get('.rule-selection input').element.checked).toBe(true)
    expect(wrapper.get('.bulk-actions').text()).toContain('已选 1 条规则')
    expect(wrapper.get('.operation-alert').text()).toContain('storage-write-failed')
  })

  it('selects and clears only the rules currently visible under a filter', async () => {
    const makeRule = (id: string, url: string, enabled: boolean) => ({
      id,
      enabled,
      match: { url, method: 'POST', type: 'normal' },
      response: { enabled: true, replace: { body: { id } } },
    })
    const startingConfig = {
      ...initialConfig(),
      rules: [
        makeRule('enabled-rule', '/api/enabled', true),
        makeRule('first-disabled-rule', '/api/first-disabled', false),
        makeRule('second-disabled-rule', '/api/second-disabled', false),
      ],
    }
    const { wrapper, sentMessages } = await mountApp([], startingConfig)

    await buttonByText(wrapper, '筛选').trigger('click')
    await wrapper.get('input[name="rule-status-filter"][value="disabled"]').trigger('change')
    await flushPromises()
    await buttonByText(wrapper, '选择当前显示项').trigger('click')
    await flushPromises()

    const visibleSelections = wrapper.findAll('.rule-selection input')
    expect(visibleSelections).toHaveLength(2)
    expect(visibleSelections.every((input) => input.element.checked)).toBe(true)
    expect(wrapper.find('.bulk-actions').text()).toContain('已选 2 条规则')

    await buttonByText(wrapper, '清除当前显示项选择').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.rule-selection input').every((input) => !input.element.checked)).toBe(
      true
    )
    expect(wrapper.find('.bulk-actions').exists()).toBe(false)
    expect(sentMessages.filter((message) => message.key === V3PanelMessageKey.SAVE_CONFIG)).toEqual(
      []
    )
  })

  it('exports selected rules with only their referenced tags', async () => {
    const selectedRule = {
      id: 'selected-rule',
      enabled: true,
      tagIds: ['selected-tag'],
      match: { url: '/api/selected', method: 'POST', type: 'normal' },
      response: { enabled: true, replace: { body: { id: 'selected-rule' } } },
    }
    const otherRule = {
      ...selectedRule,
      id: 'other-rule',
      tagIds: ['other-tag'],
      match: { ...selectedRule.match, url: '/api/other' },
    }
    const selectedTag = { id: 'selected-tag', name: 'Selected', used: true }
    const otherTag = { id: 'other-tag', name: 'Other', used: true }
    const startingConfig = {
      ...initialConfig(),
      tags: [selectedTag, otherTag],
      rules: [selectedRule, otherRule],
    }
    const { wrapper, sentMessages } = await mountApp([], startingConfig)
    const createObjectURL = vi.fn()
    createObjectURL.mockReturnValue('blob:ajax-proxy-selected-rules')
    const revokeObjectURL = vi.fn()
    const NativeURL = globalThis.URL
    class TestURL extends NativeURL {}
    Object.defineProperty(TestURL, 'createObjectURL', { value: createObjectURL })
    Object.defineProperty(TestURL, 'revokeObjectURL', { value: revokeObjectURL })
    vi.stubGlobal('URL', TestURL)
    const clickAnchor = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    await wrapper.get('.rule-selection input').setValue(true)
    await buttonByText(wrapper, '导出所选规则').trigger('click')
    await flushPromises()

    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:ajax-proxy-selected-rules')
    expect(clickAnchor).toHaveBeenCalledOnce()
    expect(clickAnchor.mock.instances[0].download).toMatch(
      /^ajax-proxy-v3-rules-\d{4}-\d{2}-\d{2}\.json$/
    )

    const blob = createObjectURL.mock.calls[0][0] as Blob
    const backupJson = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.addEventListener('load', () => resolve(String(reader.result)))
      reader.addEventListener('error', () => reject(reader.error))
      reader.readAsText(blob)
    })
    const exported = JSON.parse(backupJson)
    expect(exported.rules).toEqual([selectedRule])
    expect(exported.tags).toEqual([selectedTag])
    expect(sentMessages.filter((message) => message.key === V3PanelMessageKey.SAVE_CONFIG)).toEqual(
      []
    )
  })
})

describe('App request rules pagination and pinning', () => {
  const makeRule = (id: string, pinned = false) => ({
    id,
    enabled: true,
    ...(pinned ? { pinned: true } : {}),
    match: { url: `/api/${id}`, method: 'GET', type: 'normal' },
    response: { enabled: true, replace: { body: { id } } },
  })

  it('clears selection when moving to another page', async () => {
    const startingConfig = {
      ...initialConfig(),
      rules: Array.from({ length: 21 }, (_, index) => makeRule(`rule-${index + 1}`)),
    }
    const { wrapper } = await mountApp([], startingConfig)
    expect(wrapper.findAll('.rule-row')).toHaveLength(20)
    await wrapper.get('.rule-selection input').setValue(true)
    expect(wrapper.find('.bulk-actions').exists()).toBe(true)

    await buttonByText(wrapper, '下一页').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.rule-row')).toHaveLength(1)
    expect(wrapper.find('.bulk-actions').exists()).toBe(false)
    expect(wrapper.get('.pagination').text()).toContain('第 2 / 2 页')
    expect(
      wrapper
        .get('select[aria-label="每页"]')
        .findAll('option')
        .map((option) => option.text())
    ).toEqual(['20', '50', '100'])
  })

  it('reorders by full rule priority across a page boundary', async () => {
    const startingConfig = {
      ...initialConfig(),
      rules: Array.from({ length: 21 }, (_, index) => makeRule(`rule-${index + 1}`)),
    }
    const { wrapper, sentMessages } = await mountApp([], startingConfig)
    await buttonByText(wrapper, '下一页').trigger('click')
    await flushPromises()

    const moveUp = wrapper.get('button[aria-label="提高规则「/api/rule-21」的优先级"]')
    expect(moveUp.attributes('disabled')).toBeUndefined()
    await moveUp.trigger('click')
    await flushPromises()

    const save = sentMessages.find((message) => message.key === V3PanelMessageKey.SAVE_CONFIG)
    expect(save.value.config.rules.map(({ id }) => id).slice(-3)).toEqual([
      'rule-19',
      'rule-21',
      'rule-20',
    ])
    expect(wrapper.get('.pagination').text()).toContain('第 2 / 2 页')
    expect(wrapper.findAll('.rule-row')).toHaveLength(1)
    expect(wrapper.get('.rule-row').text()).toContain('/api/rule-20')
  })

  it('keeps pinned rules first, filters them, and persists pin changes', async () => {
    const startingConfig = {
      ...initialConfig(),
      rules: [makeRule('first'), makeRule('second'), makeRule('pinned', true)],
    }
    const { wrapper, sentMessages } = await mountApp([], startingConfig)
    expect(wrapper.findAll('.rule-row').map((row) => row.text())).toEqual([
      expect.stringContaining('/api/pinned'),
      expect.stringContaining('/api/first'),
      expect.stringContaining('/api/second'),
    ])
    expect(
      wrapper.get('button[aria-label="提高规则「/api/pinned」的优先级"]').attributes('disabled')
    ).toBeDefined()
    expect(
      wrapper.get('button[aria-label="降低规则「/api/pinned」的优先级"]').attributes('disabled')
    ).toBeDefined()

    const secondRow = wrapper
      .findAll('.rule-row')
      .find((row) => row.text().includes('/api/second'))!
    await secondRow.get('button[aria-label="置顶规则「/api/second」"]').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.rule-row').map((row) => row.text())).toEqual([
      expect.stringContaining('/api/second'),
      expect.stringContaining('/api/pinned'),
      expect.stringContaining('/api/first'),
    ])

    const saves = sentMessages.filter((message) => message.key === V3PanelMessageKey.SAVE_CONFIG)
    expect(saves).toHaveLength(1)
    expect(saves[0].value.config.rules.map(({ id, pinned }) => [id, pinned])).toEqual([
      ['second', true],
      ['pinned', true],
      ['first', undefined],
    ])

    await buttonByText(wrapper, '只看置顶').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.rule-row')).toHaveLength(2)
    expect(wrapper.findAll('.rule-row').map((row) => row.text())).toEqual([
      expect.stringContaining('/api/second'),
      expect.stringContaining('/api/pinned'),
    ])
  })

  it('adds a new response rule at the end and moves to the new rule page', async () => {
    const startingConfig = {
      ...initialConfig(),
      rules: Array.from({ length: 20 }, (_, index) => makeRule(`rule-${index + 1}`)),
    }
    const { wrapper, sentMessages } = await mountApp([], startingConfig, {
      CodeMirrorJsonEditor: {
        props: ['modelValue', 'ariaLabel'],
        emits: ['update:modelValue'],
        template:
          '<textarea :aria-label="ariaLabel" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
      },
    })

    await wrapper.get('input[placeholder="搜索 URL、method 或备注"]').setValue('pinned:true')
    await buttonByText(wrapper, '创建响应规则').trigger('click')
    expect(wrapper.find('.create-rule-choice').exists()).toBe(false)
    await wrapper.get('.rule-editor input[autocomplete="off"]').setValue('/api/new-last')
    await wrapper.get('.editor-form').trigger('submit')
    await flushPromises()

    const saves = sentMessages.filter((message) => message.key === V3PanelMessageKey.SAVE_CONFIG)
    expect(saves).toHaveLength(1)
    expect(saves[0].value.config.rules).toHaveLength(21)
    expect(saves[0].value.config.rules.at(-1).match.url).toBe('/api/new-last')
    expect(wrapper.findAll('.rule-row')).toHaveLength(1)
    expect(wrapper.get('.rule-row').text()).toContain('/api/new-last')
    expect(wrapper.get('.pagination').text()).toContain('第 2 / 2 页')
    expect(wrapper.get('input[placeholder="搜索 URL、method 或备注"]').element.value).toBe('')
  })
})

describe('App rule duplication persistence flow', () => {
  it('inserts a disabled copy after its source without copying the hit counter', async () => {
    const tag = { id: 'tag-duplicate', name: 'Duplicate', used: true }
    const sourceRule = {
      id: 'source-rule',
      enabled: true,
      tagIds: [tag.id],
      match: { url: '/api/source', method: 'POST', type: 'normal' },
      request: { enabled: true, redirect: { url: '/api/target' } },
      response: {
        enabled: true,
        replace: { status: 201, headers: { 'x-copy': 'kept' }, body: { copied: true } },
      },
    }
    const nextRule = {
      id: 'next-rule',
      enabled: true,
      match: { url: '/api/next', method: 'GET', type: 'normal' },
      response: { enabled: true, replace: { body: { next: true } } },
    }
    const startingConfig = {
      ...initialConfig(),
      tags: [tag],
      rules: [sourceRule, nextRule],
    }
    const { wrapper, sentMessages, sendExtensionMessage } = await mountApp([], startingConfig)

    sendExtensionMessage({
      from: NoticeFrom.SERVICE_WORKER,
      to: NoticeTo.PANELS,
      key: NoticeKey.V3_HIT,
      value: {
        rule_id: sourceRule.id,
        count: 7,
        match_url: sourceRule.match.url,
        method: sourceRule.match.method,
        url: sourceRule.match.url,
      },
    })
    await flushPromises()
    expect(wrapper.findAll('.rule-row')[0].get('.hit-count strong').text()).toBe('7')

    const sourceRow = wrapper.findAll('.rule-row')[0]
    await buttonByText(sourceRow, '复制').trigger('click')
    await flushPromises()

    const saves = sentMessages.filter((message) => message.key === V3PanelMessageKey.SAVE_CONFIG)
    expect(saves).toHaveLength(1)
    const savedRules = saves[0].value.config.rules
    expect(savedRules.map((rule) => rule.id)).toEqual([
      sourceRule.id,
      expect.stringMatching(/^rule-/),
      nextRule.id,
    ])
    const duplicate = savedRules[1]
    expect(duplicate).toEqual({ ...sourceRule, id: duplicate.id, enabled: false })
    expect(duplicate.id).not.toBe(sourceRule.id)
    expect(savedRules[0]).toEqual(sourceRule)
    expect(saves[0].value.config.tags).toEqual([tag])
    expect(saves[0].value.config).not.toHaveProperty('hitCounters')
    expect(wrapper.findAll('.rule-row').map((row) => row.get('.hit-count strong').text())).toEqual([
      '7',
      '0',
      '0',
    ])
    expect(
      wrapper.get('[role="switch"][aria-label="启用规则 /api/source"]').attributes('aria-checked')
    ).toBe('true')
    expect(wrapper.findAll('.rule-row')[1].get('[role="switch"]').attributes('aria-checked')).toBe(
      'false'
    )
  })
})

describe('App filtered rule priority ordering', () => {
  it('disables priority controls while filtered and reorders rules when filters clear', async () => {
    const makeRule = (id: string, url: string, enabled: boolean) => ({
      id,
      enabled,
      match: { url, method: 'POST', type: 'normal' },
      response: { enabled: true, replace: { body: { id } } },
    })
    const startingConfig = {
      ...initialConfig(),
      rules: [
        makeRule('enabled-rule', '/api/enabled', true),
        makeRule('first-disabled-rule', '/api/first-disabled', false),
        makeRule('second-disabled-rule', '/api/second-disabled', false),
      ],
    }
    const { wrapper, sentMessages } = await mountApp([], startingConfig)

    await buttonByText(wrapper, '筛选').trigger('click')
    await wrapper.get('input[name="rule-status-filter"][value="disabled"]').trigger('change')
    await flushPromises()

    const moveUp = () =>
      wrapper.get('button[aria-label="提高规则「/api/second-disabled」的优先级"]')
    expect(moveUp().attributes('disabled')).toBeDefined()
    expect(moveUp().attributes('title')).toBe('清除搜索和筛选后可调整规则顺序。')

    await wrapper.get('input[name="rule-status-filter"][value="all"]').trigger('change')
    await flushPromises()
    expect(moveUp().attributes('disabled')).toBeUndefined()
    await moveUp().trigger('click')
    await flushPromises()

    const saves = sentMessages.filter((message) => message.key === V3PanelMessageKey.SAVE_CONFIG)
    expect(saves).toHaveLength(1)
    expect(saves[0].value.config.rules.map(({ id }) => id)).toEqual([
      'enabled-rule',
      'second-disabled-rule',
      'first-disabled-rule',
    ])
    expect(wrapper.findAll('.rule-row').map((row) => row.text())).toEqual([
      expect.stringContaining('/api/enabled'),
      expect.stringContaining('/api/second-disabled'),
      expect.stringContaining('/api/first-disabled'),
    ])
  })
})

describe('App rule deletion persistence', () => {
  const makeRule = (id: string, url: string) => ({
    id,
    enabled: true,
    match: { url, method: 'GET', type: 'normal' },
    response: { enabled: true, replace: { body: { id } } },
  })

  it('persists deletion of the selected rule while preserving the remaining order', async () => {
    const startingConfig = {
      ...initialConfig(),
      rules: [
        makeRule('first-rule', '/api/first'),
        makeRule('selected-rule', '/api/selected'),
        makeRule('last-rule', '/api/last'),
      ],
    }
    const { wrapper, sentMessages } = await mountApp([], startingConfig)
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)

    const selectedRow = wrapper
      .findAll('.rule-row')
      .find((row) => row.text().includes('/api/selected'))
    if (!selectedRow) throw new Error('Could not find the selected rule row')
    await buttonByText(selectedRow, '删除').trigger('click')
    await flushPromises()

    const saves = sentMessages.filter((message) => message.key === V3PanelMessageKey.SAVE_CONFIG)
    expect(saves).toHaveLength(1)
    expect(saves[0].value.config.rules.map(({ id }) => id)).toEqual(['first-rule', 'last-rule'])
    expect(wrapper.findAll('.rule-row').map((row) => row.text())).toEqual([
      expect.stringContaining('/api/first'),
      expect.stringContaining('/api/last'),
    ])
  })

  it('keeps the selected rule visible when persistence fails', async () => {
    const startingConfig = {
      ...initialConfig(),
      rules: [makeRule('selected-rule', '/api/selected')],
    }
    const { wrapper, sentMessages, getStoredConfig } = await mountApp(
      [{ ok: false, error: 'storage-write-failed' }],
      startingConfig
    )
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)

    await buttonByText(wrapper.get('.rule-row'), '删除').trigger('click')
    await flushPromises()

    const saves = sentMessages.filter((message) => message.key === V3PanelMessageKey.SAVE_CONFIG)
    expect(saves).toHaveLength(1)
    expect(saves[0].value.config.rules).toEqual([])
    expect(getStoredConfig()).toEqual(startingConfig)
    expect(wrapper.findAll('.rule-row').map((row) => row.text())).toEqual([
      expect.stringContaining('/api/selected'),
    ])
    expect(wrapper.get('.operation-alert').text()).toContain('storage-write-failed')
  })

  it('deletes a combined request and response rule as one rule', async () => {
    const combinedRule = {
      ...makeRule('combined-rule', '/api/combined'),
      request: { enabled: true, redirect: { url: '/target' } },
    }
    const { wrapper, sentMessages } = await mountApp([], {
      ...initialConfig(),
      rules: [combinedRule],
    })
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)

    await buttonByText(wrapper.get('.rule-row'), '删除').trigger('click')
    await flushPromises()

    const save = sentMessages.find((message) => message.key === V3PanelMessageKey.SAVE_CONFIG)
    expect(save.value.config.rules).toEqual([])
    expect(wrapper.findAll('.rule-row')).toHaveLength(0)
  })
})

describe('App rule tag management persistence', () => {
  it('normalizes new tags, rejects duplicates, and returns focus to the tag filter', async () => {
    const { wrapper, sentMessages } = await mountApp()
    const tagFilterTrigger = buttonByText(wrapper, '标签')

    await tagFilterTrigger.trigger('click')
    await buttonByText(wrapper, '管理标签').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="dialog"]').text()).toContain('管理规则标签')

    const createInput = wrapper.get('.tag-create-form input')
    await createInput.setValue('  Platform  ')
    await wrapper.get('.tag-create-form').trigger('submit')
    await flushPromises()

    const saves = () =>
      sentMessages.filter((message) => message.key === V3PanelMessageKey.SAVE_CONFIG)
    expect(saves()).toHaveLength(1)
    expect(saves()[0].value.config.tags).toEqual([
      expect.objectContaining({
        id: expect.stringMatching(/^tag-/),
        name: 'Platform',
        used: false,
      }),
    ])

    await createInput.setValue('platform')
    await wrapper.get('.tag-create-form').trigger('submit')
    await flushPromises()

    expect(saves()).toHaveLength(1)
    expect(wrapper.get('[role="dialog"]').exists()).toBe(true)
    expect(wrapper.get('.operation-alert').text()).toContain('标签名称不能重复')

    await buttonByText(wrapper, '完成').trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(tagFilterTrigger.element)
  })

  it('confirms tag removal, preserves other references, and clears the deleted tag filter', async () => {
    const tagA = { id: 'tag-a', name: 'Payments', used: true }
    const tagB = { id: 'tag-b', name: 'Platform', used: true }
    const makeRule = (id: string, url: string, tagIds: string[]) => ({
      id,
      enabled: true,
      tagIds,
      match: { url, method: 'POST', type: 'normal' },
      response: { enabled: true, replace: { body: { id } } },
    })
    const startingConfig = {
      ...initialConfig(),
      tags: [tagA, tagB],
      rules: [
        makeRule('both-tags-rule', '/api/both', ['tag-a', 'tag-b']),
        makeRule('payments-only-rule', '/api/payments', ['tag-a']),
        makeRule('platform-only-rule', '/api/platform', ['tag-b']),
      ],
    }
    const { wrapper, sentMessages } = await mountApp([], startingConfig)
    const confirm = vi
      .spyOn(globalThis, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)

    await buttonByText(wrapper, '标签').trigger('click')
    await wrapper.get('input[name="rule-tag-filter"][value="tag-a"]').trigger('change')
    await flushPromises()
    expect(wrapper.findAll('.rule-row')).toHaveLength(2)

    await buttonByText(wrapper, '管理标签').trigger('click')
    await flushPromises()
    const paymentTagRow = wrapper.findAll('.rule-tags-list li')[0]
    const removePaymentTag = () => buttonByText(paymentTagRow, '删除')

    await removePaymentTag().trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalledOnce()
    expect(sentMessages.filter((message) => message.key === V3PanelMessageKey.SAVE_CONFIG)).toEqual(
      []
    )
    expect(wrapper.findAll('.rule-row')).toHaveLength(2)

    await removePaymentTag().trigger('click')
    await flushPromises()

    const saves = sentMessages.filter((message) => message.key === V3PanelMessageKey.SAVE_CONFIG)
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(saves).toHaveLength(1)
    expect(saves[0].value.config.tags).toEqual([tagB])
    expect(saves[0].value.config.rules.map(({ id, tagIds }) => [id, tagIds])).toEqual([
      ['both-tags-rule', ['tag-b']],
      ['payments-only-rule', undefined],
      ['platform-only-rule', ['tag-b']],
    ])
    expect(wrapper.findAll('.rule-row')).toHaveLength(3)
    expect(buttonByText(wrapper, '标签').exists()).toBe(true)
  })

  it('renames tags without changing IDs or rule references and rejects duplicate names', async () => {
    const currentTag = { id: 'tag-current', name: 'Current', used: true }
    const existingTag = { id: 'tag-existing', name: 'Platform', used: true }
    const startingConfig = {
      ...initialConfig(),
      tags: [currentTag, existingTag],
      rules: [
        {
          id: 'tagged-rule',
          enabled: true,
          tagIds: ['tag-current'],
          match: { url: '/api/tagged', method: 'POST', type: 'normal' },
          response: { enabled: true, replace: { body: { id: 'tagged-rule' } } },
        },
      ],
    }
    const { wrapper, sentMessages } = await mountApp([], startingConfig)

    await buttonByText(wrapper, '标签').trigger('click')
    await buttonByText(wrapper, '管理标签').trigger('click')
    await flushPromises()

    const currentTagRow = wrapper.findAll('.rule-tags-list li')[0]
    const renameInput = currentTagRow.get('input')
    await renameInput.setValue('  Current Platform  ')
    await buttonByText(currentTagRow, '保存名称').trigger('click')
    await flushPromises()

    const saves = () =>
      sentMessages.filter((message) => message.key === V3PanelMessageKey.SAVE_CONFIG)
    expect(saves()).toHaveLength(1)
    expect(saves()[0].value.config.tags).toEqual([
      { ...currentTag, name: 'Current Platform' },
      existingTag,
    ])
    expect(saves()[0].value.config.rules[0].tagIds).toEqual(['tag-current'])

    await renameInput.setValue(' platform ')
    await buttonByText(currentTagRow, '保存名称').trigger('click')
    await flushPromises()

    expect(saves()).toHaveLength(1)
    expect(wrapper.get('.operation-alert').text()).toContain('标签名称不能重复')
    expect(wrapper.get('.rule-tags-dialog').text()).toContain('Current Platform')
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
    const matchTimestamp = Date.UTC(2026, 8, 27, 15, 4, 5)
    vi.spyOn(Date, 'now').mockReturnValue(matchTimestamp)

    expect(document.documentElement.lang).toBe('zh-CN')
    expect(
      wrapper.findAll('.language-toggle button').map((button) => button.attributes('aria-label'))
    ).toEqual(['简体中文', 'English'])

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
      key: NoticeKey.V3_HIT,
      value: {
        rule_id: 'known-rule',
        count: 12345,
        match_url: '/expected',
        method: 'POST',
        url: '/expected',
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
    const timeOptions: Intl.DateTimeFormatOptions = {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }
    expect(wrapper.get('.recent-matches-list time').text()).toBe(
      new Intl.DateTimeFormat('zh-CN', timeOptions).format(matchTimestamp)
    )
    expect(wrapper.get('.hit-count strong').text()).toBe(
      new Intl.NumberFormat('zh-CN').format(12345)
    )

    await wrapper.get('.language-toggle button[aria-label="English"]').trigger('click')

    expect(document.documentElement.lang).toBe('en')
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
    expect(wrapper.get('.recent-matches-list time').text()).toBe(
      new Intl.DateTimeFormat('en', timeOptions).format(matchTimestamp)
    )
    expect(wrapper.get('.hit-count strong').text()).toBe(new Intl.NumberFormat('en').format(12345))
  })
})

describe('App recent match notifications', () => {
  it('keeps request details when storage has already delivered the matching hit count', async () => {
    const rule = {
      id: 'stored-hit-rule',
      enabled: true,
      match: { url: '/api/stored-hit', method: 'POST', type: 'normal' },
      response: { enabled: true, replace: { body: { intercepted: true } } },
    }
    const { wrapper, sendExtensionMessage } = await mountApp(
      [],
      { ...initialConfig(), rules: [rule] },
      {},
      { [rule.id]: 1 }
    )

    sendExtensionMessage({
      from: NoticeFrom.SERVICE_WORKER,
      to: NoticeTo.PANELS,
      key: NoticeKey.V3_HIT,
      value: {
        rule_id: rule.id,
        count: 1,
        match_url: rule.match.url,
        method: rule.match.method,
        url: `${rule.match.url}?request=1`,
      },
    })
    await flushPromises()

    const recentMatches = wrapper.get(
      '.recent-matches:not(.no-match-diagnostics):not(.fetch-outcome-diagnostics)'
    )
    expect(recentMatches.text()).toContain('/api/stored-hit?request=1')
    expect(wrapper.get('.rule-row .hit-count strong').text()).toBe('1')
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

    await navigationButtonByText(wrapper, '重定向规则').trigger('click')
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
    await wrapper
      .get('[data-testid="redirect-headers"]')
      .setValue('{"X-Trace":"configured","X-Empty":""}')
    await wrapper.get('.rule-editor form').trigger('submit')
    await flushPromises()

    const save = sentMessages.find((message) => message.key === V3PanelMessageKey.SAVE_CONFIG)
    expect(save.value.config.rules[0].request.redirect).toEqual({
      url: '/target',
      headers: { 'X-Trace': 'configured', 'X-Empty': '' },
      exclusions: ['/health', 'skip=1'],
    })
  })

  it('persists a function redirect as a disabled V3 action after code confirmation', async () => {
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    const { wrapper, sentMessages } = await mountApp()

    await navigationButtonByText(wrapper, '重定向规则').trigger('click')
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
    expect(save.value.config.formatVersion).toBe(V3_BACKUP_VERSION)
    expect(save.value.config.rules[0].request).toEqual({
      enabled: false,
      redirect: { type: 'function', code: 'return request.url' },
    })
    expect(globalThis.confirm).toHaveBeenCalledTimes(1)
  })

  it('edits the redirect action of a combined rule and preserves its response and pin', async () => {
    const rule = {
      id: 'combined-redirect',
      enabled: true,
      pinned: true,
      match: { url: '/api/combined', method: 'GET', type: 'normal' },
      request: { enabled: true, redirect: { url: '/old-target' } },
      response: { enabled: true, replace: { status: 201, body: { preserved: true } } },
    }
    const { wrapper, sentMessages } = await mountApp([], { ...initialConfig(), rules: [rule] })

    await navigationButtonByText(wrapper, '重定向规则').trigger('click')
    expect(wrapper.find('.rule-row').text()).toContain('/api/combined')
    await buttonByText(wrapper.get('.rule-row'), '编辑重定向').trigger('click')
    await wrapper
      .get('.redirect-rule-editor form')
      .findAll('input:not([type="checkbox"]):not([type="radio"])')[1]
      .setValue('/new-target')
    await wrapper.get('.redirect-rule-editor form').trigger('submit')
    await flushPromises()

    const save = sentMessages.find((message) => message.key === V3PanelMessageKey.SAVE_CONFIG)
    expect(save.value.config.rules).toEqual([
      {
        ...rule,
        tagIds: [],
        request: { enabled: true, redirect: { url: '/new-target' } },
      },
    ])
  })
})

describe('RedirectRuleEditor static request headers', () => {
  it('loads and saves string header values including empty strings', async () => {
    const wrapper = mount(RedirectRuleEditor, {
      props: {
        open: true,
        rule: {
          match: { url: '/api', type: 'normal', method: 'ANY' },
          request: {
            enabled: true,
            redirect: { url: '/target', headers: { 'X-Trace': '', Accept: 'application/json' } },
          },
        },
      },
      global: { plugins: [i18n] },
    })
    expect(wrapper.get('[data-testid="redirect-headers"]').element.value).toContain('"X-Trace": ""')
    await wrapper.get('[data-testid="redirect-headers"]').setValue('{"X-Trace":"","X-New":"yes"}')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('save')?.[0][0].redirectHeaders).toEqual({
      'X-Trace': '',
      'X-New': 'yes',
    })
    wrapper.unmount()
  })

  it('shows a local validation error for invalid header JSON and hides headers for function redirects', async () => {
    const wrapper = mount(RedirectRuleEditor, {
      props: { open: true },
      global: { plugins: [i18n] },
    })
    await wrapper.get('input[name="redirect-mode"][value="function"]').setValue(true)
    expect(wrapper.find('[data-testid="redirect-headers"]').exists()).toBe(false)
    await wrapper.get('input[name="redirect-mode"][value="static"]').setValue(true)
    const inputs = wrapper.findAll('input:not([type="checkbox"]):not([type="radio"])')
    await inputs[0].setValue('/api')
    await inputs[1].setValue('/target')
    await wrapper.get('[data-testid="redirect-headers"]').setValue('{bad')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toContain('有效 JSON')
    expect(wrapper.emitted('save')).toBeUndefined()
    wrapper.unmount()
  })
})

describe('App rule view navigation accessibility', () => {
  it('shows action-specific counts and combined rules in both views', async () => {
    const makeRule = (id: string, url: string, action: 'response' | 'redirect' | 'both') => ({
      id,
      enabled: true,
      match: { url, method: 'GET', type: 'normal' },
      ...(action !== 'redirect' ? { response: { enabled: true, replace: { body: { id } } } } : {}),
      ...(action !== 'response'
        ? { request: { enabled: true, redirect: { url: `/target/${id}` } } }
        : {}),
    })
    const startingConfig = {
      ...initialConfig(),
      rules: [
        makeRule('combined', '/api/shared', 'both'),
        makeRule('response-only', '/api/response', 'response'),
        makeRule('redirect-only', '/api/redirect', 'redirect'),
      ],
    }
    const { wrapper } = await mountApp([], startingConfig)

    const navigation = wrapper.get('nav[aria-label="工作区"]')
    const [responseNavigation, redirectNavigation] = navigation.findAll('.nav-item')
    expect(navigation.findAll('.nav-item')).toHaveLength(2)
    expect(responseNavigation.text()).toContain('响应规则')
    expect(responseNavigation.get('.nav-count').text()).toBe('2')
    expect(responseNavigation.attributes('aria-current')).toBe('page')
    expect(wrapper.findAll('.rule-row')).toHaveLength(2)
    expect(wrapper.findAll('.rule-row').some((row) => row.text().includes('/api/shared'))).toBe(
      true
    )

    await wrapper.get('input[placeholder="搜索 URL、method 或备注"]').setValue('/api/shared')
    expect(wrapper.findAll('.rule-row')).toHaveLength(1)
    await redirectNavigation.trigger('click')
    expect(redirectNavigation.text()).toContain('重定向规则')
    expect(redirectNavigation.get('.nav-count').text()).toBe('2')
    expect(redirectNavigation.attributes('aria-current')).toBe('page')
    expect(wrapper.findAll('.rule-row')).toHaveLength(1)
    expect(wrapper.get('.rule-row').text()).toContain('/api/shared')

    await wrapper.get('input[placeholder="搜索 URL、method 或备注"]').setValue('')
    expect(wrapper.findAll('.rule-row')).toHaveLength(2)
    expect(wrapper.findAll('.rule-row').some((row) => row.text().includes('/api/shared'))).toBe(
      true
    )
    await responseNavigation.trigger('click')
    expect(wrapper.findAll('.rule-row')).toHaveLength(2)
    expect(wrapper.findAll('.rule-row').some((row) => row.text().includes('/api/response'))).toBe(
      true
    )
  })

  it('resets pagination when switching views', async () => {
    const responseRules = Array.from({ length: 21 }, (_, index) => ({
      id: `response-${index}`,
      enabled: true,
      match: { url: `/api/response-${index}`, method: 'GET', type: 'normal' },
      response: { enabled: true, replace: { body: { index } } },
    }))
    const { wrapper } = await mountApp([], { ...initialConfig(), rules: responseRules })
    await buttonByText(wrapper, '下一页').trigger('click')
    expect(wrapper.get('.pagination').text()).toContain('第 2 / 2 页')

    await navigationButtonByText(wrapper, '重定向规则').trigger('click')
    expect(wrapper.findAll('.rule-row')).toHaveLength(0)
    expect(wrapper.find('.pagination').exists()).toBe(false)
    await navigationButtonByText(wrapper, '响应规则').trigger('click')
    expect(wrapper.get('.pagination').text()).toContain('第 1 / 2 页')
  })
})

describe('App function response persistence flow', () => {
  const editorStubs = {
    CodeMirrorJsonEditor: {
      props: ['modelValue', 'ariaLabel'],
      emits: ['update:modelValue'],
      template:
        '<textarea :aria-label="ariaLabel" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    },
  }

  it('persists a confirmed function response as disabled by default', async () => {
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    const { wrapper, sentMessages } = await mountApp([], initialConfig(), editorStubs)

    await buttonByText(wrapper, '创建响应规则').trigger('click')
    await flushPromises()
    await wrapper.get('input[name="response-mode"][value="function"]').setValue(true)
    await wrapper.get('.rule-editor input[autocomplete="off"]').setValue('/api/function')
    await wrapper.get('textarea[aria-label="函数体代码"]').setValue('return { body: { ok: true } }')
    await wrapper.get('.editor-form').trigger('submit')
    await flushPromises()

    const saves = sentMessages.filter((message) => message.key === V3PanelMessageKey.SAVE_CONFIG)
    expect(globalThis.confirm).toHaveBeenCalledOnce()
    expect(saves).toHaveLength(1)
    expect(saves[0].value.config.rules).toEqual([
      expect.objectContaining({
        id: expect.stringMatching(/^rule-/),
        enabled: true,
        tagIds: [],
        match: { url: '/api/function', type: 'normal', method: 'ANY' },
        response: {
          enabled: false,
          replace: { code: 'return { body: { ok: true } }' },
        },
      }),
    ])
    expect(wrapper.find('.rule-editor').exists()).toBe(false)
  })

  it('updates a function response while preserving its request action and tags', async () => {
    const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    const tag = { id: 'tag-api', name: 'API', used: true }
    const existingRule = {
      id: 'combined-rule',
      enabled: true,
      tagIds: [tag.id],
      match: { url: '/api/combined', method: 'POST', type: 'normal' },
      request: { enabled: true, redirect: { url: '/api/target' } },
      response: { enabled: false, replace: { code: 'return { body: { old: true } }' } },
    }
    const startingConfig = { ...initialConfig(), tags: [tag], rules: [existingRule] }
    const { wrapper, sentMessages } = await mountApp([], startingConfig, editorStubs)

    const row = wrapper.get('.rule-row')
    await buttonByText(row, '编辑响应').trigger('click')
    await flushPromises()
    await wrapper
      .get('textarea[aria-label="函数体代码"]')
      .setValue('return { body: { fresh: true } }')
    await wrapper.get('.function-enabled input').setValue(true)
    await wrapper.get('.editor-form').trigger('submit')
    await flushPromises()

    const saves = sentMessages.filter((message) => message.key === V3PanelMessageKey.SAVE_CONFIG)
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(saves).toHaveLength(1)
    expect(saves[0].value.config.rules).toEqual([
      {
        ...existingRule,
        response: { enabled: true, replace: { code: 'return { body: { fresh: true } }' } },
      },
    ])
    expect(saves[0].value.config.tags).toEqual([tag])
    expect(wrapper.find('.rule-editor').exists()).toBe(false)
  })

  it('keeps an existing rule unchanged and the editor open when saving its function response fails', async () => {
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    const existingRule = {
      id: 'combined-rule',
      enabled: true,
      tagIds: ['tag-api'],
      match: { url: '/api/combined', method: 'POST', type: 'normal' },
      request: { enabled: true, redirect: { url: '/api/target' } },
      response: { enabled: false, replace: { code: 'return { body: { old: true } }' } },
    }
    const tag = { id: 'tag-api', name: 'API', used: true }
    const startingConfig = { ...initialConfig(), tags: [tag], rules: [existingRule] }
    const { wrapper, sentMessages, getStoredConfig } = await mountApp(
      [{ ok: false, error: 'storage-write-failed' }],
      startingConfig,
      editorStubs
    )

    await buttonByText(wrapper.get('.rule-row'), '编辑响应').trigger('click')
    await flushPromises()
    await wrapper
      .get('textarea[aria-label="函数体代码"]')
      .setValue('return { body: { changed: true } }')
    await wrapper.get('.editor-form').trigger('submit')
    await flushPromises()

    const saves = sentMessages.filter((message) => message.key === V3PanelMessageKey.SAVE_CONFIG)
    expect(saves).toHaveLength(1)
    expect(saves[0].value.config.rules[0]).toMatchObject({
      id: existingRule.id,
      request: existingRule.request,
      tagIds: existingRule.tagIds,
      response: { enabled: false, replace: { code: 'return { body: { changed: true } }' } },
    })
    expect(getStoredConfig()).toEqual(startingConfig)
    expect(wrapper.find('.rule-editor').exists()).toBe(true)
    expect(wrapper.get('.operation-alert').text()).toContain('storage-write-failed')
  })
})

describe('App JSON response persistence flow', () => {
  const editorStubs = {
    CodeMirrorJsonEditor: {
      props: ['modelValue', 'ariaLabel'],
      emits: ['update:modelValue'],
      template:
        '<textarea :aria-label="ariaLabel" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    },
  }

  it('creates a JSON response rule with the editor values in the saved config', async () => {
    const { wrapper, sentMessages } = await mountApp([], initialConfig(), editorStubs)

    await buttonByText(wrapper, '创建响应规则').trigger('click')
    await flushPromises()
    await wrapper.get('.rule-editor input[autocomplete="off"]').setValue('/api/json')
    await wrapper.findAll('.rule-editor select')[1].setValue('POST')
    await wrapper.get('.rule-editor input[type="number"]').setValue(202)
    await wrapper.get('textarea[aria-label="响应 JSON"]').setValue('{"ok":true,"items":[1,2]}')
    await wrapper.get('.editor-form').trigger('submit')
    await flushPromises()

    const saves = sentMessages.filter((message) => message.key === V3PanelMessageKey.SAVE_CONFIG)
    expect(saves).toHaveLength(1)
    expect(saves[0].value.config.rules).toEqual([
      expect.objectContaining({
        id: expect.stringMatching(/^rule-/),
        enabled: true,
        tagIds: [],
        match: { url: '/api/json', type: 'normal', method: 'POST' },
        response: {
          enabled: true,
          replace: { status: 202, body: { ok: true, items: [1, 2] } },
        },
      }),
    ])
    expect(wrapper.find('.rule-editor').exists()).toBe(false)
  })

  it('edits a composite response while preserving its redirect, tags, and custom headers', async () => {
    const tag = { id: 'tag-json', name: 'JSON', used: true }
    const existingRule = {
      id: 'composite-json-rule',
      enabled: true,
      tagIds: [tag.id],
      match: { url: '/api/composite', method: 'POST', type: 'normal' },
      request: { enabled: true, redirect: { url: '/api/target' } },
      response: {
        enabled: false,
        replace: { status: 201, headers: { 'x-debug': 'kept' }, body: { old: true } },
      },
    }
    const startingConfig = { ...initialConfig(), tags: [tag], rules: [existingRule] }
    const { wrapper, sentMessages } = await mountApp([], startingConfig, editorStubs)

    await buttonByText(wrapper.get('.rule-row'), '编辑响应').trigger('click')
    await flushPromises()
    await wrapper.get('.rule-editor input[type="number"]').setValue(206)
    await wrapper.get('textarea[aria-label="响应 JSON"]').setValue('{"updated":true}')
    await wrapper.get('.editor-form').trigger('submit')
    await flushPromises()

    const saves = sentMessages.filter((message) => message.key === V3PanelMessageKey.SAVE_CONFIG)
    expect(saves).toHaveLength(1)
    expect(saves[0].value.config.rules).toEqual([
      {
        ...existingRule,
        response: {
          enabled: true,
          replace: { status: 206, headers: { 'x-debug': 'kept' }, body: { updated: true } },
        },
      },
    ])
    expect(saves[0].value.config.tags).toEqual([tag])
    expect(wrapper.find('.rule-editor').exists()).toBe(false)
  })

  it('does not apply a JSON edit locally when config persistence fails', async () => {
    const existingRule = {
      id: 'json-rule',
      enabled: true,
      match: { url: '/api/json', method: 'POST', type: 'normal' },
      response: { enabled: true, replace: { status: 200, body: { old: true } } },
    }
    const startingConfig = { ...initialConfig(), rules: [existingRule] }
    const { wrapper, sentMessages, getStoredConfig } = await mountApp(
      [{ ok: false, error: 'storage-write-failed' }],
      startingConfig,
      editorStubs
    )

    await buttonByText(wrapper.get('.rule-row'), '编辑').trigger('click')
    await flushPromises()
    await wrapper.get('textarea[aria-label="响应 JSON"]').setValue('{"changed":true}')
    await wrapper.get('.editor-form').trigger('submit')
    await flushPromises()

    const saves = sentMessages.filter((message) => message.key === V3PanelMessageKey.SAVE_CONFIG)
    expect(saves).toHaveLength(1)
    expect(saves[0].value.config.rules[0].response.replace.body).toEqual({ changed: true })
    expect(getStoredConfig()).toEqual(startingConfig)
    expect(wrapper.find('.rule-editor').exists()).toBe(true)
    expect(wrapper.get('.operation-alert').text()).toContain('storage-write-failed')
    expect(wrapper.get('.rule-row').text()).toContain('/api/json')
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

  it('reloads a conflicting remote snapshot before retrying an append import', async () => {
    const localRule = {
      id: 'local-rule',
      enabled: true,
      match: { url: '/local', method: 'GET', type: 'normal' },
      response: { enabled: true, replace: { body: { source: 'local' } } },
    }
    const startingConfig = { ...initialConfig(), rules: [localRule] }
    const remoteRule = {
      id: 'remote-rule',
      enabled: true,
      match: { url: '/remote', method: 'GET', type: 'normal' },
      response: { enabled: true, replace: { body: { source: 'remote' } } },
    }
    const remoteConfig = {
      ...initialConfig(),
      settings: { globalEnabled: false, mode: 'redirector', language: 'en' },
      rules: [localRule, remoteRule],
      disabledOrigins: ['https://remote.example'],
    }
    const remoteRevision = `sha256:${'d'.repeat(64)}`
    const backup = {
      ...initialConfig(),
      settings: { globalEnabled: true, mode: 'interceptor', language: 'zh-CN' },
      rules: [
        {
          id: 'imported-rule',
          enabled: true,
          match: { url: '/imported', method: 'POST', type: 'normal' },
          response: { enabled: true, replace: { body: { source: 'imported' } } },
        },
      ],
      disabledOrigins: ['https://imported.example'],
    }
    const { wrapper, sentMessages } = await mountApp(
      [
        {
          ok: false,
          error: 'config-conflict',
          current: { config: remoteConfig, revision: remoteRevision },
        },
        { ok: true },
      ],
      startingConfig
    )
    const confirm = vi
      .spyOn(globalThis, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)

    const openAndValidateBackup = async (backupLabel, validateLabel) => {
      await buttonByText(wrapper, backupLabel).trigger('click')
      await wrapper.get('[data-testid="backup-json-input"]').setValue(JSON.stringify(backup))
      await buttonByText(wrapper, validateLabel).trigger('click')
      await flushPromises()
      expect(wrapper.find('.backup-valid').exists()).toBe(true)
    }

    await openAndValidateBackup('备份 / 恢复', '验证备份')
    await wrapper.get('[data-testid="backup-import-rules-button"]').trigger('click')
    await flushPromises()

    const saves = () =>
      sentMessages.filter((message) => message.key === V3PanelMessageKey.SAVE_CONFIG)
    const snapshots = () =>
      sentMessages.filter((message) => message.key === V3PanelMessageKey.GET_SNAPSHOT)
    expect(saves()).toHaveLength(1)
    expect(saves()[0].value.config).toEqual({
      ...startingConfig,
      rules: [localRule, backup.rules[0]],
    })
    expect(wrapper.findAll('.rule-row')).toHaveLength(1)
    expect(wrapper.get('.rule-row').text()).toContain('/local')
    expect(
      wrapper.get('[role="switch"][aria-label="全局启用 Ajax Proxy"]').attributes('aria-checked')
    ).toBe('true')
    expect(wrapper.get('.operation-alert').text()).toContain('配置已在其他面板中更新')

    await buttonByText(wrapper, '加载最新配置').trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalledOnce()
    expect(snapshots()).toHaveLength(1)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(wrapper.findAll('.rule-row')).toHaveLength(1)

    confirm.mockReturnValueOnce(true)
    await buttonByText(wrapper, '加载最新配置').trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(snapshots()).toHaveLength(2)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.findAll('.rule-row')).toHaveLength(2)
    expect(wrapper.findAll('.rule-row').some((row) => row.text().includes('/remote'))).toBe(true)
    expect(
      wrapper
        .get('[role="switch"][aria-label="Enable Ajax Proxy globally"]')
        .attributes('aria-checked')
    ).toBe('false')

    await openAndValidateBackup('Backup / Restore', 'Validate backup')
    await wrapper.get('[data-testid="backup-import-rules-button"]').trigger('click')
    await flushPromises()

    expect(saves()).toHaveLength(2)
    expect(saves()[1].value.expectedRevision).toBe(remoteRevision)
    expect(saves()[1].value.config).toEqual({
      ...remoteConfig,
      rules: [localRule, remoteRule, backup.rules[0]],
    })
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.findAll('.rule-row')).toHaveLength(3)
    expect(wrapper.findAll('.rule-row').some((row) => row.text().includes('/imported'))).toBe(true)
    expect(
      wrapper.get('[aria-label="Interface language"]').find('[aria-pressed="true"]').text()
    ).toBe('EN')
  })
})
