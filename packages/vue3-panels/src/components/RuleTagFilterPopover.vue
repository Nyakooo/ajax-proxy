<script setup>
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  open: { type: Boolean, default: false },
  tags: { type: Array, default: () => [] },
  selectedTagId: { type: String, default: '' },
})

const emit = defineEmits(['close', 'update:selectedTagId', 'manage'])
const { t } = useI18n({ useScope: 'global' })
const firstInput = ref(null)

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    await nextTick()
    firstInput.value?.focus()
  }
)
</script>

<template>
  <!-- eslint-disable vue/max-attributes-per-line, vue/html-self-closing, vue/singleline-html-element-content-newline -->
  <section
    v-if="open"
    id="rule-tag-filter-popover"
    class="rule-tag-filter-popover"
    role="dialog"
    aria-modal="false"
    aria-labelledby="rule-tag-filter-title"
    @keydown.esc.stop.prevent="emit('close')"
  >
    <header>
      <h2 id="rule-tag-filter-title">{{ t('ruleTags.filterTitle') }}</h2>
      <button type="button" :aria-label="t('ruleTags.close')" @click="emit('close')">×</button>
    </header>

    <fieldset>
      <legend>{{ t('ruleTags.filterLegend') }}</legend>
      <label>
        <input
          ref="firstInput"
          type="radio"
          name="rule-tag-filter"
          value=""
          :checked="selectedTagId === ''"
          @change="emit('update:selectedTagId', '')"
        />
        <span>{{ t('ruleTags.allTags') }}</span>
      </label>
      <label v-for="tag in tags" :key="tag.id">
        <input
          type="radio"
          name="rule-tag-filter"
          :value="tag.id"
          :checked="selectedTagId === tag.id"
          @change="emit('update:selectedTagId', tag.id)"
        />
        <span>{{ tag.name }}</span>
      </label>
      <p v-if="!tags.length" class="tag-filter-empty">{{ t('ruleTags.emptyFilter') }}</p>
    </fieldset>

    <footer>
      <button type="button" @click="emit('manage')">{{ t('ruleTags.manage') }}</button>
      <button type="button" @click="emit('close')">{{ t('ruleTags.done') }}</button>
    </footer>
  </section>
</template>

<style scoped>
.rule-tag-filter-popover {
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  z-index: 30;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: min(20rem, calc(100vw - 2rem));
  max-height: min(32rem, calc(100vh - 2rem));
  overflow: hidden;
  color: var(--ap-ink);
  background: var(--ap-card);
  border: 1px solid var(--ap-border);
  border-radius: var(--ap-radius-panel);
  box-shadow: 0 0.75rem 2rem rgb(15 23 42 / 16%);
}

header,
footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
}

header {
  border-bottom: 1px solid var(--ap-border);
}

header h2 {
  margin: 0;
  font-size: 1rem;
}

header button,
footer button {
  padding: 0.4rem 0.65rem;
  color: var(--ap-teal);
  background: transparent;
  border: 0;
  border-radius: 0.375rem;
  font: inherit;
  cursor: pointer;
}

header button {
  color: var(--ap-muted);
  font-size: 1.25rem;
}

fieldset {
  display: grid;
  gap: 0.5rem;
  min-width: 0;
  overflow-y: auto;
  margin: 0;
  padding: 0.75rem 1rem;
  border: 0;
}

legend {
  padding: 0;
  font-size: 0.875rem;
  font-weight: 600;
}

fieldset label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.tag-filter-empty {
  margin: 0;
  color: var(--ap-muted);
  font-size: 0.875rem;
}

footer {
  justify-content: flex-end;
  gap: 0.5rem;
  border-top: 1px solid var(--ap-border);
}

button:focus-visible,
input:focus-visible {
  outline: 2px solid var(--ap-focus);
  outline-offset: 2px;
}
</style>
