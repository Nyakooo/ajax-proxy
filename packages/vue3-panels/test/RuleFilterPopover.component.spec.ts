import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import RuleFilterPopover from '../src/components/RuleFilterPopover.vue'
import { i18n } from '../src/i18n/index.js'

afterEach(() => {
  document.body.innerHTML = ''
})

function mountPopover(props = {}) {
  return mount(RuleFilterPopover, {
    props,
    global: { plugins: [i18n] },
  })
}

describe('RuleFilterPopover', () => {
  it('reflects the selected status and match type props', () => {
    const wrapper = mountPopover({ open: true, status: 'disabled', matchType: 'exact' })

    expect(wrapper.get('input[name="rule-status-filter"][value="disabled"]').element.checked).toBe(
      true
    )
    expect(wrapper.get('input[name="rule-status-filter"][value="enabled"]').element.checked).toBe(
      false
    )
    expect(wrapper.get('input[name="rule-match-type-filter"][value="exact"]').element.checked).toBe(
      true
    )
    expect(wrapper.get('input[name="rule-match-type-filter"][value="regex"]').element.checked).toBe(
      false
    )
  })

  it('emits the selected status and match type independently', async () => {
    const wrapper = mountPopover({ open: true })

    await wrapper.get('input[name="rule-status-filter"][value="enabled"]').trigger('change')
    await wrapper.get('input[name="rule-match-type-filter"][value="regex"]').trigger('change')

    expect(wrapper.emitted('update:status')).toEqual([['enabled']])
    expect(wrapper.emitted('update:matchType')).toEqual([['regex']])
  })

  it('emits clear when the clear action is selected', async () => {
    const wrapper = mountPopover({ open: true })

    await wrapper.get('.filter-actions button').trigger('click')

    expect(wrapper.emitted('clear')).toEqual([[]])
  })

  it('closes from the close button and Escape key', async () => {
    const wrapper = mountPopover({ open: true })

    await wrapper.get('.filter-close').trigger('click')
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })

    expect(wrapper.emitted('close')).toEqual([[], []])
  })

  it('does not render the dialog when closed', () => {
    const wrapper = mountPopover({ open: false })

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })
})
