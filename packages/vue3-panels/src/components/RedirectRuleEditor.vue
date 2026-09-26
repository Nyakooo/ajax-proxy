<script setup>
import { defineAsyncComponent, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import RuleTagPicker from './RuleTagPicker.vue'

const CodeMirrorJsonEditor = defineAsyncComponent(
  () => import('./editors/CodeMirrorJsonEditor.vue')
)

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
const MAX_EXCLUSIONS = 100
const MAX_EXCLUSION_LENGTH = 4096
const MAX_FUNCTION_CODE_LENGTH = 65_536
const DEFAULT_FUNCTION_EXAMPLE = 'return request.url'

function createForm(rule = null) {
  const redirect = rule?.request?.redirect ?? {}
  const isFunction = redirect.type === 'function'
  return {
    matchUrl: rule?.match?.url ?? '',
    matchType: rule?.match?.type ?? 'normal',
    method: rule?.match?.method ?? 'ANY',
    redirectMode: isFunction ? 'function' : 'static',
    targetUrl: isFunction ? '' : (redirect.url ?? ''),
    code: isFunction ? (redirect.code ?? '') : DEFAULT_FUNCTION_EXAMPLE,
    redirectEnabled: isFunction ? false : (rule?.request?.enabled ?? true),
    exclusionsText: (redirect.exclusions ?? []).join('\n'),
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
  if (!form.value.matchUrl.trim()) {
    localIssue.value = t('editor.requiredFields')
    return
  }
  if (form.value.matchUrl !== form.value.matchUrl.trim()) {
    localIssue.value = t('editor.noOuterWhitespace')
    return
  }
  if (form.value.redirectMode === 'static') {
    if (!form.value.targetUrl.trim()) {
      localIssue.value = t('editor.requiredFields')
      return
    }
    if (form.value.targetUrl !== form.value.targetUrl.trim()) {
      localIssue.value = t('editor.noOuterWhitespace')
      return
    }
  } else {
    if (!form.value.code.trim()) {
      localIssue.value = t('editor.functionCodeRequired')
      return
    }
    if (form.value.code.length > MAX_FUNCTION_CODE_LENGTH) {
      localIssue.value = t('editor.functionCodeTooLong')
      return
    }
  }
  const exclusionLines = form.value.exclusionsText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (exclusionLines.length > MAX_EXCLUSIONS) {
    localIssue.value = t('editor.exclusionsTooMany')
    return
  }
  if (exclusionLines.some((line) => line.length > MAX_EXCLUSION_LENGTH)) {
    localIssue.value = t('editor.exclusionTooLong')
    return
  }
  const exclusions = [...new Set(exclusionLines)]
  if (form.value.redirectMode === 'function' && !window.confirm(t('editor.functionSaveConfirm'))) {
    return
  }
  emit('save', {
    enabled: form.value.enabled,
    match: {
      url: form.value.matchUrl,
      type: form.value.matchType,
      method: form.value.method,
    },
    ...(form.value.redirectMode === 'function'
      ? {
          redirectMode: 'function',
          code: form.value.code,
          redirectEnabled: form.value.redirectEnabled,
        }
      : {
          redirectMode: 'static',
          redirectUrl: form.value.targetUrl,
          redirectEnabled: form.value.redirectEnabled,
        }),
    exclusions,
    tagIds: [...form.value.tagIds],
  })
}

function setRedirectMode(mode) {
  form.value.redirectMode = mode
  if (mode === 'function') form.value.redirectEnabled = false
  else form.value.redirectEnabled = true
  localIssue.value = ''
}

function setRedirectEnabled(event) {
  if (!event.target.checked) {
    form.value.redirectEnabled = false
    return
  }
  const confirmed = window.confirm(t('editor.functionEnableConfirm'))
  form.value.redirectEnabled = confirmed
  event.target.checked = confirmed
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
      class="rule-editor redirect-rule-editor"
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
        <fieldset class="response-mode-picker">
          <legend>{{ t('editor.redirectType') }}</legend>
          <label>
            <input
              type="radio"
              name="redirect-mode"
              value="static"
              :checked="form.redirectMode === 'static'"
              @change="setRedirectMode('static')"
            />
            <span>{{ t('editor.staticRedirect') }}</span>
          </label>
          <label>
            <input
              type="radio"
              name="redirect-mode"
              value="function"
              :checked="form.redirectMode === 'function'"
              @change="setRedirectMode('function')"
            />
            <span>{{ t('editor.functionRedirect') }}</span>
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
              <option value="exact">{{ t('editor.exactMatch') }}</option>
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

        <label v-if="form.redirectMode === 'static'" class="editor-field">
          <span>{{ t('editor.targetUrl') }}</span>
          <input v-model="form.targetUrl" required autocomplete="off" />
          <small>{{ t('editor.targetUrlHelp') }}</small>
        </label>

        <div v-else class="editor-field function-response-fields">
          <span>{{ t('editor.functionCode') }}</span>
          <CodeMirrorJsonEditor
            v-model="form.code"
            language="javascript"
            class="response-json-input response-function-input"
            :aria-label="t('editor.functionCode')"
            described-by="redirect-function-help redirect-editor-error"
          />
          <small id="redirect-function-help">{{ t('editor.functionCodeHelp') }}</small>
          <small class="function-safety-warning">{{ t('editor.functionSafetyWarning') }}</small>
          <label class="editor-enabled function-enabled">
            <input :checked="form.redirectEnabled" type="checkbox" @change="setRedirectEnabled" />
            <span>{{ t('editor.enableFunctionRedirect') }}</span>
          </label>
        </div>

        <label class="editor-field">
          <span>{{ t('editor.exclusions') }}</span>
          <textarea
            v-model="form.exclusionsText"
            data-testid="redirect-exclusions"
            rows="3"
            autocomplete="off"
          />
          <small>{{ t('editor.exclusionsHelp') }}</small>
        </label>

        <label class="editor-enabled">
          <input v-model="form.enabled" type="checkbox" />
          <span>{{ t('editor.enableRule') }}</span>
        </label>

        <RuleTagPicker v-model="form.tagIds" :tags="tags" />

        <p v-if="localIssue || issue" id="redirect-editor-error" class="editor-error" role="alert">
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
