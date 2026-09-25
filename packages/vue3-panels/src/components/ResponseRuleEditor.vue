<script setup>
import { defineAsyncComponent, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatResponseBodyDraft, parseResponseBodyDraft } from '../services/v3ResponseDraft.js'
import { validateFunctionResponseDraft } from '../services/v3FunctionResponseDraft.js'

const CodeMirrorJsonEditor = defineAsyncComponent(
  () => import('./editors/CodeMirrorJsonEditor.vue')
)

const props = defineProps({
  open: { type: Boolean, default: false },
  rule: { type: Object, default: null },
  saving: { type: Boolean, default: false },
  issue: { type: String, default: '' },
})

const emit = defineEmits(['close', 'save'])
const { t } = useI18n({ useScope: 'global' })
const DEFAULT_FUNCTION_EXAMPLE = 'return { body: { ok: true } }'
const firstInput = ref(null)
const dialogRoot = ref(null)
const form = ref(createForm())
const localIssue = ref('')
const jsonIssue = ref(false)

function createForm(rule = null) {
  const replace = rule?.response?.replace ?? {}
  return {
    matchUrl: rule?.match?.url ?? '',
    matchType: rule?.match?.type ?? 'normal',
    method: rule?.match?.method ?? 'ANY',
    status: replace.status ?? 200,
    body: JSON.stringify(replace.body ?? {}, null, 2),
    responseMode: typeof replace.code === 'string' ? 'function' : 'json',
    code: replace.code ?? DEFAULT_FUNCTION_EXAMPLE,
    functionEnabled: false,
    enabled: rule?.enabled ?? true,
  }
}

watch(
  () => [props.open, props.rule],
  async ([open, rule]) => {
    if (!open) return
    form.value = createForm(rule)
    localIssue.value = ''
    jsonIssue.value = false
    await nextTick()
    firstInput.value?.focus()
  },
  { immediate: true }
)

watch(
  () => form.value.body,
  (draft) => {
    if (jsonIssue.value && parseResponseBodyDraft(draft).ok) {
      localIssue.value = ''
      jsonIssue.value = false
    }
  }
)

function submit() {
  localIssue.value = ''
  jsonIssue.value = false
  if (!form.value.matchUrl.trim() || form.value.matchUrl !== form.value.matchUrl.trim()) {
    localIssue.value = t('responseEditor.matchUrlRequired')
    return
  }
  if (form.value.responseMode === 'function') {
    const result = validateFunctionResponseDraft(form.value.code)
    if (!result.ok) {
      localIssue.value = t(
        result.error === 'code-too-long'
          ? 'responseEditor.functionCodeTooLong'
          : 'responseEditor.functionCodeRequired'
      )
      return
    }
    if (!window.confirm(t('responseEditor.functionSaveConfirm'))) return
    emit('save', {
      enabled: form.value.enabled,
      match: { url: form.value.matchUrl, type: form.value.matchType, method: form.value.method },
      mode: 'function',
      code: form.value.code,
      responseEnabled: form.value.functionEnabled,
    })
    return
  }
  if (
    !Number.isInteger(Number(form.value.status)) ||
    Number(form.value.status) < 200 ||
    Number(form.value.status) > 599
  ) {
    localIssue.value = t('responseEditor.invalidStatus')
    return
  }
  const parsedBody = parseResponseBodyDraft(form.value.body)
  if (!parsedBody.ok) {
    setJsonError(parsedBody)
    return
  }
  emit('save', {
    enabled: form.value.enabled,
    match: { url: form.value.matchUrl, type: form.value.matchType, method: form.value.method },
    status: Number(form.value.status),
    body: parsedBody.body,
    mode: 'json',
    responseEnabled: true,
  })
}

function setFunctionEnabled(event) {
  if (!event.target.checked) {
    form.value.functionEnabled = false
    return
  }
  form.value.functionEnabled = window.confirm(t('responseEditor.functionEnableConfirm'))
}

function setResponseMode(mode) {
  form.value.responseMode = mode
  localIssue.value = ''
  jsonIssue.value = false
}

function formatJson() {
  const parsedBody = parseResponseBodyDraft(form.value.body)
  if (!parsedBody.ok) {
    setJsonError(parsedBody)
    return
  }
  form.value.body = formatResponseBodyDraft(parsedBody.body)
  localIssue.value = ''
  jsonIssue.value = false
}

