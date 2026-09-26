<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

defineOptions({ name: 'JsonTreeEditorNode' })

const props = defineProps({
  label: { type: [String, Number], required: true },
  value: { type: null, required: true },
  path: { type: Array, required: true },
  root: { type: Boolean, default: false },
  nodeLabel: { type: Function, required: true },
})
const emit = defineEmits(['update', 'add', 'remove', 'move'])
const { t } = useI18n()
const keyErrors = ref({})
const composite = computed(() => props.value !== null && typeof props.value === 'object')
const array = computed(() => Array.isArray(props.value))
const kind = computed(() =>
  props.value === null ? 'null' : array.value ? 'array' : typeof props.value
)
const keys = computed(() => (composite.value ? Object.keys(props.value) : []))
const typeOptions = ['string', 'number', 'boolean', 'null', 'object', 'array']

function convert(type) {
  if (type === 'string') return ''
  if (type === 'number') return 0
  if (type === 'boolean') return false
  if (type === 'object') return {}
  if (type === 'array') return []
  return null
}

function changeScalar(event) {
  const raw = event.target.value
  if (kind.value === 'number') {
    const value = raw.trim() === '' ? NaN : Number(raw)
    if (Number.isFinite(value)) emit('update', props.path, value)
  } else if (kind.value === 'boolean') emit('update', props.path, raw === 'true')
  else emit('update', props.path, raw)
}

function renameChild(key, event) {
  const nextKey = event.target.value.trim()
  const oldKey = String(key)
  const duplicate = nextKey !== oldKey && Object.hasOwn(props.value, nextKey)
  if (!nextKey || duplicate) {
    keyErrors.value = { ...keyErrors.value, [oldKey]: true }
    event.target.value = oldKey
    return
  }
  keyErrors.value = { ...keyErrors.value, [oldKey]: false }
  const renamed = Object.create(null)
  for (const [entryKey, entryValue] of Object.entries(props.value)) {
    Object.defineProperty(renamed, entryKey === oldKey ? nextKey : entryKey, {
      value: entryValue,
      writable: true,
      enumerable: true,
      configurable: true,
    })
  }
  emit('update', props.path, renamed)
}
</script>

<template>
  <!-- eslint-disable vue/max-attributes-per-line, vue/html-self-closing, vue/singleline-html-element-content-newline -->
  <details v-if="composite" class="json-tree-editor__node" :open="root">
    <summary>
      <span class="json-tree-editor__node-label">{{ nodeLabel(label) }}</span>
      <span class="json-tree-editor__kind">
        {{ t(array ? 'responseEditor.tree.array' : 'responseEditor.tree.object') }} ·
        {{ keys.length }}
      </span>
      <button
        type="button"
        :aria-label="t('responseEditor.tree.addChild', { label: nodeLabel(label) })"
        @click.stop.prevent="$emit('add', path)"
      >
        {{ t('responseEditor.tree.add') }}
      </button>
    </summary>
    <div class="json-tree-editor__children">
      <div v-for="(child, key) in value" :key="key" class="json-tree-editor__child">
        <label v-if="!array" class="json-tree-editor__key">
          <span>{{ t('responseEditor.tree.key') }}</span>
          <input
            :value="key"
            :aria-label="t('responseEditor.tree.keyFor', { label: String(key) })"
            @change="renameChild(key, $event)"
          />
          <span v-if="keyErrors[String(key)]" role="status">
            {{ t('responseEditor.tree.duplicateKey') }}
          </span>
        </label>
        <JsonTreeEditorNode
          :label="key"
          :value="child"
          :path="[...path, array ? Number(key) : key]"
          :node-label="nodeLabel"
          @update="(childPath, next) => emit('update', childPath, next)"
          @add="(childPath) => emit('add', childPath)"
          @remove="(childPath) => emit('remove', childPath)"
          @move="(childPath, delta) => emit('move', childPath, delta)"
        />
        <div class="json-tree-editor__actions">
          <button
            v-if="array"
            type="button"
            :disabled="Number(key) === 0"
            :aria-label="t('responseEditor.tree.moveUp', { index: Number(key) + 1 })"
            @click="emit('move', [...path, Number(key)], -1)"
          >
            {{ t('responseEditor.tree.up') }}
          </button>
          <button
            v-if="array"
            type="button"
            :disabled="Number(key) === value.length - 1"
            :aria-label="t('responseEditor.tree.moveDown', { index: Number(key) + 1 })"
            @click="emit('move', [...path, Number(key)], 1)"
          >
            {{ t('responseEditor.tree.down') }}
          </button>
          <button
            type="button"
            :aria-label="t('responseEditor.tree.remove', { label: nodeLabel(key) })"
            @click="emit('remove', [...path, array ? Number(key) : key])"
          >
            {{ t('responseEditor.tree.removeAction') }}
          </button>
        </div>
      </div>
    </div>
  </details>
  <div v-else class="json-tree-editor__leaf">
    <span class="json-tree-editor__node-label">{{ nodeLabel(label) }}</span>
    <template v-if="kind === 'string' || kind === 'number'">
      <input
        :type="kind === 'number' ? 'number' : 'text'"
        :value="value"
        :aria-label="t('responseEditor.tree.valueFor', { label: nodeLabel(label) })"
        @change="changeScalar"
      />
    </template>
    <select
      v-else-if="kind === 'boolean'"
      :value="String(value)"
      :aria-label="t('responseEditor.tree.valueFor', { label: nodeLabel(label) })"
      @change="changeScalar"
    >
      <option value="true">true</option>
      <option value="false">false</option>
    </select>
    <span v-else>{{ t('responseEditor.tree.null') }}</span>
    <select
      :value="kind"
      :aria-label="t('responseEditor.tree.changeTypeFor', { label: nodeLabel(label) })"
      @change="emit('update', path, convert($event.target.value))"
    >
      <option v-for="type in typeOptions" :key="type" :value="type">
        {{ t('responseEditor.tree.' + type) }}
      </option>
    </select>
  </div>
</template>
