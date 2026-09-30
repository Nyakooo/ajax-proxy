import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import RedirectRuleEditor from '../src/components/RedirectRuleEditor.vue'
import { i18n } from '../src/i18n/index.js'

afterEach(() => {
  document.body.innerHTML = ''
})

async function mountEditor() {
  const wrapper = mount(RedirectRuleEditor, {
    props: { open: true },
    attachTo: document.body,
    global: {
      plugins: [i18n],
      stubs: { RuleTagPicker: true, CodeMirrorJsonEditor: true },
    },
  })
  await flushPromises()
  const inputs = wrapper.findAll('input[autocomplete="off"]')
  await inputs[0].setValue('/api/items')
  await inputs[2].setValue('https://api.test/items')
  return wrapper
}

describe('RedirectRuleEditor close behavior', () => {
  it('ignores outside clicks and Escape while preserving explicit close and save actions', async () => {
    const wrapper = await mountEditor()

    await wrapper.get('.editor-backdrop').trigger('click')
    await wrapper.get('.rule-editor').trigger('click')
    await wrapper.get('.rule-editor').trigger('keydown', { key: 'Escape' })
    document.body.click()
    expect(wrapper.emitted('close')).toBeUndefined()

    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('save')).toHaveLength(1)
    expect(wrapper.emitted('close')).toBeUndefined()

    await wrapper.get('.editor-actions .editor-button-secondary').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()

    const another = await mountEditor()
    await another.get('.editor-close').trigger('click')
    expect(another.emitted('close')).toHaveLength(1)
  })
})
