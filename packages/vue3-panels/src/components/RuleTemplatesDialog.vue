<script setup>
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { V3_RULE_TEMPLATE_CATALOG } from '../services/v3RuleTemplateCatalog.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  issue: { type: String, default: '' },
})

const emit = defineEmits(['close', 'apply'])
const { t } = useI18n({ useScope: 'global' })
const firstAction = ref(null)

function captureFirstAction(element) {
  if (element) firstAction.value = element
}

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    await nextTick()
    firstAction.value?.focus()
  }
)

function trapFocus(event) {
  if (event.key !== 'Tab') return
  const focusable = event.currentTarget.querySelectorAll('button:not(:disabled)')
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
</script>

<template>
  <!-- prettier-ignore -->
  <div
    v-if="open"
    class="editor-backdrop"
    @click.self="emit('close')"
  >
    <section
      class="rule-editor rule-templates-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rule-templates-title"
      @keydown.esc.stop.prevent="emit('close')"
      @keydown="trapFocus"
    >
      <header class="editor-heading">
        <h2 id="rule-templates-title">
          {{ t('ruleTemplates.title') }}
        </h2>
        <button
          type="button"
          class="editor-close"
          :aria-label="t('ruleTemplates.close')"
          @click="emit('close')"
        >
          ×
        </button>
      </header>
      <p class="rule-templates-intro">
        {{ t('ruleTemplates.intro') }}
      </p>
      <!-- prettier-ignore -->
      <div
        v-if="issue"
        class="operation-alert"
        role="alert"
      >
        {{ issue }}
      </div>
      <ul class="rule-templates-list">
        <li
          v-for="template in V3_RULE_TEMPLATE_CATALOG"
          :key="template.templateId"
          class="rule-template-card"
          :data-testid="`rule-template-${template.templateId}`"
        >
          <div class="rule-template-copy">
            <h3>{{ t(template.titleKey) }}</h3>
            <p>{{ t(template.descriptionKey) }}</p>
            <code>{{ template.rule.match.method ?? 'ANY' }} · {{ template.rule.match.url }}</code>
            <small v-if="template.rule.request?.enabled">
              {{ t('ruleTemplates.redirectPreview', { url: template.rule.request.redirect.url }) }}
            </small>
            <small v-if="template.rule.response?.enabled">
              {{ t('ruleTemplates.responsePreview') }}
            </small>
            <pre v-if="template.rule.response?.enabled">{{
              JSON.stringify(template.rule.response.replace.body, null, 2)
            }}</pre>
            <small class="rule-template-disabled">{{ t('ruleTemplates.disabledNotice') }}</small>
          </div>
          <button
            :ref="
              template.templateId === V3_RULE_TEMPLATE_CATALOG[0]?.templateId
                ? captureFirstAction
                : undefined
            "
            class="editor-button editor-button-primary"
            type="button"
            :disabled="saving"
            :data-testid="`rule-template-apply-${template.templateId}`"
            @click="emit('apply', template.templateId)"
          >
            {{ t('ruleTemplates.add') }}
          </button>
        </li>
      </ul>
      <footer class="editor-actions">
        <!-- prettier-ignore -->
        <button
          class="editor-button editor-button-secondary"
          type="button"
          @click="emit('close')"
        >
          {{ t('ruleTemplates.cancel') }}
        </button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.rule-templates-dialog {
  width: min(760px, 100%);
  max-height: calc(100vh - 40px);
  overflow-y: auto;
}

.rule-templates-intro {
  margin: 0 0 16px;
  color: var(--ap-muted);
  line-height: 1.6;
}

.rule-templates-list {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.rule-template-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 16px;
  border: 1px solid var(--ap-border);
  border-radius: var(--ap-radius-card);
  background: var(--ap-card);
}

.rule-template-copy {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.rule-template-copy h3,
.rule-template-copy p {
  margin: 0;
}

.rule-template-copy p,
.rule-template-copy small {
  color: var(--ap-muted);
  line-height: 1.5;
}

.rule-template-copy code {
  overflow-wrap: anywhere;
  color: var(--ap-ink);
}

.rule-template-copy pre {
  max-height: 120px;
  overflow: auto;
  margin: 0;
  padding: 9px;
  border-radius: 8px;
  background: var(--ap-subtle, rgb(127 127 127 / 8%));
  color: var(--ap-ink);
  font-size: 12px;
}

.rule-template-disabled {
  color: var(--ap-warning, #a26100) !important;
}

@media (max-width: 560px) {
  .rule-template-card {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
