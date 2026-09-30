import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ResponseRuleEditor from '../src/components/ResponseRuleEditor.vue'
import JsonTreeEditor from '../src/components/editors/JsonTreeEditor.vue'
import { i18n } from '../src/i18n/index.js'

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

async function mountFunctionEditor(rule = null) {
  const wrapper = mount(ResponseRuleEditor, {
    props: { open: true, rule },
    attachTo: document.body,
    global: {
      plugins: [i18n],
      stubs: {
        CodeMirrorJsonEditor: true,
        RuleTagPicker: true,
      },
    },
  })
  await flushPromises()
  await wrapper.get('input[name="response-mode"][value="function"]').setValue()
  await wrapper.get('input[autocomplete="off"]').setValue('https://api.test/items')
  return wrapper
}

async function mountJsonEditor(rule = null) {
  const wrapper = mount(ResponseRuleEditor, {
    props: { open: true, rule },
    attachTo: document.body,
    global: {
      plugins: [i18n],
      stubs: {
        CodeMirrorJsonEditor: {
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template:
            '<textarea aria-label="Response JSON" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
        },
        RuleTagPicker: true,
      },
    },
  })
  await flushPromises()
  await wrapper.get('input[autocomplete="off"]').setValue('https://api.test/items')
  return wrapper
}

describe('ResponseRuleEditor function response confirmation', () => {
  it('does not save function code when the safety confirmation is cancelled', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = await mountFunctionEditor()

    await wrapper.get('form').trigger('submit')

    expect(confirm).toHaveBeenCalledOnce()
    expect(confirm.mock.calls[0][0]).toContain('sandbox')
    expect(wrapper.emitted('save')).toBeUndefined()
  })

  it('saves a function response disabled after explicit confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const wrapper = await mountFunctionEditor()

    await wrapper.get('form').trigger('submit')

    expect(confirm).toHaveBeenCalledOnce()
    expect(wrapper.emitted('save')).toEqual([
      [
        {
          title: '',
          enabled: true,
          match: { url: 'https://api.test/items', type: 'normal', method: 'ANY' },
          mode: 'function',
          code: 'return { body: { ok: true } }',
          responseEnabled: false,
          tagIds: [],
        },
      ],
    ])
  })
})

