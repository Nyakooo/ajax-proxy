<script setup>
import { useI18n } from 'vue-i18n'

const props = defineProps({
  tags: { type: Array, default: () => [] },
  modelValue: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:modelValue'])
const { t } = useI18n({ useScope: 'global' })

function toggleTag(tagId, checked) {
  const selected = new Set(props.modelValue)
  if (checked) selected.add(tagId)
  else selected.delete(tagId)
  emit('update:modelValue', [...selected])
}
</script>

<template>
  <!-- eslint-disable vue/max-attributes-per-line, vue/html-self-closing, vue/singleline-html-element-content-newline -->
  <fieldset class="rule-tag-picker">
    <legend>{{ t('ruleTags.associationLegend') }}</legend>
    <p v-if="!tags.length" class="rule-tag-empty">{{ t('ruleTags.emptyPicker') }}</p>
    <label v-for="tag in tags" :key="tag.id">
      <input
        type="checkbox"
        :checked="modelValue.includes(tag.id)"
        @change="toggleTag(tag.id, $event.target.checked)"
      />
      <span>{{ tag.name }}</span>
    </label>
  </fieldset>
</template>

<style scoped>
.rule-tag-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  min-width: 0;
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--ap-border);
  border-radius: var(--ap-radius-control);
  color: var(--ap-ink);
  font-size: 12px;
}

.rule-tag-picker legend {
  padding: 0 5px;
  color: var(--ap-muted);
  font-weight: 600;
}

.rule-tag-picker label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.rule-tag-empty {
  flex-basis: 100%;
  margin: 0;
  color: var(--ap-muted);
}
</style>
