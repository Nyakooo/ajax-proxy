import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import RuleTagFilterPopover from '../src/components/RuleTagFilterPopover.vue'
import { i18n } from '../src/i18n/index.js'

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
})
