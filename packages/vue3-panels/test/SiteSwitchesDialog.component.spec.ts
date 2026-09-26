import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import SiteSwitchesDialog from '../src/components/SiteSwitchesDialog.vue'
import { i18n } from '../src/i18n/index.js'

describe('SiteSwitchesDialog', () => {
  it('focuses on open, emits normalized origins, and emits enable for a disabled origin', async () => {
    const wrapper = mount(SiteSwitchesDialog, {
      attachTo: document.body,
      props: { open: false, disabledOrigins: [] },
      global: { plugins: [i18n] },
    })

    await wrapper.setProps({ open: true })
    await nextTick()
    const input = wrapper.get<HTMLInputElement>('#site-switch-origin')
    expect(document.activeElement).toBe(input.element)

    await input.setValue('https://example.com:8443/path?private=value')
    expect(wrapper.get('.site-switch-preview').text()).toContain('https://example.com:8443')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('disable')).toEqual([['https://example.com:8443']])

    await wrapper.setProps({ disabledOrigins: ['https://example.com:8443'] })
    await wrapper.get('[aria-label="启用站点 https://example.com:8443"]').trigger('click')
    expect(wrapper.emitted('enable')).toEqual([['https://example.com:8443']])
  })
})

afterEach(() => {
  document.body.innerHTML = ''
})
