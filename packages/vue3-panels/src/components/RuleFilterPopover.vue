<script setup>
import { useI18n } from 'vue-i18n'

defineProps({
  open: { type: Boolean, default: false },
  status: { type: String, default: 'all' },
  matchType: { type: String, default: 'all' },
})

const emit = defineEmits(['close', 'update:status', 'update:matchType', 'clear'])
const { t } = useI18n({ useScope: 'global' })
</script>

<template>
  <!-- eslint-disable vue/max-attributes-per-line, vue/singleline-html-element-content-newline, vue/html-self-closing -->
  <section
    v-if="open"
    class="rule-filter-popover"
    role="dialog"
    aria-modal="false"
    aria-labelledby="rule-filter-title"
    @keydown.esc.stop.prevent="emit('close')"
  >
    <header class="filter-heading">
      <h2 id="rule-filter-title">{{ t('ruleFilters.title') }}</h2>
      <button
        type="button"
        class="filter-close"
        :aria-label="t('ruleFilters.close')"
        @click="emit('close')"
      >
        ×
      </button>
    </header>

    <div class="filter-options">
      <fieldset>
        <legend>{{ t('ruleFilters.statusLegend') }}</legend>
        <label>
          <input
            type="radio"
            name="rule-status-filter"
            value="all"
            :checked="status === 'all'"
            @change="emit('update:status', 'all')"
          />
          <span>{{ t('ruleFilters.statusAll') }}</span>
        </label>
        <label>
          <input
            type="radio"
            name="rule-status-filter"
            value="enabled"
            :checked="status === 'enabled'"
            @change="emit('update:status', 'enabled')"
          />
          <span>{{ t('ruleFilters.enabled') }}</span>
        </label>
        <label>
          <input
            type="radio"
            name="rule-status-filter"
            value="disabled"
            :checked="status === 'disabled'"
            @change="emit('update:status', 'disabled')"
          />
          <span>{{ t('ruleFilters.disabled') }}</span>
        </label>
      </fieldset>

      <fieldset>
        <legend>{{ t('ruleFilters.matchTypeLegend') }}</legend>
        <label>
          <input
            type="radio"
            name="rule-match-type-filter"
            value="all"
            :checked="matchType === 'all'"
            @change="emit('update:matchType', 'all')"
          />
          <span>{{ t('ruleFilters.matchAll') }}</span>
        </label>
        <label>
          <input
            type="radio"
            name="rule-match-type-filter"
            value="normal"
            :checked="matchType === 'normal'"
            @change="emit('update:matchType', 'normal')"
          />
          <span>{{ t('ruleFilters.normal') }}</span>
        </label>
        <label>
          <input
            type="radio"
            name="rule-match-type-filter"
            value="regex"
            :checked="matchType === 'regex'"
            @change="emit('update:matchType', 'regex')"
          />
          <span>{{ t('ruleFilters.regex') }}</span>
        </label>
      </fieldset>
    </div>

    <footer class="filter-actions">
      <button type="button" @click="emit('clear')">{{ t('ruleFilters.clear') }}</button>
    </footer>
  </section>
</template>

<style scoped>
.rule-filter-popover {
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
  color: var(--ap-text, #1f2937);
  background: var(--ap-surface, #fff);
  border: 1px solid var(--ap-border, #d1d5db);
  border-radius: 0.75rem;
  box-shadow: 0 0.75rem 2rem rgb(15 23 42 / 16%);
}

.filter-heading,
.filter-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
}

.filter-heading {
  border-bottom: 1px solid var(--ap-border, #d1d5db);
}

.filter-heading h2 {
  margin: 0;
  font-size: 1rem;
}

.filter-close {
  padding: 0 0.25rem;
  color: inherit;
  font-size: 1.25rem;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.filter-options {
  overflow-y: auto;
  padding: 0.25rem 1rem;
}

fieldset {
  display: grid;
  gap: 0.5rem;
  min-width: 0;
  margin: 0;
  padding: 0.75rem 0;
  border: 0;
}

fieldset + fieldset {
  border-top: 1px solid var(--ap-border, #d1d5db);
}

legend {
  padding: 0;
  font-size: 0.875rem;
  font-weight: 600;
}

label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

input {
  accent-color: var(--ap-accent, #2563eb);
}

.filter-actions {
  justify-content: flex-end;
  border-top: 1px solid var(--ap-border, #d1d5db);
}

.filter-actions button {
  padding: 0.4rem 0.65rem;
  color: var(--ap-accent, #2563eb);
  background: transparent;
  border: 0;
  border-radius: 0.375rem;
  font: inherit;
  cursor: pointer;
}

button:focus-visible,
input:focus-visible {
  outline: 2px solid var(--ap-accent, #2563eb);
  outline-offset: 2px;
}
</style>
