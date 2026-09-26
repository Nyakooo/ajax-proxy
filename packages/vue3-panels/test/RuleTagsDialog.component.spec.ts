import { mount } from '@vue/test-utils'
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
})
