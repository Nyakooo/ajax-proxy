<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands'
import { json } from '@codemirror/lang-json'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view'

const props = defineProps({
  modelValue: {
    type: String,
    required: true,
  },
  ariaLabel: {
    type: String,
    default: 'JSON editor',
  },
})

const emit = defineEmits(['update:modelValue'])
const editorHost = ref(null)

let editorView
let pendingExternalValue = null
let applyingExternalValue = false

const applyExternalValue = (value) => {
  if (!editorView || editorView.state.doc.toString() === value) return

  applyingExternalValue = true
  try {
    editorView.dispatch({
      changes: {
        from: 0,
        to: editorView.state.doc.length,
        insert: value,
      },
    })
  } finally {
    applyingExternalValue = false
  }
}

const flushPendingExternalValue = () => {
  if (pendingExternalValue === null) return
  const value = pendingExternalValue
  pendingExternalValue = null
  applyExternalValue(value)
}

const onCompositionEnd = () => {
  queueMicrotask(flushPendingExternalValue)
}

watch(
  () => props.modelValue,
  (value) => {
    if (!editorView) return
    if (editorView.composing) {
      pendingExternalValue = value
      return
    }
    applyExternalValue(value)
  },
  { flush: 'post' }
)

onMounted(() => {
  const state = EditorState.create({
    doc: props.modelValue,
    extensions: [
      lineNumbers(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      history(),
      keymap.of([...historyKeymap, ...defaultKeymap]),
      json(),
      syntaxHighlighting(defaultHighlightStyle),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({
        'aria-label': props.ariaLabel,
        'aria-multiline': 'true',
        spellcheck: 'false',
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !applyingExternalValue) {
          emit('update:modelValue', update.state.doc.toString())
        }
      }),
      EditorView.theme({
        '&': {
          color: 'var(--cm-foreground, #202124)',
          backgroundColor: 'var(--cm-background, #fff)',
          fontSize: '13px',
        },
        '.cm-content': {
          minHeight: '12rem',
          padding: '0.75rem 0',
          caretColor: 'var(--cm-caret, #202124)',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        },
        '.cm-gutters': {
          color: 'var(--cm-gutter-foreground, #73777f)',
          backgroundColor: 'var(--cm-gutter-background, #f7f7f8)',
          borderRight: '1px solid var(--cm-border, #e1e3e6)',
        },
        '.cm-activeLineGutter, .cm-activeLine': {
          backgroundColor: 'var(--cm-active-line, #f3f6fc)',
        },
        '&.cm-focused': {
          outline: 'none',
        },
      }),
    ],
  })

  editorView = new EditorView({
    state,
    parent: editorHost.value,
  })
  editorHost.value.addEventListener('compositionend', onCompositionEnd)
})

onBeforeUnmount(() => {
  if (!editorView) return
  editorHost.value?.removeEventListener('compositionend', onCompositionEnd)
  editorView.destroy()
  editorView = undefined
})
</script>

<template>
  <div class="codemirror-json-editor">
    <div ref="editorHost" />
  </div>
</template>

<style scoped>
.codemirror-json-editor {
  overflow: auto;
  border: 1px solid var(--cm-border, #d5d8dc);
  border-radius: 0.375rem;
}

.codemirror-json-editor:focus-within {
  outline: 2px solid var(--cm-focus-ring, #3b82f6);
  outline-offset: 2px;
}
</style>
