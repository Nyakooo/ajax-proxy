<script setup>
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  open: { type: Boolean, default: false },
  tags: { type: Array, default: () => [] },
  saving: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'create', 'rename', 'remove'])
const { t } = useI18n({ useScope: 'global' })
const dialogRoot = ref(null)
const firstInput = ref(null)
const newName = ref('')
const renamedNames = ref({})
const savedNames = ref({})

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    renamedNames.value = Object.fromEntries(props.tags.map((tag) => [tag.id, tag.name]))
    savedNames.value = Object.fromEntries(props.tags.map((tag) => [tag.id, tag.name]))
    await nextTick()
    firstInput.value?.focus()
  },
  { immediate: true }
)

watch(
  () => props.tags,
  (tags) => {
    if (!props.open) return
    const nextDrafts = { ...renamedNames.value }
    const nextSaved = {}
    for (const tag of tags) {
      const previous = savedNames.value[tag.id]
      if (previous === undefined || nextDrafts[tag.id] === previous) nextDrafts[tag.id] = tag.name
      nextSaved[tag.id] = tag.name
    }
    renamedNames.value = nextDrafts
    savedNames.value = nextSaved
  }
)

function createTag() {
  emit('create', newName.value)
  newName.value = ''
}

function renameTag(tag) {
  emit('rename', tag.id, renamedNames.value[tag.id])
}

function trapFocus(event) {
  if (event.key !== 'Tab') return
  const focusable = dialogRoot.value?.querySelectorAll(
    'button:not(:disabled), input:not(:disabled)'
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
  <!-- eslint-disable vue/max-attributes-per-line, vue/html-self-closing, vue/singleline-html-element-content-newline -->
  <div v-if="open" class="editor-backdrop" @click.self="emit('close')">
    <section
      ref="dialogRoot"
      class="rule-tags-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rule-tags-dialog-title"
      @keydown.esc.stop.prevent="emit('close')"
      @keydown="trapFocus"
    >
      <header class="editor-heading">
        <h2 id="rule-tags-dialog-title">{{ t('ruleTags.manageTitle') }}</h2>
        <button
          type="button"
          class="editor-close"
          :aria-label="t('ruleTags.close')"
          @click="emit('close')"
        >
          ×
        </button>
      </header>

      <form class="tag-create-form" @submit.prevent="createTag">
        <label class="editor-field">
          <span>{{ t('ruleTags.newName') }}</span>
          <input
            ref="firstInput"
            v-model="newName"
            maxlength="512"
            autocomplete="off"
            required
            :placeholder="t('ruleTags.namePlaceholder')"
          />
        </label>
        <button class="editor-button editor-button-primary" type="submit" :disabled="saving">
          {{ t('ruleTags.add') }}
        </button>
      </form>

      <p v-if="!tags.length" class="rule-tags-empty">{{ t('ruleTags.emptyManage') }}</p>
      <ul v-else class="rule-tags-list">
        <li v-for="tag in tags" :key="tag.id">
          <label class="editor-field">
            <span class="sr-only">{{ t('ruleTags.renameLabel', { name: tag.name }) }}</span>
            <input v-model="renamedNames[tag.id]" maxlength="512" autocomplete="off" required />
          </label>
          <button
            class="editor-button editor-button-secondary"
            type="button"
            :disabled="saving || !renamedNames[tag.id]?.trim() || renamedNames[tag.id] === tag.name"
            @click="renameTag(tag)"
          >
            {{ t('ruleTags.rename') }}
          </button>
          <button
            class="editor-button editor-button-secondary"
            type="button"
            :disabled="saving"
            @click="emit('remove', tag)"
          >
            {{ t('ruleTags.remove') }}
          </button>
        </li>
      </ul>

      <footer class="editor-actions">
        <button class="editor-button editor-button-secondary" type="button" @click="emit('close')">
          {{ t('ruleTags.done') }}
        </button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.rule-tags-dialog {
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  width: min(560px, 100%);
  padding: 22px;
  border: 1px solid var(--ap-border);
  border-radius: var(--ap-radius-panel);
  background: var(--ap-card);
  box-shadow: 0 22px 70px rgb(0 0 0 / 24%);
  color: var(--ap-ink);
}

.tag-create-form {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 16px 0;
  border-bottom: 1px solid var(--ap-border);
}

.tag-create-form .editor-field {
  flex: 1;
}

.rule-tags-list {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 16px 0;
  list-style: none;
}

.rule-tags-list li {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rule-tags-list .editor-field {
  flex: 1;
}

.rule-tags-empty {
  margin: 16px 0;
  color: var(--ap-muted);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 540px) {
  .tag-create-form,
  .rule-tags-list li {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
