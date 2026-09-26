import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ResponseRuleEditor from '../src/components/ResponseRuleEditor.vue'
import { i18n } from '../src/i18n/index.js'

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

async function mountFunctionEditor() {
  const wrapper = mount(ResponseRuleEditor, {
    props: { open: true },
    global: {
      plugins: [i18n],
      stubs: {
        CodeMirrorJsonEditor: true,
        RuleTagPicker: true,
      },
    },
  })
  await flushPromises()
  await wrapper.get('input[name="response-mode"][value="function"]').setValue()
  await wrapper.get('input[autocomplete="off"]').setValue('https://api.test/items')
  return wrapper
}

describe('ResponseRuleEditor function response confirmation', () => {
  it('does not save function code when the safety confirmation is cancelled', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = await mountFunctionEditor()

    await wrapper.get('form').trigger('submit')

    expect(confirm).toHaveBeenCalledOnce()
    expect(confirm.mock.calls[0][0]).toContain('sandbox')
    expect(wrapper.emitted('save')).toBeUndefined()
  })

  it('saves a function response disabled after explicit confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const wrapper = await mountFunctionEditor()

    await wrapper.get('form').trigger('submit')

    expect(confirm).toHaveBeenCalledOnce()
    expect(wrapper.emitted('save')).toEqual([
      [
        {
          enabled: true,
          match: { url: 'https://api.test/items', type: 'normal', method: 'ANY' },
          mode: 'function',
          code: 'return { body: { ok: true } }',
          responseEnabled: false,
          tagIds: [],
        },
      ],
    ])
  })
})
