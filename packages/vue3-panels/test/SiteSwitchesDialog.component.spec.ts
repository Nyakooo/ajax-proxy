import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SiteSwitchesDialog from '../src/components/SiteSwitchesDialog.vue'
import ResponseRuleEditor from '../src/components/ResponseRuleEditor.vue'
import RedirectRuleEditor from '../src/components/RedirectRuleEditor.vue'
import CodeMirrorJsonEditor from '../src/components/editors/CodeMirrorJsonEditor.vue'
import { i18n } from '../src/i18n/index.js'

describe('SiteSwitchesDialog', () => {
  it('focuses on open, emits normalized origins, and emits enable for a disabled origin', async () => {
    const wrapper = mount(SiteSwitchesDialog, {
      attachTo: document.body,
      props: { open: false, disabledOrigins: [] },
      global: { plugins: [i18n] },
    })

    await wrapper.setProps({ open: true })
    await nextTick()
    const input = wrapper.get<HTMLInputElement>('#site-switch-origin')
    expect(document.activeElement).toBe(input.element)

    await input.setValue('https://example.com:8443/path?private=value')
    expect(wrapper.get('.site-switch-preview').text()).toContain('https://example.com:8443')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('disable')).toEqual([['https://example.com:8443']])

    await wrapper.setProps({ disabledOrigins: ['https://example.com:8443'] })
    await wrapper.get('[aria-label="启用站点 https://example.com:8443"]').trigger('click')
    expect(wrapper.emitted('enable')).toEqual([['https://example.com:8443']])
  })

  it('rejects non-HTTP URLs and origins that are already disabled', async () => {
    const wrapper = mount(SiteSwitchesDialog, {
      attachTo: document.body,
      props: { open: false, disabledOrigins: ['https://blocked.example'] },
      global: { plugins: [i18n] },
    })
    await wrapper.setProps({ open: true })
    const input = wrapper.get<HTMLInputElement>('#site-switch-origin')
    const form = wrapper.get('form')

    await input.setValue('ftp://example.com/resource')
    await form.trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toBe(
      '请输入有效的 HTTP(S) URL，不要包含用户名或密码。'
    )

    await input.setValue('https://blocked.example/path')
    await form.trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toBe('此 origin 已经停用。')
    expect(wrapper.emitted('disable')).toBeUndefined()
  })

  it('traps Tab focus at both ends and emits close for Escape', async () => {
    const wrapper = mount(SiteSwitchesDialog, {
      attachTo: document.body,
      props: { open: false },
      global: { plugins: [i18n] },
    })
    await wrapper.setProps({ open: true })
    await nextTick()
    const dialog = wrapper.get('[role="dialog"]')
    const input = wrapper.get('#site-switch-origin')
    const first = wrapper.get('.editor-close')
    const last = wrapper.get('.editor-actions button')

    expect(document.activeElement).toBe(input.element)
    first.element.focus()
    const shiftTab = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })
    dialog.element.dispatchEvent(shiftTab)
    expect(shiftTab.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(last.element)
    dialog.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(document.activeElement).toBe(first.element)

    dialog.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})

