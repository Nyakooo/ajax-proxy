<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatV3ValidationIssues, parseV3BackupJson } from '@proxy/v3-domain'

const props = defineProps({
  open: { type: Boolean, default: false },
  backup: { type: Object, required: true },
  saving: { type: Boolean, default: false },
  issue: { type: String, default: '' },
})
const emit = defineEmits(['close', 'restore', 'import-rules'])
const { t } = useI18n({ useScope: 'global' })
const source = ref('')
const candidate = ref(null)
const parseIssue = ref('')
const fileIssue = ref('')
const functionRuleCount = computed(() => candidate.value?.warnings.length ?? 0)
const existingRuleIds = computed(() => new Set(props.backup.rules.map((rule) => rule.id)))
const rulesToAdd = computed(
  () => candidate.value?.data.rules.filter((rule) => !existingRuleIds.value.has(rule.id)) ?? []
)
const skippedRuleCount = computed(
  () => (candidate.value?.data.rules.length ?? 0) - rulesToAdd.value.length
)
const referencedTagIds = computed(
  () => new Set(rulesToAdd.value.flatMap((rule) => rule.tagIds ?? []))
)
const tagIdConflicts = computed(() =>
  (candidate.value?.data.tags ?? []).filter(
    (tag) =>
      referencedTagIds.value.has(tag.id) &&
      props.backup.tags.some((current) => current.id === tag.id && current.name !== tag.name)
  )
)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    source.value = ''
    candidate.value = null
    parseIssue.value = ''
    fileIssue.value = ''
  }
)

function clearCandidate() {
  candidate.value = null
  parseIssue.value = ''
  fileIssue.value = ''
}

function previewImport() {
  candidate.value = null
  const parsed = parseV3BackupJson(source.value)
  if (!parsed.ok) {
    parseIssue.value = formatV3ValidationIssues(parsed.issues).join('\n')
    return
  }
  candidate.value = parsed
  parseIssue.value = ''
}

async function loadFile(event) {
  const [file] = event.target.files ?? []
  event.target.value = ''
  if (!file) return
  clearCandidate()
  source.value = ''
  try {
    source.value = await file.text()
  } catch {
    fileIssue.value = t('backup.fileReadError')
  }
}

