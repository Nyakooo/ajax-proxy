<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands'
import { javascript } from '@codemirror/lang-javascript'
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
  describedBy: {
    type: String,
    default: undefined,
  },
  language: {
    type: String,
    default: 'json',
    validator: (value) => ['json', 'javascript'].includes(value),
  },
  resizable: {
    type: Boolean,
    default: false,
  },
  resizeLabel: {
    type: String,
    default: 'Resize JSON editor height',
  },
})

const emit = defineEmits(['update:modelValue'])
const editorRoot = ref(null)
const editorHost = ref(null)
const editorHeight = ref(null)
const viewportHeight = ref(window.innerHeight)
const minimumHeight = 190
const maximumHeight = computed(() =>
  Math.max(minimumHeight, Math.floor(viewportHeight.value * 0.65))
)
let resizeDrag

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

const onWindowResize = () => {
  viewportHeight.value = window.innerHeight
}

const clampEditorHeight = (height) => Math.min(maximumHeight.value, Math.max(minimumHeight, height))

const onResizePointerDown = (event) => {
  if (event.button !== 0) return
  event.preventDefault()
  resizeDrag = {
    pointerId: event.pointerId,
    startY: event.clientY,
    startHeight: editorRoot.value.getBoundingClientRect().height,
  }
  event.currentTarget.setPointerCapture(event.pointerId)
}

const onResizePointerMove = (event) => {
  if (!resizeDrag || resizeDrag.pointerId !== event.pointerId) return
  editorHeight.value = clampEditorHeight(resizeDrag.startHeight + event.clientY - resizeDrag.startY)
}

const onResizePointerEnd = (event) => {
  if (!resizeDrag || resizeDrag.pointerId !== event.pointerId) return
  resizeDrag = undefined
}

const onResizeKeydown = (event) => {
  const currentHeight = editorHeight.value ?? editorRoot.value.getBoundingClientRect().height
  const step = event.shiftKey ? 48 : 16
  let nextHeight

  if (event.key === 'ArrowUp') nextHeight = currentHeight + step
  else if (event.key === 'ArrowDown') nextHeight = currentHeight - step
  else if (event.key === 'Home') nextHeight = minimumHeight
  else if (event.key === 'End') nextHeight = maximumHeight.value
  else return

  event.preventDefault()
  editorHeight.value = clampEditorHeight(nextHeight)
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
  window.addEventListener('resize', onWindowResize)
  const state = EditorState.create({
    doc: props.modelValue,
    extensions: [
      lineNumbers(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      history(),
      keymap.of([...historyKeymap, ...defaultKeymap]),
      props.language === 'javascript' ? javascript() : json(),
      syntaxHighlighting(defaultHighlightStyle),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({
        'aria-label': props.ariaLabel,
        'aria-describedby': props.describedBy,
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
  window.removeEventListener('resize', onWindowResize)
  if (!editorView) return
  editorHost.value?.removeEventListener('compositionend', onCompositionEnd)
  editorView.destroy()
  editorView = undefined
})
</script>

<template>
  <div
    ref="editorRoot"
    class="codemirror-json-editor"
    :class="{ 'codemirror-json-editor--resizable': resizable }"
    :style="editorHeight === null ? undefined : { height: `${editorHeight}px` }"
  >
    <div ref="editorHost" />
    <div
      v-if="resizable"
      class="codemirror-json-editor__resize-handle"
      role="separator"
      aria-orientation="horizontal"
      :aria-label="resizeLabel"
      :aria-valuemin="minimumHeight"
      :aria-valuemax="maximumHeight"
      :aria-valuenow="Math.round(editorHeight ?? minimumHeight)"
      tabindex="0"
      @pointerdown="onResizePointerDown"
      @pointermove="onResizePointerMove"
      @pointerup="onResizePointerEnd"
      @pointercancel="onResizePointerEnd"
      @keydown="onResizeKeydown"
    />
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

.codemirror-json-editor--resizable {
  position: relative;
  z-index: 0;
  isolation: isolate;
  resize: none !important;
}

.codemirror-json-editor__resize-handle {
  position: absolute;
  z-index: 1;
  right: 2px;
  bottom: 2px;
  width: 34px;
  height: 14px;
  border: 1px solid var(--cm-border, #d5d8dc);
  border-radius: 3px;
  background: var(--cm-background, #fff);
  color: var(--cm-gutter-foreground, #73777f);
  cursor: ns-resize;
  touch-action: none;
}

.codemirror-json-editor__resize-handle::before {
  position: absolute;
  top: 5px;
  left: 9px;
  width: 14px;
  height: 2px;
  background: currentColor;
  box-shadow: 0 4px currentColor;
  content: '';
}

.codemirror-json-editor__resize-handle:focus-visible {
  outline: 2px solid var(--cm-focus-ring, #3b82f6);
  outline-offset: 1px;
}
</style>
