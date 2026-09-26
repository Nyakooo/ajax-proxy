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

  it('focuses on open, traps Tab at both ends, exposes dialog naming, and closes on Escape', async () => {
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
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