function exportBackup() {
  const data = JSON.stringify(props.backup, null, 2)
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `ajax-proxy-v3-backup-${new Date().toISOString().slice(0, 10)}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

function restore() {
  if (!candidate.value || props.saving) return
  if (
    functionRuleCount.value > 0 &&
    !window.confirm(t('backup.confirmFunctions', { count: functionRuleCount.value }))
  ) {
    return
  }
  emit('restore', candidate.value.data)
}

function importRules() {
  if (!candidate.value || !rulesToAdd.value.length || tagIdConflicts.value.length || props.saving)
    return
  if (
    functionRuleCount.value > 0 &&
    !window.confirm(t('backup.confirmImportFunctions', { count: functionRuleCount.value }))
  ) {
    return
  }
  emit('import-rules', candidate.value.data)
}

function trapFocus(event) {
  if (event.key !== 'Tab') return
  const focusable = event.currentTarget.querySelectorAll(
    'button:not(:disabled), input:not(:disabled), textarea:not(:disabled)'
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
  <!-- eslint-disable vue/max-attributes-per-line, vue/singleline-html-element-content-newline, vue/html-self-closing -->
  <div v-if="open" class="editor-backdrop backup-backdrop" @click.self="emit('close')">
    <section
      class="rule-editor backup-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="backup-dialog-title"
      @keydown.esc.stop.prevent="emit('close')"
      @keydown="trapFocus"
    >
      <header class="editor-heading">
        <h2 id="backup-dialog-title">{{ t('backup.title') }}</h2>
        <button
          type="button"
          class="editor-close"
          :aria-label="t('editor.close')"
          @click="emit('close')"
        >
          ×
        </button>
      </header>

      <div class="backup-content">
        <p>{{ t('backup.description') }}</p>
        <button type="button" class="backup-secondary" @click="exportBackup">
          {{ t('backup.export') }}
        </button>

        <label class="editor-field backup-file">
          <span>{{ t('backup.chooseFile') }}</span>
          <input
            data-testid="backup-file-input"
            type="file"
            accept=".json,application/json"
            @change="loadFile"
          />
        </label>
        <label class="editor-field">
          <span>{{ t('backup.jsonLabel') }}</span>
          <textarea
            v-model="source"
            data-testid="backup-json-input"
            rows="10"
            spellcheck="false"
            :placeholder="t('backup.jsonPlaceholder')"
            @input="clearCandidate"
          />
        </label>

        <p v-if="parseIssue" class="editor-error backup-message" role="alert">
          {{ parseIssue }}
        </p>
        <p v-if="fileIssue" class="editor-error backup-message" role="alert">
          {{ fileIssue }}
        </p>
        <p v-if="issue" class="editor-error backup-message" role="alert">{{ issue }}</p>
        <p v-if="candidate" class="backup-valid" role="status">
          {{ t('backup.valid', { count: candidate.data.rules.length }) }}
        </p>
        <template v-if="candidate">
          <p class="backup-safe" role="status">
            {{
              t('backup.ruleImportSummary', {
                add: rulesToAdd.length,
                skip: skippedRuleCount,
              })
            }}
          </p>
          <p v-if="tagIdConflicts.length" class="editor-error backup-message" role="alert">
            {{
              t('backup.tagIdConflict', {
                name: tagIdConflicts[0].name,
                id: tagIdConflicts[0].id,
              })
            }}
          </p>
        </template>
        <div v-if="candidate && functionRuleCount" class="backup-warning" role="alert">
          <strong>{{ t('backup.functionWarningTitle', { count: functionRuleCount }) }}</strong>
          <p>{{ t('backup.functionWarning') }}</p>
        </div>
        <p v-else-if="candidate" class="backup-safe" role="status">
          {{ t('backup.noFunctions') }}
        </p>

        <footer class="backup-actions">
          <button type="button" class="backup-secondary" @click="emit('close')">
            {{ t('editor.cancel') }}
          </button>
          <button
            type="button"
            class="backup-secondary"
            :disabled="!source.trim() || saving"
            @click="previewImport"
          >
            {{ t('backup.preview') }}
          </button>
          <button
            type="button"
            class="backup-primary"
            data-testid="backup-restore-button"
            :disabled="!candidate || saving"
            @click="restore"
          >
            {{ saving ? t('editor.saving') : t('backup.restore') }}
          </button>
          <button
            type="button"
            class="backup-primary"
            data-testid="backup-import-rules-button"
            :disabled="!candidate || !rulesToAdd.length || tagIdConflicts.length > 0 || saving"
            @click="importRules"
          >
            {{ t('backup.importRules', { count: rulesToAdd.length }) }}
          </button>
        </footer>
      </div>
    </section>
  </div>
</template>

<style scoped>
.backup-backdrop {
  overflow-y: auto;
  padding: 24px;
}

.backup-dialog {
  width: min(680px, 100%);
  max-height: calc(100vh - 48px);
  overflow-y: auto;
}

.backup-content {
  display: grid;
  gap: 16px;
  padding: 20px 24px 24px;
}

.backup-content > p {
  margin: 0;
}

.backup-file input,
.backup-content textarea {
  width: 100%;
}

.backup-content textarea {
  min-height: 180px;
  resize: vertical;
  font-family: var(--font-mono, monospace);
}

.backup-message,
.backup-warning,
.backup-valid,
.backup-safe {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.backup-warning {
  border: 1px solid var(--ap-color-warning, #db9d37);
  border-radius: 10px;
  padding: 14px;
  background: color-mix(in srgb, var(--ap-color-warning, #db9d37) 10%, transparent);
}

.backup-warning p {
  margin: 8px 0 0;
}

.backup-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
  padding-top: 8px;
}

.backup-secondary,
.backup-primary {
  min-height: 38px;
  border: 1px solid var(--ap-border, #d7dce2);
  border-radius: 8px;
  padding: 8px 14px;
  color: inherit;
  background: transparent;
  cursor: pointer;
}

.backup-primary {
  border-color: var(--ap-accent, #4169e1);
  color: white;
  background: var(--ap-accent, #4169e1);
}

.backup-secondary:disabled,
.backup-primary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
