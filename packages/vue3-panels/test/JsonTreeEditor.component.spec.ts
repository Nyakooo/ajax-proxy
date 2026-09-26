import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'
import JsonTreeEditor from '../src/components/editors/JsonTreeEditor.vue'

const treeMessages = {
  label: 'JSON tree editor',
  root: 'Root',
  invalidJson: 'Fix JSON before using tree mode',
  array: 'Array',
  object: 'Object',
  addChild: 'Add child to {label}',
  add: 'Add',
  key: 'Key',
  keyFor: 'Key for {label}',
  duplicateKey: 'Key must be unique and non-empty',
  moveUp: 'Move item {index} up',
  moveDown: 'Move item {index} down',
  up: 'Up',
  down: 'Down',
  remove: 'Remove {label}',
  removeAction: 'Remove',
  valueFor: 'Value for {label}',
  changeTypeFor: 'Change type for {label}',
  null: 'Null',
  string: 'String',
  number: 'Number',
  boolean: 'Boolean',
  undo: 'Undo',
  redo: 'Redo',
}

function mountEditor(modelValue: string) {
  return mount(JsonTreeEditor, {
    props: { modelValue },
    global: {
      plugins: [
        createI18n({
          legacy: false,
          locale: 'en',
          messages: { en: { responseEditor: { tree: treeMessages } } },
        }),
      ],
    },
  })
}

function emittedJson(wrapper: ReturnType<typeof mountEditor>) {
  const events = wrapper.emitted('update:modelValue')
  return JSON.parse(events?.at(-1)?.[0] as string)
}

async function syncModel(wrapper: ReturnType<typeof mountEditor>) {
  const value = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as string
  await wrapper.setProps({ modelValue: value })
}

describe('JsonTreeEditor', () => {
  it('round trips objects and arrays without writing on mount', () => {
    const source = '{"name":"Ada","items":[1,2]}'
    const wrapper = mountEditor(source)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.findAll('.json-tree-editor__node')).toHaveLength(2)
  })

  it('renames object keys, rejects duplicate keys, and moves array entries', async () => {
    const wrapper = mountEditor('{"first":1,"second":2,"items":["a","b"]}')
    const firstKey = wrapper.get('input[aria-label="Key for first"]')
    await firstKey.setValue('renamed')
    expect(emittedJson(wrapper)).toEqual({ renamed: 1, second: 2, items: ['a', 'b'] })
    await syncModel(wrapper)

    const secondKey = wrapper.get('input[aria-label="Key for second"]')
    await secondKey.setValue('renamed')
    expect(emittedJson(wrapper)).toEqual({ renamed: 1, second: 2, items: ['a', 'b'] })
    expect(wrapper.text()).toContain('Key must be unique and non-empty')

    await syncModel(wrapper)
    await wrapper.get('button[aria-label="Move item 2 up"]').trigger('click')
    expect(emittedJson(wrapper).items).toEqual(['b', 'a'])
  })

  it('adds and removes object properties and array entries', async () => {
    const wrapper = mountEditor('{"items":[1]}')
    await wrapper.get('button[aria-label="Add child to Root"]').trigger('click')
    expect(emittedJson(wrapper)).toEqual({ items: [1], newKey2: null })
    await syncModel(wrapper)
    await wrapper.get('button[aria-label="Remove newKey2"]').trigger('click')
    expect(emittedJson(wrapper)).toEqual({ items: [1] })
    await syncModel(wrapper)
    await wrapper.get('button[aria-label="Add child to items"]').trigger('click')
    expect(emittedJson(wrapper)).toEqual({ items: [1, null] })
  })

  it('preserves malformed JSON verbatim and exposes no mutating controls', () => {
    const source = '{ malformed'
    const wrapper = mountEditor(source)
    expect(wrapper.get('[role="status"]').text()).toBe('Fix JSON before using tree mode')
    expect(wrapper.findAll('button, input, select')).toHaveLength(0)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('handles null and scalar roots including type conversion', async () => {
    const nullWrapper = mountEditor('null')
    expect(nullWrapper.find('.json-tree-editor__leaf').exists()).toBe(true)
    await nullWrapper.get('select[aria-label="Change type for Root"]').setValue('object')
    expect(emittedJson(nullWrapper)).toEqual({})

    const scalarWrapper = mountEditor('42')
    await scalarWrapper.get('input[aria-label="Value for Root"]').setValue('43')
    expect(emittedJson(scalarWrapper)).toBe(43)
    await scalarWrapper.get('select[aria-label="Change type for Root"]').setValue('string')
    expect(emittedJson(scalarWrapper)).toBe('')
  })

  it('undoes and redoes multiple tree edits and starts a new branch after undo', async () => {
    const wrapper = mountEditor('{"items":[1]}')
    await wrapper.get('button[aria-label="Add child to Root"]').trigger('click')
    await syncModel(wrapper)
    await wrapper.get('button[aria-label="Add child to items"]').trigger('click')
    expect(emittedJson(wrapper)).toEqual({ items: [1, null], newKey2: null })
    await syncModel(wrapper)

    await wrapper.get('.json-tree-editor').trigger('keydown', { key: 'z', ctrlKey: true })
    expect(JSON.parse(wrapper.emitted('update:modelValue')?.at(-1)?.[0] as string)).toEqual({
      items: [1],
      newKey2: null,
    })
    await syncModel(wrapper)

    await wrapper
      .get('.json-tree-editor')
      .trigger('keydown', { key: 'z', ctrlKey: true, shiftKey: true })
    expect(emittedJson(wrapper)).toEqual({ items: [1, null], newKey2: null })
    await syncModel(wrapper)

    await wrapper.get('.json-tree-editor').trigger('keydown', { key: 'z', metaKey: true })
    expect(emittedJson(wrapper)).toEqual({ items: [1], newKey2: null })
    await syncModel(wrapper)
    await wrapper.get('button[aria-label="Add child to items"]').trigger('click')
    expect(emittedJson(wrapper)).toEqual({ items: [1, null], newKey2: null })
    await syncModel(wrapper)
    const countBeforeRedo = wrapper.emitted('update:modelValue')?.length
    await wrapper.get('.json-tree-editor').trigger('keydown', { key: 'y', ctrlKey: true })
    expect(wrapper.emitted('update:modelValue')).toHaveLength(countBeforeRedo)
  })

  it('resets undo history when historyKey changes', async () => {
    const wrapper = mount(JsonTreeEditor, {
      props: { modelValue: '{"items":[]}', historyKey: 'rule-a' },
      global: {
        plugins: [
          createI18n({
            legacy: false,
            locale: 'en',
            messages: { en: { responseEditor: { tree: treeMessages } } },
          }),
        ],
      },
    })
    await wrapper.get('button[aria-label="Add child to items"]').trigger('click')
    await syncModel(wrapper)
    await wrapper.setProps({ modelValue: '{"items":[9]}', historyKey: 'rule-b' })
    const countBeforeUndo = wrapper.emitted('update:modelValue')?.length
    await wrapper.get('.json-tree-editor').trigger('keydown', { key: 'z', ctrlKey: true })
    expect(wrapper.emitted('update:modelValue')).toHaveLength(countBeforeUndo)
  })

  it('leaves native input undo to the browser', async () => {
    const wrapper = mountEditor('{"value":"before"}')
    const valueInput = wrapper.get('input[aria-label="Value for value"]')
    await valueInput.setValue('after')
    await syncModel(wrapper)
    const countBeforeUndo = wrapper.emitted('update:modelValue')?.length
    const event = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    valueInput.element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(wrapper.emitted('update:modelValue')).toHaveLength(countBeforeUndo)
  })
})
