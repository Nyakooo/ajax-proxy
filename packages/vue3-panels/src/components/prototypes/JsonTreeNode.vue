<script setup>
defineOptions({ name: 'JsonTreeNode' })

defineProps({
  label: { type: [String, Number], required: true },
  value: { type: null, required: true },
  path: { type: Array, required: true },
  root: { type: Boolean, default: false },
})

const emit = defineEmits(['update', 'remove', 'add', 'move'])

function kindOf(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function editScalar(value, type) {
  if (type === 'string') return value
  if (type === 'number') return Number(value)
  if (type === 'boolean') return value === 'true'
  if (type === 'object') return {}
  if (type === 'array') return []
  return null
}
</script>

<template>
  <!-- eslint-disable vue/max-attributes-per-line, vue/singleline-html-element-content-newline, vue/html-self-closing -->
  <details v-if="value !== null && typeof value === 'object'" class="json-tree-node" :open="root">
    <summary>
      <span class="json-tree-label">{{ label }}</span>
      <code>{{ Array.isArray(value) ? 'array' : 'object' }} · {{ Object.keys(value).length }}</code>
      <button type="button" @click.stop.prevent="emit('add', path)">+ child</button>
    </summary>
    <div class="json-tree-children">
      <div v-for="(child, key) in value" :key="key" class="json-tree-child">
        <JsonTreeNode
          :label="key"
          :value="child"
          :path="[...path, Array.isArray(value) ? Number(key) : key]"
          @update="(childPath, next) => emit('update', childPath, next)"
          @remove="(childPath) => emit('remove', childPath)"
          @add="(childPath) => emit('add', childPath)"
          @move="(childPath, delta) => emit('move', childPath, delta)"
        />
        <div class="json-tree-child-actions">
          <button
            v-if="Array.isArray(value)"
            type="button"
            :disabled="Number(key) === 0"
            :aria-label="'Move array item ' + (Number(key) + 1) + ' up'"
            @click="emit('move', [...path, Number(key)], -1)"
          >
            ↑
          </button>
          <button
            v-if="Array.isArray(value)"
            type="button"
            :disabled="Number(key) === value.length - 1"
            :aria-label="'Move array item ' + (Number(key) + 1) + ' down'"
            @click="emit('move', [...path, Number(key)], 1)"
          >
            ↓
          </button>
          <button
            type="button"
            :aria-label="'Remove ' + key"
            @click="emit('remove', [...path, Array.isArray(value) ? Number(key) : key])"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  </details>
  <div v-else class="json-tree-leaf">
    <span class="json-tree-label">{{ label }}</span>
    <code>{{ kindOf(value) }}</code>
    <input
      v-if="typeof value === 'string' || typeof value === 'number'"
      :aria-label="'Value for ' + label"
      :value="value"
      :type="typeof value === 'number' ? 'number' : 'text'"
      @change="emit('update', path, editScalar($event.target.value, typeof value))"
    />
    <select
      v-else-if="typeof value === 'boolean'"
      :aria-label="'Value for ' + label"
      :value="String(value)"
      @change="emit('update', path, editScalar($event.target.value, 'boolean'))"
    >
      <option value="true">true</option>
      <option value="false">false</option>
    </select>
    <span v-else>null</span>
    <select
      :aria-label="'Change type for ' + label"
      :value="kindOf(value)"
      @change="emit('update', path, editScalar('', $event.target.value))"
    >
      <option value="string">string</option>
      <option value="number">number</option>
      <option value="boolean">boolean</option>
      <option value="null">null</option>
      <option value="object">object</option>
      <option value="array">array</option>
    </select>
  </div>
</template>