describe('ResponseRuleEditor JSON editing modes', () => {
  it('creates and edits static JSON delivery modes, while legacy rules default to replacement', async () => {
    const created = await mountJsonEditor()
    expect(
      created.get('input[name="response-delivery-mode"][value="replace"]').element.checked
    ).toBe(true)
    await created.get('input[name="response-delivery-mode"][value="mock"]').setValue()
    await created.get('form').trigger('submit')
    expect(created.emitted('save')?.[0]?.[0]).toMatchObject({
      mode: 'json',
      deliveryMode: 'mock',
      status: 200,
    })

    const edited = await mountJsonEditor({
      id: 'mock-rule',
      enabled: true,
      match: { url: '/mock' },
      response: { enabled: true, mode: 'mock', replace: { status: 202, body: { ok: true } } },
    })
    expect(edited.get('input[name="response-delivery-mode"][value="mock"]').element.checked).toBe(
      true
    )
    await edited.get('form').trigger('submit')
    expect(edited.emitted('save')?.[0]?.[0]).toMatchObject({
      deliveryMode: 'mock',
      status: 202,
      body: { ok: true },
    })
  })

  it('hides mock mode for function responses and omits its delivery mode from saves', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const wrapper = await mountJsonEditor({
      id: 'mock-rule',
      enabled: true,
      match: { url: '/mock' },
      response: { enabled: true, mode: 'mock', replace: { status: 200, body: {} } },
    })
    await wrapper.get('input[name="response-mode"][value="function"]').setValue()
    expect(wrapper.find('input[name="response-delivery-mode"]').exists()).toBe(false)
    await wrapper.get('form').trigger('submit')
    expect(confirm).toHaveBeenCalledOnce()
    const savedFunction = wrapper.emitted('save')?.[0]?.[0]
    expect(savedFunction).toMatchObject({ mode: 'function' })
    expect(savedFunction).not.toHaveProperty('deliveryMode')

    wrapper.unmount()
    const switching = await mountJsonEditor({
      id: 'mock-rule',
      enabled: true,
      match: { url: '/mock' },
      response: { enabled: true, mode: 'mock', replace: { status: 200, body: {} } },
    })
    await switching.get('input[name="response-delivery-mode"][value="mock"]').setValue()
    await switching.get('input[name="response-mode"][value="function"]').setValue()
    await switching.get('input[name="response-mode"][value="json"]').setValue()
    expect(
      switching.get('input[name="response-delivery-mode"][value="replace"]').element.checked
    ).toBe(true)
    await switching.get('form').trigger('submit')
    expect(switching.emitted('save')?.[0]?.[0]).toMatchObject({ deliveryMode: 'replace' })
  })

  it('closes only through Cancel or X, keeps backdrop and Escape inert, and still saves', async () => {
    const wrapper = await mountJsonEditor()

    await wrapper.get('.editor-backdrop').trigger('click')
    await wrapper.get('.rule-editor').trigger('click')
    await wrapper.get('.rule-editor').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toBeUndefined()

    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('save')).toHaveLength(1)
    expect(wrapper.emitted('close')).toBeUndefined()

    await wrapper.get('.editor-actions .editor-button-secondary').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()

    const another = await mountJsonEditor()
    await another.get('.editor-close').trigger('click')
    expect(another.emitted('close')).toHaveLength(1)
  })

  it('keeps tree edits in the existing JSON save payload', async () => {
    const wrapper = await mountJsonEditor()

    await wrapper.get('input[name="json-editor-mode"][value="tree"]').setValue()
    await flushPromises()
    const tree = wrapper.getComponent(JsonTreeEditor)
    tree.vm.$emit('update:modelValue', '{\n  "ok": true\n}')
    await flushPromises()

    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('save')?.[0]?.[0]).toMatchObject({
      mode: 'json',
      status: 200,
      body: { ok: true },
    })
  })

  it('preserves invalid text when switching modes and blocks saving', async () => {
    const wrapper = await mountJsonEditor()
    const rawEditor = wrapper.get('textarea.response-json-input')
    await rawEditor.setValue('{ invalid json')

    await wrapper.get('input[name="json-editor-mode"][value="tree"]').setValue()
    await flushPromises()
    const tree = wrapper.getComponent(JsonTreeEditor)
    expect(tree.props('modelValue')).toBe('{ invalid json')
    expect(wrapper.get('.json-tree-invalid').exists()).toBe(true)

    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('save')).toBeUndefined()
    expect(wrapper.text()).toContain('JSON 格式有误')
  })

  it('wraps focus through tree disclosure controls while skipping collapsed descendants', async () => {
    const wrapper = await mountJsonEditor()
    await wrapper.get('textarea.response-json-input').setValue('  {"nested":{"ok":true}}')
    await wrapper.get('input[name="json-editor-mode"][value="tree"]').setValue()
    await flushPromises()

    const dialog = wrapper.get('.rule-editor').element
    const collapsedNode = dialog.querySelector(
      '.json-tree-editor__children > .json-tree-editor__child > details'
    )
    expect(collapsedNode).not.toBeNull()
    expect(collapsedNode.open).toBe(false)
    collapsedNode.querySelector(':scope > summary > button').remove()
    dialog.append(collapsedNode)

    const summary = collapsedNode.querySelector(':scope > summary')
    summary.focus()
    const forwardTab = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    })
    summary.dispatchEvent(forwardTab)

    expect(forwardTab.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(wrapper.get('.editor-close').element)

    const backwardTab = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })
    document.activeElement.dispatchEvent(backwardTab)

    expect(backwardTab.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(summary)
  })
})
