import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import RuleTagPicker from '../src/components/RuleTagPicker.vue'
import { i18n } from '../src/i18n/index.js'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('RuleTagPicker', () => {
  it('removes and adds a tag while preserving the current selection', async () => {
    const wrapper = mount(RuleTagPicker, {
      props: {
        tags: [
          { id: 'tag-a', name: 'Platform' },
          { id: 'tag-b', name: 'Network' },
          { id: 'tag-c', name: 'Storage' },
        ],
        modelValue: ['tag-a', 'tag-b'],
      },
      global: { plugins: [i18n] },
    })
    let checkboxes = wrapper.findAll('input[type="checkbox"]')

    expect(checkboxes.map((checkbox) => (checkbox.element as HTMLInputElement).checked)).toEqual([
      true,
      true,
      false,
    ])

    await checkboxes[0].setValue(false)
    expect(wrapper.emitted('update:modelValue')).toEqual([[['tag-b']]])

    await wrapper.setProps({ modelValue: ['tag-b'] })
    checkboxes = wrapper.findAll('input[type="checkbox"]')
    expect(checkboxes.map((checkbox) => (checkbox.element as HTMLInputElement).checked)).toEqual([
      false,
      true,
      false,
    ])

    await checkboxes[2].setValue(true)
    expect(wrapper.emitted('update:modelValue')).toEqual([[['tag-b']], [['tag-b', 'tag-c']]])
  })

  it('shows the empty state when no tags are available', () => {
    const wrapper = mount(RuleTagPicker, {
      props: { tags: [], modelValue: [] },
      global: { plugins: [i18n] },
    })

    expect(wrapper.get('.rule-tag-empty').exists()).toBe(true)
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
  })
})
