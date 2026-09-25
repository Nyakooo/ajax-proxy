<script setup>
import { computed } from 'vue'
import JsonTreeNode from './JsonTreeNode.vue'

const props = defineProps({ modelValue: { type: String, required: true } })
const emit = defineEmits(['update:modelValue'])
const parsed = computed(() => {
  try {
    return { ok: true, value: JSON.parse(props.modelValue) }
  } catch {
    return { ok: false, value: null }
  }
})

function write(value) {
  emit('update:modelValue', JSON.stringify(value, null, 2))
}

function updateAt(path, nextValue) {
  if (!path.length) return write(nextValue)
  const root = structuredClone(parsed.value.value)
  const parent = path.slice(0, -1).reduce((value, key) => value[key], root)
  parent[path.at(-1)] = nextValue
  write(root)
}

function removeAt(path) {
  const root = structuredClone(parsed.value.value)
  const parent = path.slice(0, -1).reduce((value, key) => value[key], root)
  const key = path.at(-1)
  if (Array.isArray(parent)) parent.splice(key, 1)
  else delete parent[key]
  write(root)
}

function addAt(path) {
  const root = structuredClone(parsed.value.value)
  const target = path.reduce((value, key) => value[key], root)
  if (Array.isArray(target)) target.push(null)
  else {
    let index = Object.keys(target).length + 1
    let name = 'newKey' + index
    while (Object.hasOwn(target, name)) name = 'newKey' + ++index
    target[name] = null
  }
  write(root)
}

function moveAt(path, delta) {
  const root = structuredClone(parsed.value.value)
  const parent = path.slice(0, -1).reduce((value, key) => value[key], root)
  const index = path.at(-1)
  const target = index + delta
  if (!Array.isArray(parent) || target < 0 || target >= parent.length) return
  ;[parent[index], parent[target]] = [parent[target], parent[index]]
  write(root)
}
</script>

<template>
  <!-- eslint-disable vue/max-attributes-per-line, vue/html-self-closing -->
  <div v-if="parsed.ok" class="json-tree-prototype">
    <JsonTreeNode
      label="$"
      :value="parsed.value"
      :path="[]"
      root
      @update="updateAt"
      @remove="removeAt"
      @add="addAt"
      @move="moveAt"
    />
  </div>
  <p v-else class="json-tree-invalid" role="status">
    Correct the JSON in the text editor before switching to tree mode.
  </p>
</template>
