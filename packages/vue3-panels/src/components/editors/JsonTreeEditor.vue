<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import JsonTreeEditorNode from './JsonTreeEditorNode.vue'

defineOptions({ name: 'JsonTreeEditor' })

const props = defineProps({
  modelValue: { type: String, required: true },
  historyKey: { type: [String, Number], default: '' },
})
const emit = defineEmits(['update:modelValue'])
const { t } = useI18n()
const historyLimit = 100
const history = ref([props.modelValue])
const historyIndex = ref(0)
const canUndo = computed(() => historyIndex.value > 0)
const canRedo = computed(() => historyIndex.value < history.value.length - 1)

watch(
  () => [props.historyKey, props.modelValue],
  ([historyKey, modelValue], [previousHistoryKey]) => {
    if (historyKey !== previousHistoryKey || history.value[historyIndex.value] !== modelValue) {
      history.value = [modelValue]
      historyIndex.value = 0
    }
  }
)

const parsed = computed(() => {
  try {
    return { valid: true, value: JSON.parse(props.modelValue) }
  } catch {
    return { valid: false, value: null }
  }
})

function cloneRoot() {
  return structuredClone(parsed.value.value)
}

function getAt(root, path) {
  return path.reduce((value, key) => value[key], root)
}

function parentAt(root, path) {
  return getAt(root, path.slice(0, -1))
}

function write(root) {
  const nextValue = JSON.stringify(root, null, 2)
  if (nextValue === history.value[historyIndex.value]) return
  history.value = history.value.slice(0, historyIndex.value + 1)
  history.value.push(nextValue)
  if (history.value.length > historyLimit) history.value.shift()
  historyIndex.value = history.value.length - 1
  emit('update:modelValue', nextValue)
}

function undo() {
  if (!canUndo.value) return
  historyIndex.value -= 1
  emit('update:modelValue', history.value[historyIndex.value])
}

function redo() {
  if (!canRedo.value) return
  historyIndex.value += 1
  emit('update:modelValue', history.value[historyIndex.value])
}

function handleKeydown(event) {
  const target = event.target
  if (
    event.isComposing ||
    event.altKey ||
    (target instanceof Element &&
      target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'))
  )
    return
  if (!event.metaKey && !event.ctrlKey) return

  const key = event.key.toLowerCase()
  if (key === 'z' && event.shiftKey) {
    if (!canRedo.value) return
    event.preventDefault()
    redo()
  } else if (key === 'y' && !event.shiftKey) {
    if (!canRedo.value) return
    event.preventDefault()
    redo()
  } else if (key === 'z' && !event.shiftKey) {
    if (!canUndo.value) return
    event.preventDefault()
    undo()
  }
}

function updateAt(path, value) {
  const root = cloneRoot()
  if (path.length === 0) write(value)
  else {
    Object.defineProperty(parentAt(root, path), path.at(-1), {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    })
    write(root)
  }
}

function addAt(path) {
  const root = cloneRoot()
  const target = getAt(root, path)
  if (Array.isArray(target)) target.push(null)
  else {
    let index = Object.keys(target).length + 1
    let key = `newKey${index}`
    while (Object.hasOwn(target, key)) key = `newKey${++index}`
    target[key] = null
  }
  write(root)
}

function removeAt(path) {
  const root = cloneRoot()
  const parent = parentAt(root, path)
  const key = path.at(-1)
  if (Array.isArray(parent)) parent.splice(key, 1)
  else delete parent[key]
  write(root)
}

function moveAt(path, delta) {
  const root = cloneRoot()
  const parent = parentAt(root, path)
  const index = path.at(-1)
  const destination = index + delta
  if (!Array.isArray(parent) || destination < 0 || destination >= parent.length) return
  ;[parent[index], parent[destination]] = [parent[destination], parent[index]]
  write(root)
}

function nodeLabel(label) {
  return label === '$' ? t('responseEditor.tree.root') : String(label)
}
</script>

<template>
  <div
    v-if="parsed.valid"
    class="json-tree-editor"
    role="group"
    :aria-label="t('responseEditor.tree.label')"
    @keydown="handleKeydown"
  >
    <div class="json-tree-editor__history">
      <button
        type="button"
        :disabled="!canUndo"
        :aria-label="t('responseEditor.tree.undo')"
        @click="undo"
      >
        {{ t('responseEditor.tree.undo') }}
      </button>
      <button
        type="button"
        :disabled="!canRedo"
        :aria-label="t('responseEditor.tree.redo')"
        @click="redo"
      >
        {{ t('responseEditor.tree.redo') }}
      </button>
    </div>
    <JsonTreeEditorNode
      label="$"
      :value="parsed.value"
      :path="[]"
      root
      :node-label="nodeLabel"
      @update="updateAt"
      @add="addAt"
      @remove="removeAt"
      @move="moveAt"
    />
  </div>
  <!-- eslint-disable vue/max-attributes-per-line -->
  <p v-else class="json-tree-invalid" role="status">
    {{ t('responseEditor.tree.invalidJson') }}
  </p>
</template>
