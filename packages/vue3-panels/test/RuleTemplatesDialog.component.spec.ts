import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import RuleTemplatesDialog from '../src/components/RuleTemplatesDialog.vue'
import { V3_RULE_TEMPLATE_CATALOG } from '../src/services/v3RuleTemplateCatalog.js'
import { i18n } from '../src/i18n/index.js'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('RuleTemplatesDialog', () => {
  it('renders the catalog and focuses the first apply action when opened', async () => {
    const wrapper = mount(RuleTemplatesDialog, {
      props: { open: false },
      global: { plugins: [i18n] },
      attachTo: document.body,
    })

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)

    await wrapper.setProps({ open: true })
    await wrapper.vm.$nextTick()

    expect(wrapper.get('[role="dialog"]').attributes('aria-modal')).toBe('true')
    expect(wrapper.findAll('.rule-template-card')).toHaveLength(V3_RULE_TEMPLATE_CATALOG.length)
    expect(wrapper.findAll('[data-testid^="rule-template-apply-"]')).toHaveLength(
      V3_RULE_TEMPLATE_CATALOG.length
    )
    expect(document.activeElement).toBe(
      wrapper.get(`[data-testid="rule-template-apply-${V3_RULE_TEMPLATE_CATALOG[0].templateId}"]`)
        .element
    )
  })

  it('emits the selected template ID and leaves closing to the parent', async () => {
    const wrapper = mount(RuleTemplatesDialog, {
      props: { open: true },
      global: { plugins: [i18n] },
    })

    for (const template of V3_RULE_TEMPLATE_CATALOG) {
      await wrapper
        .get(`[data-testid="rule-template-apply-${template.templateId}"]`)
        .trigger('click')
    }

    expect(wrapper.emitted('apply')).toEqual(
      V3_RULE_TEMPLATE_CATALOG.map((template) => [template.templateId])
    )
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(wrapper.get('[role="dialog"]').exists()).toBe(true)
  })

  it('disables every apply action while saving', async () => {
    const wrapper = mount(RuleTemplatesDialog, {
      props: { open: true, saving: true },
      global: { plugins: [i18n] },
    })

    const actions = wrapper.findAll('[data-testid^="rule-template-apply-"]')
    expect(actions).toHaveLength(V3_RULE_TEMPLATE_CATALOG.length)
    for (const action of actions) {
      expect((action.element as HTMLButtonElement).disabled).toBe(true)
      await action.trigger('click')
    }
    expect(wrapper.emitted('apply')).toBeUndefined()
  })

  it('shows operation issues and closes from the backdrop or Escape', async () => {
    const wrapper = mount(RuleTemplatesDialog, {
      props: { open: true, issue: 'Could not save this template.' },
      global: { plugins: [i18n] },
    })

    expect(wrapper.get('[role="alert"]').text()).toBe('Could not save this template.')

    await wrapper.get('.rule-editor').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toEqual([[]])

    await wrapper.get('.editor-backdrop').trigger('click', { self: true })
    expect(wrapper.emitted('close')).toEqual([[], []])
  })

  it('does not close when a click bubbles from inside the dialog', async () => {
    const wrapper = mount(RuleTemplatesDialog, {
      props: { open: true },
      global: { plugins: [i18n] },
    })

    await wrapper.get('.rule-editor').trigger('click')

    expect(wrapper.emitted('close')).toBeUndefined()
  })
})
