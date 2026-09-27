import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CodeMirrorJsonEditor from '../src/components/editors/CodeMirrorJsonEditor.vue'

describe('CodeMirrorJsonEditor resizing', () => {
  it('keeps resizing opt-in and supports keyboard resizing when enabled', async () => {
    const defaultEditor = mount(CodeMirrorJsonEditor, { props: { modelValue: '{}' } })
    expect(defaultEditor.find('[role="separator"]').exists()).toBe(false)
    defaultEditor.unmount()

    const editor = mount(CodeMirrorJsonEditor, {
      props: { modelValue: '{}', resizable: true, resizeLabel: 'Resize JSON editor' },
    })
    const root = editor.get('.codemirror-json-editor').element as HTMLElement
    root.getBoundingClientRect = () => ({ height: 190 }) as DOMRect

    const handle = editor.get('[role="separator"]')
    expect(handle.attributes('aria-label')).toBe('Resize JSON editor')
    expect(handle.attributes('aria-valuenow')).toBe('190')

    await handle.trigger('keydown', { key: 'ArrowUp' })
    expect(handle.attributes('aria-valuenow')).toBe('206')
    expect(root.style.height).toBe('206px')

    await handle.trigger('keydown', { key: 'Home' })
    expect(handle.attributes('aria-valuenow')).toBe('190')
    expect(root.style.height).toBe('190px')

    editor.unmount()
  })
})
