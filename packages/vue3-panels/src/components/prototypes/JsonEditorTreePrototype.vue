<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import JSONEditor from 'jsoneditor'
import 'jsoneditor/dist/jsoneditor.min.css'

const props = defineProps({ modelValue: { type: String, required: true } })
const emit = defineEmits(['update:modelValue'])
const host = ref(null)
let editor

const parsed = computed(() => {
  try {
    return { ok: true, value: JSON.parse(props.modelValue) }
  } catch {
    return { ok: false }
  }
})

function mountEditor() {
  if (!host.value || editor || !parsed.value.ok) return
  editor = new JSONEditor(host.value, {
    mode: 'tree',
    modes: ['tree'],
    mainMenuBar: false,
    navigationBar: false,
    statusBar: false,
    onChangeJSON(value) {
      emit('update:modelValue', JSON.stringify(value, null, 2))
    },
  })
  editor.set(parsed.value.value)
}

onMounted(mountEditor)

watch(
  () => props.modelValue,
  (draft) => {
    if (!parsed.value.ok) return
    if (!editor) {
      mountEditor()
      return
    }
    try {
      const nextValue = JSON.parse(draft)
      if (JSON.stringify(editor.get()) !== JSON.stringify(nextValue)) editor.set(nextValue)
    } catch {
      // The tree editor keeps its last valid data while text mode contains invalid JSON.
    }
  },
  { flush: 'post' }
)

onBeforeUnmount(() => editor?.destroy())
</script>

<template>
  <!-- eslint-disable vue/max-attributes-per-line, vue/singleline-html-element-content-newline -->
  <div
    v-if="parsed.ok"
    ref="host"
    class="jsoneditor-tree-prototype"
    aria-label="JSONEditor tree prototype"
  />
  <p v-else class="json-tree-invalid" role="status">
    Correct the JSON in the text editor before switching to tree mode.
  </p>
</template>

<style>
.jsoneditor-tree-prototype {
  min-height: 550px;
  overflow: auto;
  border: 1px solid #dce8e6;
  border-radius: 8px;
}

.jsoneditor-tree-prototype .jsoneditor {
  border: 0;
}

.jsoneditor-tree-prototype .jsoneditor-menu {
  display: none;
}
</style>
