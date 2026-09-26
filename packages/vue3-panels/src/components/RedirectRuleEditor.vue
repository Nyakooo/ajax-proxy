<script setup>
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import RuleTagPicker from './RuleTagPicker.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  rule: { type: Object, default: null },
  saving: { type: Boolean, default: false },
  issue: { type: String, default: '' },
  tags: { type: Array, default: () => [] },
})

const emit = defineEmits(['close', 'save'])
const { t } = useI18n({ useScope: 'global' })
const firstInput = ref(null)
const dialogRoot = ref(null)
const form = ref(createForm())
const localIssue = ref('')

function createForm(rule = null) {
  return {
    matchUrl: rule?.match?.url ?? '',
    matchType: rule?.match?.type ?? 'normal',
    method: rule?.match?.method ?? 'ANY',
    targetUrl: rule?.request?.redirect?.url ?? '',
    enabled: rule?.enabled ?? true,
    tagIds: [...(rule?.tagIds ?? [])],
  }
}

watch(
  () => [props.open, props.rule],
  async ([open, rule]) => {
    if (!open) return
    form.value = createForm(rule)
    localIssue.value = ''
    await nextTick()
    firstInput.value?.focus()
  },
  { immediate: true }
)

function submit() {
  localIssue.value = ''
  if (!form.value.matchUrl.trim() || !form.value.targetUrl.trim()) {
    localIssue.value = t('editor.requiredFields')
    return
  }
  if (
    form.value.matchUrl !== form.value.matchUrl.trim() ||
    form.value.targetUrl !== form.value.targetUrl.trim()
  ) {
    localIssue.value = t('editor.noOuterWhitespace')
    return
  }
  emit('save', {
    enabled: form.value.enabled,
    match: {
      url: form.value.matchUrl,
      type: form.value.matchType,
      method: form.value.method,
    },
    redirectUrl: form.value.targetUrl,
    tagIds: [...form.value.tagIds],
  })
}

function trapFocus(event) {
  if (event.key !== 'Tab') return
  const focusable = dialogRoot.value?.querySelectorAll(
    'button:not(:disabled), input:not(:disabled), select:not(:disabled)'
  )
  if (!focusable?.length) return
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
  <!-- eslint-disable vue/max-attributes-per-line, vue/html-self-closing -->
  <div v-if="open" class="editor-backdrop" @click.self="emit('close')">
    <section
      ref="dialogRoot"
      class="rule-editor"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="'redirect-editor-title'"
      @keydown.esc.stop.prevent="emit('close')"
      @keydown="trapFocus"
    >
      <header class="editor-heading">
        <h2 id="redirect-editor-title">
          {{ rule ? t('editor.editRedirect') : t('editor.createRedirect') }}
        </h2>
        <button
          type="button"
          class="editor-close"
          :aria-label="t('editor.close')"
          @click="emit('close')"
        >
          ×
        </button>
      </header>

      <form class="editor-form" @submit.prevent="submit">
        <label class="editor-field">
          <span>{{ t('editor.matchUrl') }}</span>
          <input ref="firstInput" v-model="form.matchUrl" required autocomplete="off" />
          <small>{{ t('editor.matchUrlHelp') }}</small>
        </label>

        <div class="editor-field-row">
          <label class="editor-field">
            <span>{{ t('editor.matchType') }}</span>
            <select v-model="form.matchType">
              <option value="normal">{{ t('editor.contains') }}</option>
              <option value="regex">{{ t('editor.regularExpression') }}</option>
            </select>
          </label>
          <label class="editor-field">
            <span>{{ t('editor.method') }}</span>
            <select v-model="form.method">
              <option value="ANY">ANY</option>
              <option>GET</option>
              <option>POST</option>
              <option>PUT</option>
              <option>DELETE</option>
              <option>PATCH</option>
              <option>HEAD</option>
              <option>OPTIONS</option>
            </select>
          </label>
        </div>

        <label class="editor-field">
          <span>{{ t('editor.targetUrl') }}</span>
          <input v-model="form.targetUrl" required autocomplete="off" />
          <small>{{ t('editor.targetUrlHelp') }}</small>
        </label>

        <label class="editor-enabled">
          <input v-model="form.enabled" type="checkbox" />
          <span>{{ t('editor.enableRule') }}</span>
        </label>

        <RuleTagPicker v-model="form.tagIds" :tags="tags" />

        <p v-if="localIssue || issue" class="editor-error" role="alert">
          {{ localIssue || issue }}
        </p>

        <footer class="editor-actions">
          <button
            type="button"
            class="editor-button editor-button-secondary"
            @click="emit('close')"
          >
            {{ t('editor.cancel') }}
          </button>
          <button type="submit" class="editor-button editor-button-primary" :disabled="saving">
            {{ saving ? t('editor.saving') : t('editor.save') }}
          </button>
        </footer>
      </form>
    </section>
  </div>
</template>
