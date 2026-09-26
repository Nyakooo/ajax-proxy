import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SiteSwitchesDialog from '../src/components/SiteSwitchesDialog.vue'
import ResponseRuleEditor from '../src/components/ResponseRuleEditor.vue'
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
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})
