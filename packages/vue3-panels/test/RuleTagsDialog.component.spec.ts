import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import RuleTagsDialog from '../src/components/RuleTagsDialog.vue'
import { i18n } from '../src/i18n/index.js'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('RuleTagsDialog', () => {
  it('emits new tag names and clears the create field', async () => {
    const wrapper = mount(RuleTagsDialog, {
      props: { open: true, tags: [] },
      global: { plugins: [i18n] },
    })
    const createInput = wrapper.get('.tag-create-form input')

    await createInput.setValue('  Platform  ')
    await wrapper.get('.tag-create-form').trigger('submit')

    expect(wrapper.emitted('create')).toEqual([['  Platform  ']])
    expect((createInput.element as HTMLInputElement).value).toBe('')
  })

  it('disables unchanged or blank rename values and emits changed names', async () => {
    const wrapper = mount(RuleTagsDialog, {
      props: { open: true, tags: [{ id: 'tag-a', name: 'Platform' }] },
      global: { plugins: [i18n] },
    })
    const renameInput = wrapper.get('.rule-tags-list input')
    const renameButton = wrapper.get('.rule-tags-list button')

    expect(renameButton.attributes('disabled')).toBeDefined()
    await renameInput.setValue('   ')
    expect(renameButton.attributes('disabled')).toBeDefined()

    await renameInput.setValue('Platform Team')
    expect(renameButton.attributes('disabled')).toBeUndefined()
    await renameButton.trigger('click')

    expect(wrapper.emitted('rename')).toEqual([['tag-a', 'Platform Team']])
  })

  it('names each remove button with its tag and emits the selected tag unless saving', async () => {
    const tags = [
      { id: 'tag-a', name: 'Platform' },
      { id: 'tag-b', name: 'Urgent' },
    ]
    const wrapper = mount(RuleTagsDialog, {
      props: { open: true, tags },
      global: { plugins: [i18n] },
    })
    const removeButtons = wrapper.findAll('.rule-tags-list li button:last-child')

    expect(removeButtons.map((button) => button.attributes('aria-label'))).toEqual([
      expect.stringContaining('Platform'),
      expect.stringContaining('Urgent'),
    ])
    await removeButtons[1].trigger('click')
    expect(wrapper.emitted('remove')).toEqual([[tags[1]]])

    await wrapper.setProps({ saving: true })
    expect(removeButtons.every((button) => button.attributes('disabled') !== undefined)).toBe(true)
  })

  it('focuses on open, traps Tab, and closes only through explicit buttons', async () => {
    const wrapper = mount(RuleTagsDialog, {
      attachTo: document.body,
      props: { open: false, tags: [] },
      global: { plugins: [i18n] },
    })

    await wrapper.setProps({ open: true })
    await nextTick()

    const dialog = wrapper.get('[role="dialog"]')
    const first = wrapper.get('.editor-close')
    const input = wrapper.get('.tag-create-form input')
    const last = wrapper.get('.editor-actions button')

    expect(document.activeElement).toBe(input.element)
    expect(dialog.attributes('aria-modal')).toBe('true')
    expect(dialog.attributes('aria-labelledby')).toBe('rule-tags-dialog-title')
    expect(wrapper.get('#rule-tags-dialog-title').exists()).toBe(true)

    first.element.focus()
    const shiftTab = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })
    first.element.dispatchEvent(shiftTab)
    expect(shiftTab.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(last.element)

    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    last.element.dispatchEvent(tab)
    expect(tab.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(first.element)

    dialog.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await input.setValue('Unsaved tag')
    await wrapper.get('.editor-backdrop').trigger('click')
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(input.element.value).toBe('Unsaved tag')
    await first.trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