describe('ResponseRuleEditor', () => {
  it('rejects padded match URLs and status codes outside the HTTP range', async () => {
    const wrapper = mount(ResponseRuleEditor, {
      props: { open: true },
      global: { plugins: [i18n] },
    })
    await nextTick()
    await wrapper.get('.editor-field input').setValue(' /api ')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toBe('匹配 URL 不能为空，且不能包含首尾空格。')

    await wrapper.get('.editor-field input').setValue('/api')
    await wrapper.get('input[type="number"]').setValue('199')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toBe('状态码必须是 200 到 599 之间的整数。')
    expect(wrapper.emitted('save')).toBeUndefined()
  })

  it('requires confirmation before saving a disabled function response rule', async () => {
    const wrapper = mount(ResponseRuleEditor, {
      props: { open: true },
      global: { plugins: [i18n] },
    })
    await nextTick()
    await wrapper.get('.editor-field input').setValue('/api')
    await wrapper.get('input[value="function"]').setValue(true)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)

    await wrapper.get('form').trigger('submit')
    expect(confirm).toHaveBeenCalledOnce()
    expect(wrapper.emitted('save')).toBeUndefined()

    confirm.mockReturnValue(true)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('save')).toEqual([
      [
        {
          enabled: true,
          match: { url: '/api', type: 'normal', method: 'ANY' },
          mode: 'function',
          code: 'return { body: { ok: true } }',
          responseEnabled: false,
          tagIds: [],
        },
      ],
    ])
  })

  it('saves a valid JSON response with selected rule tags', async () => {
    const wrapper = mount(ResponseRuleEditor, {
      props: { open: true, tags: [{ id: 'tag-a', name: 'API' }] },
      global: { plugins: [i18n] },
    })
    await nextTick()
    await wrapper.get('.editor-field input').setValue('/api')
    await wrapper.get('.rule-tag-picker input[type="checkbox"]').setValue(true)
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('save')).toEqual([
      [
        {
          enabled: true,
          match: { url: '/api', type: 'normal', method: 'ANY' },
          status: 200,
          body: {},
          mode: 'json',
          responseEnabled: true,
          tagIds: ['tag-a'],
        },
      ],
    ])
  })

  it('requires a separate confirmation before enabling a function response', async () => {
    const wrapper = mount(ResponseRuleEditor, {
      props: { open: true },
      global: { plugins: [i18n] },
    })
    await nextTick()
    await wrapper.get('input[value="function"]').setValue(true)
    const enable = wrapper.get('.function-enabled input[type="checkbox"]')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)

    await enable.setValue(true)
    await nextTick()
    expect(confirm).toHaveBeenCalledOnce()
    expect(enable.element.checked).toBe(false)

    confirm.mockReturnValue(true)
    await enable.setValue(true)
    await nextTick()
    expect(enable.element.checked).toBe(true)
    expect(wrapper.get('.function-safety-warning').exists()).toBe(true)
  })

  it('blocks invalid JSON, shows its location, and clears the error after correction', async () => {
    const wrapper = mount(ResponseRuleEditor, {
      props: { open: true },
      global: { plugins: [i18n] },
    })
    await flushPromises()
    await wrapper.get('.editor-field input').setValue('/api')
    const editor = wrapper.getComponent(CodeMirrorJsonEditor)

    editor.vm.$emit('update:modelValue', '{broken: 1}')
    await nextTick()
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toMatch(/^JSON 格式有误：第 \d+ 行，第 \d+ 列。$/)
    expect(wrapper.emitted('save')).toBeUndefined()

    editor.vm.$emit('update:modelValue', '{"ok": true}')
    await nextTick()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('save')?.at(-1)?.[0]).toMatchObject({ body: { ok: true }, mode: 'json' })
  })

  it('resets fields and validation errors when reopened for a different rule', async () => {
    const firstRule = {
      enabled: true,
      match: { url: '/first' },
      response: { enabled: true, replace: { status: 201, body: { first: true } } },
    }
    const secondRule = {
      enabled: false,
      match: { url: '/second', type: 'exact', method: 'POST' },
      response: { enabled: true, replace: { status: 202, body: { second: true } } },
    }
    const wrapper = mount(ResponseRuleEditor, {
      props: { open: false, rule: firstRule },
      global: { plugins: [i18n] },
    })
    await wrapper.setProps({ open: true })
    await wrapper.get('.editor-field input').setValue(' /invalid ')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('[role="alert"]').exists()).toBe(true)

    await wrapper.setProps({ open: false, rule: secondRule })
    await wrapper.setProps({ open: true })
    await nextTick()
    await flushPromises()
    expect(wrapper.get('.editor-field input').element.value).toBe('/second')
    expect(wrapper.get('input[type="number"]').element.value).toBe('202')
    expect(wrapper.getComponent(CodeMirrorJsonEditor).props('modelValue')).toBe(
      '{\n  "second": true\n}'
    )
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })
})

