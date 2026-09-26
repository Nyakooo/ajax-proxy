<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  open: { type: Boolean, default: false },
  disabledOrigins: { type: Array, default: () => [] },
  currentOrigin: { type: String, default: '' },
  saving: { type: Boolean, default: false },
  issue: { type: String, default: '' },
})

const emit = defineEmits(['close', 'disable', 'enable'])
const { t } = useI18n({ useScope: 'global' })
const originInput = ref('')
const inputIssue = ref('')
const originInputElement = ref(null)

const cleanInput = computed(() => originInput.value.trim())
const inputOrigin = computed(() => {
  if (!cleanInput.value) return ''
  try {
    const url = new URL(cleanInput.value)
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username !== '' ||
      url.password !== ''
    ) {
      return ''
    }
    return url.origin
  } catch {
    return ''
  }
})
const canDisableOrigin = computed(
  () => inputOrigin.value !== '' && !props.disabledOrigins.includes(inputOrigin.value)
)

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    originInput.value = props.currentOrigin
    inputIssue.value = ''
    await nextTick()
    originInputElement.value?.focus()
  }
)

function submitOrigin() {
  if (!inputOrigin.value) {
    inputIssue.value = t('site.originError')
    return
  }
  if (!canDisableOrigin.value) {
    inputIssue.value = t('site.alreadyDisabled')
    return
  }
  inputIssue.value = ''
  emit('disable', inputOrigin.value)
}

function trapFocus(event) {
  if (event.key !== 'Tab') return
  const focusable = event.currentTarget.querySelectorAll(
    'input:not(:disabled), button:not(:disabled)'
  )
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
  <!-- Prettier formats the Vue template markup in this component. -->
  <!-- eslint-disable vue/max-attributes-per-line, vue/html-indent, vue/html-self-closing, vue/singleline-html-element-content-newline -->
  <div v-if="open" class="editor-backdrop" @click.self="emit('close')">
    <section
      class="rule-editor site-switches-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="site-switches-title"
      @keydown.esc.stop.prevent="emit('close')"
      @keydown="trapFocus"
    >
      <header class="editor-heading">
        <h2 id="site-switches-title">{{ t('site.dialogTitle') }}</h2>
        <button
          type="button"
          class="editor-close"
          :aria-label="t('site.close')"
          @click="emit('close')"
        >
          ×
        </button>
      </header>
      <p class="site-switches-description">{{ t('site.scope') }}</p>
      <form class="site-switch-form" @submit.prevent="submitOrigin">
        <label for="site-switch-origin">{{ t('site.originLabel') }}</label>
        <input
          id="site-switch-origin"
          ref="originInputElement"
          v-model="originInput"
          type="url"
          inputmode="url"
          autocomplete="url"
          :placeholder="t('site.originPlaceholder')"
          :disabled="saving"
          @input="inputIssue = ''"
        />
        <small v-if="inputIssue" class="site-switch-error" role="alert">{{ inputIssue }}</small>
        <small v-else-if="inputOrigin" class="site-switch-preview">
          {{ t('site.originPreview', { origin: inputOrigin }) }}
        </small>
        <button class="editor-button editor-button-primary" type="submit" :disabled="saving">
          {{ t('site.disableOrigin') }}
        </button>
      </form>
      <div v-if="issue" class="operation-alert" role="alert">{{ issue }}</div>
      <section class="disabled-origin-section" aria-labelledby="disabled-origin-title">
        <h3 id="disabled-origin-title">{{ t('site.disabledOrigins') }}</h3>
        <p v-if="disabledOrigins.length === 0" class="site-switches-empty">
          {{ t('site.noneDisabled') }}
        </p>
        <ul v-else class="disabled-origin-list">
          <li v-for="origin in disabledOrigins" :key="origin">
            <code>{{ origin }}</code>
            <button
              class="editor-button editor-button-secondary"
              type="button"
              :disabled="saving"
              :aria-label="t('site.enableOriginLabel', { origin })"
              @click="emit('enable', origin)"
            >
              {{ t('site.enableOrigin') }}
            </button>
          </li>
        </ul>
      </section>
      <footer class="editor-actions">
        <button class="editor-button editor-button-secondary" type="button" @click="emit('close')">
          {{ t('site.close') }}
        </button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.site-switches-dialog {
  width: min(680px, 100%);
  max-height: calc(100vh - 40px);
  overflow-y: auto;
}

.site-switches-description,
.site-switches-empty {
  margin: 0 0 16px;
  color: var(--ap-muted);
  line-height: 1.6;
}

.site-switch-form {
  display: grid;
  gap: 9px;
  margin-bottom: 20px;
}

.site-switch-form label,
.disabled-origin-section h3 {
  color: var(--ap-ink);
  font-size: 13px;
  font-weight: 650;
}

.site-switch-form input {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--ap-border);
  border-radius: 9px;
  background: var(--ap-card);
  color: var(--ap-ink);
  font: inherit;
}

.site-switch-preview,
.site-switch-error {
  color: var(--ap-muted);
  line-height: 1.5;
}

.site-switch-error {
  color: var(--ap-danger, #b42318);
}

.site-switch-form .editor-button {
  justify-self: start;
}

.disabled-origin-section h3 {
  margin: 0 0 9px;
}

.disabled-origin-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.disabled-origin-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 12px;
  border: 1px solid var(--ap-border);
  border-radius: 9px;
  background: var(--ap-card);
}

.disabled-origin-list code {
  overflow-wrap: anywhere;
  color: var(--ap-ink);
}

@media (max-width: 560px) {
  .disabled-origin-list li {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
