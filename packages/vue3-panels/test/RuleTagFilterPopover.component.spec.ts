import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import RuleTagFilterPopover from '../src/components/RuleTagFilterPopover.vue'
import { i18n } from '../src/i18n/index.js'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('RuleTagFilterPopover', () => {
  it('emits a selected tag ID and the empty value when clearing the filter', async () => {
    const wrapper = mount(RuleTagFilterPopover, {
      props: {
        open: true,
        tags: [
          { id: 'team-a', name: 'Team A' },
          { id: 'team-b', name: 'Team B' },
        ],
        selectedTagId: 'team-a',
      },
      global: { plugins: [i18n] },
    })

    await wrapper.get('input[value="team-b"]').trigger('change')
    await wrapper.get('input[value=""]').trigger('change')

    expect(wrapper.emitted('update:selectedTagId')).toEqual([['team-b'], ['']])
  })

  it('focuses the first filter when opened and closes on Escape', async () => {
    const wrapper = mount(RuleTagFilterPopover, {
      props: { open: false, tags: [{ id: 'team-a', name: 'Team A' }] },
      global: { plugins: [i18n] },
      attachTo: document.body,
    })

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    await wrapper.setProps({ open: true })
    await wrapper.vm.$nextTick()

    expect(document.activeElement).toBe(wrapper.get('input[value=""]').element)
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })

    expect(wrapper.emitted('close')).toEqual([[]])
  })
})