function setJsonError(result) {
  jsonIssue.value = true
  localIssue.value = result.location
    ? t('responseEditor.invalidJsonLocation', result.location)
    : t('responseEditor.invalidJson')
}

function useExample(body) {
  form.value.body = JSON.stringify(body, null, 2)
  localIssue.value = ''
  jsonIssue.value = false
}

function trapFocus(event) {
  if (event.key !== 'Tab') return
  const focusable = dialogRoot.value?.querySelectorAll(
    'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [contenteditable="true"]:not([aria-disabled="true"])'
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
      class="rule-editor response-rule-editor"
      role="dialog"
      aria-modal="true"
      aria-labelledby="response-editor-title"
      @keydown.esc.stop.prevent="emit('close')"
      @keydown="trapFocus"
    >
      <header class="editor-heading">
        <h2 id="response-editor-title">
          {{
            form.responseMode === 'function'
              ? rule
                ? t('responseEditor.editFunctionTitle')
                : t('responseEditor.createFunctionTitle')
              : rule
                ? t('responseEditor.editTitle')
                : t('responseEditor.createTitle')
          }}
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
        <fieldset class="response-mode-picker">
          <legend>{{ t('responseEditor.responseType') }}</legend>
          <label>
            <input
              type="radio"
              name="response-mode"
              value="json"
              :checked="form.responseMode === 'json'"
              @change="setResponseMode('json')"
            />
            <span>{{ t('responseEditor.jsonMode') }}</span>
          </label>
          <label>
            <input
              type="radio"
              name="response-mode"
              value="function"
              :checked="form.responseMode === 'function'"
              @change="setResponseMode('function')"
            />
            <span>{{ t('responseEditor.functionMode') }}</span>
          </label>
        </fieldset>

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

        <div v-if="form.responseMode === 'json'" class="editor-field-row">
          <label class="editor-field">
            <span>{{ t('responseEditor.status') }}</span>
            <input v-model="form.status" type="number" min="200" max="599" step="1" required />
          </label>
          <div class="editor-field response-format-action">
            <span>{{ t('responseEditor.body') }}</span>
            <button type="button" class="editor-button editor-button-secondary" @click="formatJson">
              {{ t('responseEditor.format') }}
            </button>
          </div>
        </div>

        <div v-if="form.responseMode === 'json'" class="editor-field">
          <span>{{ t('responseEditor.jsonBody') }}</span>
          <CodeMirrorJsonEditor
            v-model="form.body"
            class="response-json-input"
            :aria-label="t('responseEditor.jsonBody')"
            described-by="response-json-help response-editor-error"
          />
          <small id="response-json-help">{{ t('responseEditor.jsonHelp') }}</small>
        </div>
        <div
          v-if="form.responseMode === 'json'"
          class="response-examples"
          role="group"
          :aria-label="t('responseEditor.examples')"
        >
          <span>{{ t('responseEditor.examples') }}</span>
          <button type="button" @click="useExample({ ok: true, data: { id: 123 } })">
            {{ t('responseEditor.objectExample') }}
          </button>
          <button type="button" @click="useExample([{ id: 1, name: 'Example' }])">
            {{ t('responseEditor.arrayExample') }}
          </button>
          <button type="button" @click="useExample('Example response')">
            {{ t('responseEditor.scalarExample') }}
          </button>
          <button type="button" @click="useExample(null)">
            {{ t('responseEditor.nullExample') }}
          </button>
        </div>

        <div v-else class="editor-field function-response-fields">
          <span>{{ t('responseEditor.functionCode') }}</span>
          <CodeMirrorJsonEditor
            v-model="form.code"
            language="javascript"
            class="response-json-input response-function-input"
            :aria-label="t('responseEditor.functionCode')"
            described-by="response-function-help response-editor-error"
          />
          <small id="response-function-help">{{ t('responseEditor.functionCodeHelp') }}</small>
          <small class="function-safety-warning">{{
            t('responseEditor.functionSafetyWarning')
          }}</small>
          <label class="editor-enabled function-enabled">
            <input :checked="form.functionEnabled" type="checkbox" @change="setFunctionEnabled" />
            <span>{{ t('responseEditor.enableFunction') }}</span>
          </label>
        </div>

        <label class="editor-enabled">
          <input v-model="form.enabled" type="checkbox" />
          <span>{{ t('editor.enableRule') }}</span>
        </label>

        <p v-if="localIssue || issue" id="response-editor-error" class="editor-error" role="alert">
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