describe('RedirectRuleEditor', () => {
  it('validates required and padded fields, then emits the redirect save payload', async () => {
    const wrapper = mount(RedirectRuleEditor, {
      props: { open: true, tags: [{ id: 'tag-a', name: 'API' }] },
      global: { plugins: [i18n] },
    })
    await nextTick()
    const inputs = wrapper.findAll('input:not([type="checkbox"]):not([type="radio"])')
    const matchUrl = inputs[0]
    const targetUrl = inputs[1]
    const selects = wrapper.findAll('select')

    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toBe('匹配 URL 和跳转目标不能为空。')
    expect(wrapper.emitted('save')).toBeUndefined()

    await matchUrl.setValue(' /api ')
    await targetUrl.setValue('https://target.test/redirect')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toBe('URL 前后不能包含空格。')
    expect(wrapper.emitted('save')).toBeUndefined()

    await matchUrl.setValue('/api')
    await selects[0].setValue('regex')
    await selects[1].setValue('POST')
    await wrapper.get('.rule-tag-picker input[type="checkbox"]').setValue(true)
    await wrapper.get('[data-testid="redirect-exclusions"]').setValue('/health\n /admin \n/health')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('save')).toEqual([
      [
        {
          enabled: true,
          match: { url: '/api', type: 'regex', method: 'POST' },
          redirectMode: 'static',
          redirectUrl: 'https://target.test/redirect',
          redirectEnabled: true,
          exclusions: ['/health', '/admin'],
          tagIds: ['tag-a'],
        },
      ],
    ])
  })

  it('reloads the selected rule while editing and clears the previous validation issue', async () => {
    const firstRule = {
      enabled: false,
      match: { url: '/first', type: 'normal', method: 'GET' },
      request: { redirect: { url: 'https://first.test/', exclusions: ['/first-skip'] } },
      tagIds: ['tag-a'],
    }
    const secondRule = {
      enabled: true,
      match: { url: '/second', type: 'exact', method: 'POST' },
      request: { redirect: { url: 'https://second.test/', exclusions: ['/second-skip'] } },
      tagIds: ['tag-b'],
    }
    const wrapper = mount(RedirectRuleEditor, {
      props: {
        open: true,
        rule: firstRule,
        tags: [
          { id: 'tag-a', name: 'First' },
          { id: 'tag-b', name: 'Second' },
        ],
      },
      global: { plugins: [i18n] },
    })
    const inputs = wrapper.findAll('input:not([type="checkbox"]):not([type="radio"])')
    await inputs[0].setValue(' /invalid ')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('[role="alert"]').exists()).toBe(true)

    await wrapper.setProps({ rule: secondRule })
    await nextTick()
    await flushPromises()

    expect(inputs[0].element.value).toBe('/second')
    expect(inputs[1].element.value).toBe('https://second.test/')
    expect(wrapper.get('[data-testid="redirect-exclusions"]').element.value).toBe('/second-skip')
    expect(wrapper.findAll('select')[0].element.value).toBe('exact')
    expect(wrapper.findAll('select')[1].element.value).toBe('POST')
    expect(wrapper.findAll('.rule-tag-picker input[type="checkbox"]')[1].element.checked).toBe(true)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)

    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('save')?.at(-1)?.[0]).toEqual({
      enabled: true,
      match: { url: '/second', type: 'exact', method: 'POST' },
      redirectMode: 'static',
      redirectUrl: 'https://second.test/',
      redirectEnabled: true,
      exclusions: ['/second-skip'],
      tagIds: ['tag-b'],
    })
  })

  it('saves function redirects only after confirmation and keeps them disabled by default', async () => {
    const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValue(false)
    const wrapper = mount(RedirectRuleEditor, {
      props: { open: true },
      global: { plugins: [i18n] },
    })
    await nextTick()
    await wrapper.get('input[name="redirect-mode"][value="function"]').setValue(true)
    await flushPromises()
    await wrapper.get('input:not([type="checkbox"]):not([type="radio"])').setValue('/api')
    await wrapper.get('[data-testid="redirect-exclusions"]').setValue('/health')
    const emittedBeforeSubmit = wrapper.emitted('save')?.length ?? 0
    await wrapper.get('form').trigger('submit')

    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm.mock.calls[0][0]).toContain('确认保存此函数重定向代码')
    expect(wrapper.emitted('save')?.length ?? 0).toBe(emittedBeforeSubmit)

    confirm.mockReturnValue(true)
    await wrapper.get('form').trigger('submit')
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(wrapper.emitted('save')?.at(-1)?.[0]).toEqual({
      enabled: true,
      match: { url: '/api', type: 'normal', method: 'ANY' },
      redirectMode: 'function',
      code: 'return request.url',
      redirectEnabled: false,
      exclusions: ['/health'],
      tagIds: [],
    })
  })

  it('requires a second explicit confirmation to enable a function redirect', async () => {
    const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValue(false)
    const wrapper = mount(RedirectRuleEditor, {
      props: { open: true },
      global: { plugins: [i18n] },
    })
    await nextTick()
    await wrapper.get('input[name="redirect-mode"][value="function"]').setValue(true)
    await flushPromises()
    const enable = wrapper.get('.function-enabled input[type="checkbox"]')
    await enable.setValue(true)
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(enable.element.checked).toBe(false)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})
