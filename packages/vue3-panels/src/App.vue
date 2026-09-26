<script setup>
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  toRaw,
  watch,
} from 'vue'
import { useI18n } from 'vue-i18n'
import { isV3FunctionError, isV3HitNotice, NoticeFrom, NoticeKey, NoticeTo } from '@proxy/protocol'
import RedirectRuleEditor from './components/RedirectRuleEditor.vue'
import ResponseRuleEditor from './components/ResponseRuleEditor.vue'
import RuleFilterPopover from './components/RuleFilterPopover.vue'
import RuleTagFilterPopover from './components/RuleTagFilterPopover.vue'
import RuleTagsDialog from './components/RuleTagsDialog.vue'
import { buildV3ResponseRule } from './services/v3ResponseDraft.js'
import { validateFunctionResponseDraft } from './services/v3FunctionResponseDraft.js'
import lightMark from '../../shell-chrome/icons/128.png'
import darkMark from '../../../docs/brand/ajax-proxy-mark-dark.png'

const BackupRestoreDialog = defineAsyncComponent(
  () => import('./components/BackupRestoreDialog.vue')
)

const darkMode = ref(false)
const section = ref('intercept')
const search = ref('')
const { locale, t } = useI18n({ useScope: 'global' })
const extensionRuntime = globalThis.chrome?.runtime
let configService
let ruleOperations
const memoryOnly = ref(!extensionRuntime?.sendMessage)
const loading = ref(true)
const configReady = ref(false)
const saving = ref(false)
const operationError = ref('')
const editorOpen = ref(false)
const editingRule = ref(null)
const editorIssue = ref('')
const responseEditorOpen = ref(false)
const editingResponseRule = ref(null)
const responseEditorIssue = ref('')
const backupDialogOpen = ref(false)
const ruleFiltersOpen = ref(false)
const ruleTagFilterOpen = ref(false)
const ruleTagsDialogOpen = ref(false)
const ruleStatusFilter = ref('all')
const ruleMatchTypeFilter = ref('all')
const selectedTagId = ref('')
const selectedRuleIds = ref([])
const config = ref(createEmptyConfig())
const hitCounters = ref({})
const recentMatch = ref(null)
const recentFunctionErrors = ref([])
const languages = [
  { code: 'zh-CN', label: '简体中文', shortLabel: '中' },
  { code: 'en', label: 'English', shortLabel: 'EN' },
]
const unstyledMode = import.meta.env.VITE_UI_UNSTYLED === 'true'
const comparePassThrough =
  new URLSearchParams(window.location.search).get('pt') === '1' || unstyledMode
const passThroughCreateButton = {
  root: 'ap-pt-button ap-pt-button-primary',
  label: 'ap-pt-button-label',
}

function createEmptyConfig() {
  return {
    format: 'ajax-proxy-backup',
    formatVersion: 3,
    settings: { globalEnabled: true, mode: 'interceptor', language: locale.value },
    tags: [],
    rules: [],
  }
}

function createPreviewConfig() {
  return {
    ...createEmptyConfig(),
    rules: [
      {
        id: 'preview-profile',
        enabled: true,
        match: { url: 'api.example.com/v1/profile', method: 'GET' },
        response: { enabled: true, replace: { body: { ok: true } } },
      },
      {
        id: 'preview-catalog',
        enabled: true,
        match: { url: '/v1/catalog/', method: 'GET' },
        request: { enabled: true, redirect: { url: '/fixtures/catalog.json' } },
        response: { enabled: true, replace: { body: { items: [] } } },
      },
      {
        id: 'preview-checkout',
        enabled: false,
        match: { url: 'api.example.com/v1/checkout', method: 'POST' },
        response: { enabled: true, replace: { body: { ok: false } } },
      },
    ],
  }
}

const activeMark = computed(() => (darkMode.value ? darkMark : lightMark))
const rules = computed(() => config.value.rules)
const enabled = computed(() => config.value.settings.globalEnabled)
const redirectRuleCount = computed(() => rules.value.filter((rule) => rule.request).length)
const interceptRuleCount = computed(() => rules.value.filter((rule) => rule.response).length)
const ruleFiltersActive = computed(
  () =>
    ruleStatusFilter.value !== 'all' ||
    ruleMatchTypeFilter.value !== 'all' ||
    selectedTagId.value !== ''
)

const selectedTagName = computed(
  () => config.value.tags.find((tag) => tag.id === selectedTagId.value)?.name ?? ''
)
const ruleTagsControl = ref(null)

function ruleTagNames(rule) {
  const selected = new Set(rule.tagIds ?? [])
  return config.value.tags.filter((tag) => selected.has(tag.id)).map((tag) => tag.name)
}

function ruleActions(rule) {
  const actions = []
  if (rule.request) actions.push({ key: 'redirect', enabled: rule.request.enabled })
  if (rule.response) {
    actions.push({
      key: rule.response.replace?.code ? 'responseFunction' : 'responseJson',
      enabled: rule.response.enabled,
    })
  }
  return actions
}

function isFirstActiveRule(rule) {
  return (
    config.value.rules.find(
      (item) => item.enabled && (item.request?.enabled || item.response?.enabled)
    )?.id === rule.id
  )
}

const visibleRules = computed(() => {
  const query = search.value.trim().toLowerCase()
  return rules.value.filter((rule) => {
    const actions = ruleActions(rule)
    const searchable = [
      rule.id,
      rule.match.url,
      rule.match.method ?? 'ANY',
      rule.request?.redirect.url ?? '',
      ...actions.map((action) => t(`action.${action.key}`)),
      ...ruleTagNames(rule),
    ]
    const matchesSearch = !query || searchable.join(' ').toLowerCase().includes(query)
    const matchesSection = section.value === 'redirect' ? rule.request : rule.response
    const matchesStatus =
      ruleStatusFilter.value === 'all' ||
      (ruleStatusFilter.value === 'enabled' ? rule.enabled : !rule.enabled)
    const matchType = rule.match.type ?? 'normal'
    const matchesType =
      ruleMatchTypeFilter.value === 'all' || ruleMatchTypeFilter.value === matchType
    const matchesTag =
      selectedTagId.value === '' || (rule.tagIds ?? []).includes(selectedTagId.value)
    return matchesSearch && matchesSection && matchesStatus && matchesType && matchesTag
  })
})

watch(
  () => visibleRules.value.map((rule) => rule.id),
  (visibleIds) => {
    const visible = new Set(visibleIds)
    selectedRuleIds.value = selectedRuleIds.value.filter((id) => visible.has(id))
  }
)

const allVisibleRulesSelected = computed(
  () =>
    visibleRules.value.length > 0 &&
    visibleRules.value.every((rule) => selectedRuleIds.value.includes(rule.id))
)

function clearRuleFilters() {
  ruleStatusFilter.value = 'all'
  ruleMatchTypeFilter.value = 'all'
  selectedTagId.value = ''
}

function openRuleTagManager() {
  ruleTagFilterOpen.value = false
  ruleTagsDialogOpen.value = true
}

function closeRuleTagFilter() {
  ruleTagFilterOpen.value = false
  nextTick(() => ruleTagsControl.value?.querySelector('button')?.focus())
}

function closeRuleTagManager() {
  ruleTagsDialogOpen.value = false
  nextTick(() => ruleTagsControl.value?.querySelector('button')?.focus())
}
const resultCount = computed(() => {
  if (locale.value === 'zh-CN') return t('rules.count', { count: visibleRules.value.length })
  const key = visibleRules.value.length === 1 ? 'rules.countOne' : 'rules.countOther'
  return t(key, { count: visibleRules.value.length })
})

function isPlainExtensionMessage(value) {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return false
    const keys = Object.keys(value)
    return keys.length === 4 && keys.every((key) => ['from', 'to', 'key', 'value'].includes(key))
  } catch {
    return false
  }
}

function receiveExtensionMessage(message) {
  if (
    !isPlainExtensionMessage(message) ||
    message.from !== NoticeFrom.SERVICE_WORKER ||
    message.to !== NoticeTo.PANELS
  ) {
    return
  }

  if (message.key === NoticeKey.V3_FUNCTION_ERROR && isV3FunctionError(message.value)) {
    const rule = config.value.rules.find((candidate) => candidate.id === message.value.rule_id)
    if (
      !rule ||
      !rule.enabled ||
      rule.match.url !== message.value.match_url ||
      !rule.response?.enabled ||
      typeof rule.response.replace.code !== 'string'
    ) {
      return
    }
    recentFunctionErrors.value = [
      { ...message.value, receivedAt: Date.now() },
      ...recentFunctionErrors.value,
    ].slice(0, 10)
    return
  }

  if (message.key !== NoticeKey.V3_HIT || !isV3HitNotice(message.value)) return

  const { rule_id: ruleId, count } = message.value
  if (!config.value.rules.some((rule) => rule.id === ruleId)) return
  if (count <= (hitCounters.value[ruleId] ?? 0)) return

  hitCounters.value = { ...hitCounters.value, [ruleId]: count }
  recentMatch.value = message.value
}

let removeExtensionMessageListener

watch(darkMode, (dark) => {
  document.documentElement.classList.toggle('app-dark', dark)
})

watch(
  locale,
  (currentLocale) => {
    document.documentElement.lang = currentLocale
    try {
      localStorage.setItem('ajax-proxy-v3-locale', currentLocale)
    } catch {
      // Keep language switching available when browser storage is unavailable.
    }
    if (
      configReady.value &&
      !memoryOnly.value &&
      config.value.settings.language !== currentLocale
    ) {
      void persistConfig({
        ...config.value,
        settings: { ...config.value.settings, language: currentLocale },
      })
    }
  },
  { immediate: true }
)

onMounted(async () => {
  try {
    const { deleteV3Rule, insertV3Rule, moveV3Rule, replaceV3Rule, setV3RuleEnabled } =
      await import('@proxy/v3-domain')
    ruleOperations = { deleteV3Rule, insertV3Rule, moveV3Rule, replaceV3Rule, setV3RuleEnabled }

    if (memoryOnly.value) {
      config.value = createPreviewConfig()
      loading.value = false
      return
    }

    const { createV3ConfigService } = await import('./services/v3Config.js')
    configService = createV3ConfigService(extensionRuntime)
    const result = await configService.getSnapshot()
    if (result.ok) {
      config.value = result.snapshot.config ?? createEmptyConfig()
      hitCounters.value = result.snapshot.hitCounters
      if (result.snapshot.config) locale.value = result.snapshot.config.settings.language
      configReady.value = true
      extensionRuntime.onMessage?.addListener(receiveExtensionMessage)
      removeExtensionMessageListener = () =>
        extensionRuntime.onMessage?.removeListener(receiveExtensionMessage)
    } else {
      operationError.value = t('editor.loadFailed', { error: result.error ?? 'invalid-data' })
    }
  } catch {
    operationError.value = t('editor.loadFailed', { error: 'service-unavailable' })
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => removeExtensionMessageListener?.())

async function persistConfig(nextConfig) {
  operationError.value = ''
  if (memoryOnly.value) {
    config.value = nextConfig
    return true
  }
  saving.value = true
  const result = await configService.saveConfig(nextConfig)
  saving.value = false
  if (!result.ok) {
    operationError.value = result.issues?.[0]
      ? t('editor.validationFailed', { issue: result.issues[0].message })
      : t('editor.saveFailed', { error: result.error ?? 'invalid-response' })
    return false
  }
  config.value = nextConfig
  return true
}

async function restoreBackup(backup) {
  if (!(await persistConfig(backup))) return
  recentMatch.value = null
  recentFunctionErrors.value = []
  locale.value = backup.settings.language
  backupDialogOpen.value = false
}

function showEditor(rule = null) {
  if (section.value !== 'redirect') return
  editorIssue.value = ''
  editingRule.value = rule
  editorOpen.value = true
}

function createRule() {
  if (!ruleOperations || loading.value || saving.value) return
  if (section.value === 'redirect') showEditor()
  else {
    responseEditorIssue.value = ''
    editingResponseRule.value = null
    responseEditorOpen.value = true
  }
}

function showResponseEditor(rule = null) {
  if (section.value !== 'intercept') return
  responseEditorIssue.value = ''
  editingResponseRule.value = rule
  responseEditorOpen.value = true
}

async function saveRedirectRule(fields) {
  const current = config.value
  const id = editingRule.value?.id ?? createRuleId(current.rules)
  const rule = {
    ...(editingRule.value ?? {}),
    id,
    enabled: fields.enabled,
    tagIds: [...(fields.tagIds ?? [])],
    match: fields.match,
    request: { enabled: true, redirect: { url: fields.redirectUrl } },
  }
  const nextRules = editingRule.value
    ? ruleOperations.replaceV3Rule(current.rules, id, rule)
    : ruleOperations.insertV3Rule(current.rules, rule, 0)
  if (nextRules === current.rules) {
    editorIssue.value = t('editor.duplicateRule')
    return
  }
  if (await persistConfig({ ...current, rules: [...nextRules] })) editorOpen.value = false
}

async function saveResponseRule(fields) {
  const current = config.value
  const id = editingResponseRule.value?.id ?? createRuleId(current.rules)
  const existing = editingResponseRule.value
  if (fields.mode === 'function') {
    const validation = validateFunctionResponseDraft(fields.code)
    if (!validation.ok) {
      responseEditorIssue.value = t(
        validation.error === 'code-too-long'
          ? 'responseEditor.functionCodeTooLong'
          : 'responseEditor.functionCodeRequired'
      )
      return
    }
    const rule = {
      ...(existing ?? {}),
      id,
      enabled: fields.enabled,
      tagIds: [...(fields.tagIds ?? [])],
      match: fields.match ?? existing?.match,
      response: {
        enabled: fields.responseEnabled,
        replace: { code: validation.code },
      },
    }
    const nextRules = existing
      ? ruleOperations.replaceV3Rule(current.rules, id, rule)
      : ruleOperations.insertV3Rule(current.rules, rule, 0)
    if (nextRules === current.rules) {
      responseEditorIssue.value = t('editor.duplicateRule')
      return
    }
    if (await persistConfig({ ...current, rules: [...nextRules] })) responseEditorOpen.value = false
    return
  }
  const result = buildV3ResponseRule({
    id,
    match: fields.match,
    statusDraft: fields.status,
    bodyDraft: JSON.stringify(fields.body),
    existingRule: existing ? { ...existing, enabled: fields.enabled } : undefined,
  })
  if (!result.ok) {
    responseEditorIssue.value = t(
      result.error === 'invalid-json'
        ? 'responseEditor.invalidJson'
        : 'responseEditor.invalidStatus'
    )
    return
  }
  const rule = result.rule
  rule.tagIds = [...(fields.tagIds ?? [])]
  const nextRules = existing
    ? ruleOperations.replaceV3Rule(current.rules, id, rule)
    : ruleOperations.insertV3Rule(current.rules, rule, 0)
  if (nextRules === current.rules) {
    responseEditorIssue.value = t('editor.duplicateRule')
    return
  }
  if (await persistConfig({ ...current, rules: [...nextRules] })) responseEditorOpen.value = false
}

function createRuleId(existingRules) {
  let id
  do {
    id = `rule-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`
  } while (existingRules.some((rule) => rule.id === id))
  return id
}

function createTagId(existingTags) {
  let id
  do {
    id = `tag-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`
  } while (existingTags.some((tag) => tag.id === id))
  return id
}

async function createTag(name) {
  const cleanName = name.trim()
  if (!cleanName || cleanName.length > 512) return
  if (config.value.tags.length >= 500) {
    operationError.value = t('ruleTags.tagLimit')
    return
  }
  if (
    config.value.tags.some(
      (tag) => tag.name.trim().toLocaleLowerCase() === cleanName.toLocaleLowerCase()
    )
  ) {
    operationError.value = t('ruleTags.duplicateName')
    return
  }
  await persistConfig({
    ...config.value,
    tags: [
      ...config.value.tags,
      { id: createTagId(config.value.tags), name: cleanName, used: false },
    ],
  })
}

async function renameTag(id, name) {
  const cleanName = name.trim()
  if (!cleanName || cleanName.length > 512) return
  if (
    config.value.tags.some(
      (tag) =>
        tag.id !== id && tag.name.trim().toLocaleLowerCase() === cleanName.toLocaleLowerCase()
    )
  ) {
    operationError.value = t('ruleTags.duplicateName')
    return
  }
  await persistConfig({
    ...config.value,
    tags: config.value.tags.map((tag) => (tag.id === id ? { ...tag, name: cleanName } : tag)),
  })
}

async function removeTag(tag) {
  const affectedRules = config.value.rules.filter((rule) => rule.tagIds?.includes(tag.id))
  if (!window.confirm(t('ruleTags.confirmRemove', { name: tag.name, count: affectedRules.length })))
    return
  const nextRules = config.value.rules.map((rule) => {
    if (!rule.tagIds?.includes(tag.id)) return rule
    const nextRule = { ...rule, tagIds: rule.tagIds.filter((id) => id !== tag.id) }
    if (nextRule.tagIds.length === 0) delete nextRule.tagIds
    return nextRule
  })
  if (
    await persistConfig({
      ...config.value,
      tags: config.value.tags.filter((item) => item.id !== tag.id),
      rules: nextRules,
    })
  ) {
    if (selectedTagId.value === tag.id) selectedTagId.value = ''
  }
}

async function setGlobalEnabled(value) {
  await persistConfig({
    ...config.value,
    settings: { ...config.value.settings, globalEnabled: value },
  })
}

async function setRuleEnabled(id, value) {
  const nextRules = ruleOperations.setV3RuleEnabled(config.value.rules, id, value)
  if (nextRules !== config.value.rules) {
    await persistConfig({ ...config.value, rules: [...nextRules] })
  }
}

function toggleVisibleRuleSelection() {
  const visibleIds = visibleRules.value.map((rule) => rule.id)
  if (allVisibleRulesSelected.value) {
    const visible = new Set(visibleIds)
    selectedRuleIds.value = selectedRuleIds.value.filter((id) => !visible.has(id))
    return
  }
  selectedRuleIds.value = [...new Set([...selectedRuleIds.value, ...visibleIds])]
}

function setRuleSelected(id, selected) {
  const selection = new Set(selectedRuleIds.value)
  if (selected) selection.add(id)
  else selection.delete(id)
  selectedRuleIds.value = [...selection]
}

async function setSelectedRulesEnabled(value) {
  const selected = new Set(selectedRuleIds.value)
  if (selected.size === 0) return
  const nextRules = config.value.rules.map((rule) =>
    selected.has(rule.id) && rule.enabled !== value ? { ...rule, enabled: value } : rule
  )
  if (await persistConfig({ ...config.value, rules: nextRules })) selectedRuleIds.value = []
}

function exportSelectedRules() {
  const selected = new Set(selectedRuleIds.value)
  const rules = config.value.rules.filter((rule) => selected.has(rule.id))
  if (!rules.length) return
  const tagIds = new Set(rules.flatMap((rule) => rule.tagIds ?? []))
  const backup = {
    ...config.value,
    tags: config.value.tags.filter((tag) => tagIds.has(tag.id)),
    rules,
  }
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  )
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `ajax-proxy-v3-rules-${new Date().toISOString().slice(0, 10)}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

async function importRules(backup) {
  const existingRuleIds = new Set(config.value.rules.map((rule) => rule.id))
  const incomingRules = backup.rules.filter((rule) => !existingRuleIds.has(rule.id))
  const referencedTagIds = new Set(incomingRules.flatMap((rule) => rule.tagIds ?? []))
  const mergedTags = [...config.value.tags]
  const tagIdsByName = new Map(
    mergedTags.map((tag) => [tag.name.trim().toLocaleLowerCase(), tag.id])
  )
  const importedTagIds = new Map()

  for (const tag of backup.tags.filter((candidate) => referencedTagIds.has(candidate.id))) {
    const existingById = mergedTags.find((current) => current.id === tag.id)
    if (existingById) {
      if (existingById.name !== tag.name) {
        operationError.value = t('backup.tagIdConflict', { name: tag.name, id: tag.id })
        return
      }
      importedTagIds.set(tag.id, existingById.id)
      continue
    }
    const normalizedName = tag.name.trim().toLocaleLowerCase()
    const existingByName = tagIdsByName.get(normalizedName)
    if (existingByName) {
      importedTagIds.set(tag.id, existingByName)
      continue
    }
    mergedTags.push(tag)
    tagIdsByName.set(normalizedName, tag.id)
    importedTagIds.set(tag.id, tag.id)
  }

  const rulesToAppend = incomingRules.map((rule) => ({
    ...rule,
    ...(rule.tagIds
      ? { tagIds: [...new Set(rule.tagIds.map((id) => importedTagIds.get(id) ?? id))] }
      : {}),
  }))
  const nextConfig = {
    ...config.value,
    tags: mergedTags,
    rules: [...config.value.rules, ...rulesToAppend],
  }
  const { formatV3ValidationIssues, validateV3Backup } = await import('@proxy/v3-domain')
  const validation = validateV3Backup(nextConfig)
  if (!validation.ok) {
    operationError.value = formatV3ValidationIssues(validation.issues)[0] ?? t('editor.saveFailed')
    return
  }
  if (await persistConfig(validation.data)) backupDialogOpen.value = false
}

async function duplicateRule(rule) {
  const current = config.value
  const sourceIndex = current.rules.findIndex((item) => item.id === rule.id)
  if (sourceIndex < 0) return
  const duplicate = structuredClone(toRaw(rule))
  duplicate.id = createRuleId(current.rules)
  duplicate.enabled = false
  const nextRules = ruleOperations.insertV3Rule(current.rules, duplicate, sourceIndex + 1)
  if (nextRules !== current.rules) await persistConfig({ ...current, rules: [...nextRules] })
}

async function deleteRule(rule) {
  const isRedirect = section.value === 'redirect'
  const actionExists = isRedirect ? Boolean(rule.request) : Boolean(rule.response)
  if (!actionExists) return
  const keepOtherAction = isRedirect ? Boolean(rule.response) : Boolean(rule.request)
  const confirmationKey = keepOtherAction
    ? isRedirect
      ? 'editor.confirmDeleteRedirect'
      : 'editor.confirmDeleteResponse'
    : 'editor.confirmDelete'
  if (!window.confirm(t(confirmationKey, { url: rule.match.url }))) return
  const nextRules = keepOtherAction
    ? ruleOperations.replaceV3Rule(
        config.value.rules,
        rule.id,
        isRedirect ? withoutRedirectAction(rule) : withoutResponseAction(rule)
      )
    : ruleOperations.deleteV3Rule(config.value.rules, rule.id)
  await persistConfig({ ...config.value, rules: [...nextRules] })
}

function withoutRedirectAction(rule) {
  const ruleWithoutRedirect = { ...rule }
  delete ruleWithoutRedirect.request
  return ruleWithoutRedirect
}

function withoutResponseAction(rule) {
  const ruleWithoutResponse = { ...rule }
  delete ruleWithoutResponse.response
  return ruleWithoutResponse
}

async function moveRule(rule, targetRule) {
  if (search.value.trim() || ruleFiltersActive.value) return
  const targetIndex = config.value.rules.findIndex((item) => item.id === targetRule.id)
  const nextRules = ruleOperations.moveV3Rule(config.value.rules, rule.id, targetIndex)
  if (nextRules !== config.value.rules) {
    await persistConfig({ ...config.value, rules: [...nextRules] })
  }
}
</script>

<template>
  <!-- Keep Vue-specific formatting warnings disabled here; Prettier is the template formatter. -->
  <!-- eslint-disable vue/max-attributes-per-line, vue/html-indent, vue/html-self-closing, vue/singleline-html-element-content-newline -->
  <div class="panel-root">
    <main class="shell" :class="{ 'shell-dark': darkMode }">
      <header class="topbar">
        <div class="brand-lockup">
          <img :src="activeMark" alt="" class="brand-mark" />
          <div>
            <strong>Ajax Proxy</strong>
            <span>{{ t('brand.subtitle') }}</span>
          </div>
        </div>

        <div class="page-context">
          <span class="context-dot" :class="{ 'context-dot-off': !enabled }" />
          <div>
            <span class="context-label">{{ t('page.current') }}</span>
            <strong>dev.example.com</strong>
          </div>
        </div>

        <div class="top-actions">
          <label class="enable-control">
            <span>{{ enabled ? t('proxy.enabled') : t('proxy.disabled') }}</span>
            <ToggleSwitch
              :model-value="enabled"
              :aria-label="t('proxy.aria')"
              :disabled="loading || saving"
              @update:modelValue="setGlobalEnabled"
            />
          </label>
          <AppButton
            class="theme-toggle"
            :label="darkMode ? t('theme.dark') : t('theme.light')"
            severity="secondary"
            text
            @click="darkMode = !darkMode"
          />
          <div class="language-toggle" role="group" :aria-label="t('language.aria')">
            <button
              v-for="item in languages"
              :key="item.code"
              type="button"
              :aria-label="item.label"
              :aria-pressed="locale === item.code"
              :class="{ selected: locale === item.code }"
              @click="locale = item.code"
            >
              {{ item.shortLabel }}
            </button>
          </div>
        </div>
      </header>

      <section class="workspace">
        <aside class="sidebar">
          <p class="sidebar-heading">{{ t('workspace.title') }}</p>
          <button
            type="button"
            class="nav-item"
            :class="{ selected: section === 'intercept' }"
            @click="section = 'intercept'"
          >
            <span class="nav-icon intercept-icon">⇄</span>
            <span>{{ t('workspace.intercept') }}</span>
            <span class="nav-count">{{ interceptRuleCount }}</span>
          </button>
          <button
            type="button"
            class="nav-item"
            :class="{ selected: section === 'redirect' }"
            @click="section = 'redirect'"
          >
            <span class="nav-icon redirect-icon">↗</span>
            <span>{{ t('workspace.redirect') }}</span>
            <span class="nav-count">{{ redirectRuleCount }}</span>
          </button>
          <div class="sidebar-divider" />
          <div class="sidebar-tip">
            <span class="tip-mark">i</span>
            <p>{{ t('workspace.tip') }}</p>
          </div>
          <div class="sidebar-footer">
            <span class="status-pulse" :class="{ paused: !enabled }" />
            <span>{{ enabled ? t('proxy.monitoring') : t('proxy.paused') }}</span>
          </div>
        </aside>

        <section class="content">
          <div class="content-heading">
            <div>
              <div class="eyebrow">
                {{ t('rules.eyebrow') }} /
                {{
                  section === 'intercept'
                    ? t('workspace.sectionIntercept')
                    : t('workspace.sectionRedirect')
                }}
              </div>
              <h1>
                {{ section === 'intercept' ? t('workspace.intercept') : t('workspace.redirect') }}
              </h1>
              <p>{{ t('rules.description') }}</p>
            </div>
            <AppButton
              :label="
                section === 'redirect' ? t('rules.createRedirect') : t('rules.createIntercept')
              "
              :pt="comparePassThrough ? passThroughCreateButton : undefined"
              :disabled="loading || saving"
              @click="createRule"
            />
          </div>

          <div class="toolbar">
            <label class="search-box">
              <span class="search-glyph">⌕</span>
              <InputText v-model="search" :placeholder="t('rules.searchPlaceholder')" />
              <kbd>⌘ K</kbd>
            </label>
            <AppButton
              :label="
                allVisibleRulesSelected
                  ? t('rules.clearVisibleSelection')
                  : t('rules.selectVisible')
              "
              severity="secondary"
              outlined
              :disabled="loading || saving || visibleRules.length === 0"
              @click="toggleVisibleRuleSelection"
            />
            <div ref="ruleTagsControl" class="filter-control">
              <AppButton
                :label="
                  selectedTagName
                    ? t('ruleTags.filterButton', { name: selectedTagName })
                    : t('rules.tags')
                "
                severity="secondary"
                outlined
                :aria-expanded="ruleTagFilterOpen"
                aria-controls="rule-tag-filter-popover"
                @click="ruleTagFilterOpen = !ruleTagFilterOpen"
                @keydown.esc.stop.prevent="closeRuleTagFilter"
              />
              <RuleTagFilterPopover
                :open="ruleTagFilterOpen"
                :tags="config.tags"
                :selected-tag-id="selectedTagId"
                @close="closeRuleTagFilter"
                @update:selected-tag-id="selectedTagId = $event"
                @manage="openRuleTagManager"
              />
            </div>
            <div class="filter-control">
              <AppButton
                :label="t('rules.filter')"
                severity="secondary"
                outlined
                :aria-expanded="ruleFiltersOpen"
                @click="ruleFiltersOpen = !ruleFiltersOpen"
              />
              <RuleFilterPopover
                :open="ruleFiltersOpen"
                :status="ruleStatusFilter"
                :match-type="ruleMatchTypeFilter"
                @close="ruleFiltersOpen = false"
                @update:status="ruleStatusFilter = $event"
                @update:match-type="ruleMatchTypeFilter = $event"
                @clear="clearRuleFilters"
              />
            </div>
            <div class="toolbar-spacer" />
            <span class="result-count">{{ loading ? t('editor.loading') : resultCount }}</span>
            <AppButton
              :label="t('rules.backup')"
              severity="secondary"
              text
              :disabled="loading || saving"
              @click="backupDialogOpen = true"
            />
          </div>

          <div v-if="operationError" class="operation-alert" role="alert">
            {{ operationError }}
          </div>

          <div
            v-if="selectedRuleIds.length"
            class="bulk-actions"
            role="group"
            :aria-label="t('rules.bulkActions')"
          >
            <span>{{ t('rules.selectedCount', { count: selectedRuleIds.length }) }}</span>
            <AppButton
              :label="t('backup.exportSelectedRules')"
              severity="secondary"
              outlined
              :disabled="saving || loading"
              @click="exportSelectedRules"
            />
            <AppButton
              :label="t('rules.enableSelected')"
              severity="secondary"
              outlined
              :disabled="saving || loading"
              @click="setSelectedRulesEnabled(true)"
            />
            <AppButton
              :label="t('rules.disableSelected')"
              severity="secondary"
              outlined
              :disabled="saving || loading"
              @click="setSelectedRulesEnabled(false)"
            />
            <AppButton
              :label="t('rules.clearSelection')"
              severity="secondary"
              text
              :disabled="saving"
              @click="selectedRuleIds = []"
            />
          </div>

          <div v-if="!enabled" class="disabled-notice" role="status">
            {{ t('proxy.disabledNotice') }}
          </div>

          <div v-if="recentMatch" class="recent-match" role="status" aria-live="polite">
            <div class="recent-match-copy">
              <strong>{{ t('rules.recentMatch') }}</strong>
              <code>
                {{
                  t('rules.matchedRequest', { method: recentMatch.method, url: recentMatch.url })
                }}
              </code>
              <small>{{ t('rules.matchCondition', { url: recentMatch.match_url }) }}</small>
            </div>
            <AppTag :value="t('rules.matched')" severity="info" />
          </div>

          <section
            v-if="recentFunctionErrors.length"
            class="function-errors"
            role="log"
            aria-live="polite"
            :aria-label="t('rules.functionErrorsTitle')"
          >
            <h2>{{ t('rules.functionErrorsTitle') }}</h2>
            <ul>
              <li
                v-for="(failure, index) in recentFunctionErrors"
                :key="`${failure.receivedAt}-${index}`"
              >
                <strong>{{ t(`functionFailure.${failure.code}`) }}</strong>
                <small>{{
                  t('rules.functionErrorRule', { method: failure.method, url: failure.match_url })
                }}</small>
              </li>
            </ul>
          </section>

          <div v-if="visibleRules.length" class="rule-list">
            <article v-for="(rule, index) in visibleRules" :key="rule.id" class="rule-row">
              <label class="rule-selection">
                <input
                  type="checkbox"
                  :checked="selectedRuleIds.includes(rule.id)"
                  :aria-label="t('rules.selectRule', { url: rule.match.url, id: rule.id })"
                  :disabled="saving || loading"
                  @change="setRuleSelected(rule.id, $event.target.checked)"
                />
              </label>
              <div class="rule-order">
                {{ String(index + 1).padStart(2, '0') }}
              </div>
              <ToggleSwitch
                :model-value="rule.enabled"
                :aria-label="t('rules.enableAria', { name: rule.match.url })"
                :disabled="saving || loading"
                @update:modelValue="setRuleEnabled(rule.id, $event)"
              />
              <div class="rule-main">
                <div class="rule-title-line">
                  <code>{{ rule.match.url }}</code>
                  <AppTag :value="rule.match.method ?? 'ANY'" severity="secondary" />
                  <AppTag
                    :value="rule.match.type === 'regex' ? t('rules.regex') : t('rules.contains')"
                    severity="secondary"
                  />
                  <span v-if="isFirstActiveRule(rule)" class="priority-pill">{{
                    t('rules.priority')
                  }}</span>
                  <span v-for="tag in ruleTagNames(rule)" :key="tag" class="rule-tag-chip">
                    {{ tag }}
                  </span>
                </div>
                <div class="rule-meta">
                  <span
                    v-for="action in ruleActions(rule)"
                    :key="action.key"
                    class="action-label"
                    :class="{ inactive: !action.enabled }"
                  >
                    <span
                      class="action-dot"
                      :class="{ coral: action.key === 'responseJson', inactive: !action.enabled }"
                    />
                    {{ t(`action.${action.key}`) }}
                    <small v-if="!action.enabled" class="action-disabled">
                      {{ t('rules.actionDisabled') }}
                    </small>
                  </span>
                  <span class="meta-separator" />
                  <span>{{ t('rules.ruleId', { id: rule.id }) }}</span>
                  <template v-if="rule.request?.enabled">
                    <span class="meta-separator" />
                    <span class="rule-target">{{
                      t('rules.redirectTarget', { url: rule.request.redirect.url })
                    }}</span>
                  </template>
                </div>
              </div>
              <div class="hit-count">
                <strong>{{ hitCounters[rule.id] ?? 0 }}</strong>
                <span>{{ t('rules.hits') }}</span>
              </div>
              <div class="rule-actions">
                <button
                  type="button"
                  :aria-label="t('editor.moveUp', { url: rule.match.url })"
                  :disabled="index === 0 || saving || Boolean(search.trim()) || ruleFiltersActive"
                  :title="
                    search.trim() || ruleFiltersActive ? t('rules.clearSearchToReorder') : undefined
                  "
                  @click="moveRule(rule, visibleRules[index - 1])"
                >
                  ↑
                </button>
                <button
                  type="button"
                  :aria-label="t('editor.moveDown', { url: rule.match.url })"
                  :disabled="
                    index === visibleRules.length - 1 ||
                    saving ||
                    Boolean(search.trim()) ||
                    ruleFiltersActive
                  "
                  :title="
                    search.trim() || ruleFiltersActive ? t('rules.clearSearchToReorder') : undefined
                  "
                  @click="moveRule(rule, visibleRules[index + 1])"
                >
                  ↓
                </button>
                <button type="button" :disabled="saving || loading" @click="duplicateRule(rule)">
                  {{ t('editor.duplicate') }}
                </button>
                <template v-if="section === 'redirect'">
                  <button type="button" :disabled="saving" @click="showEditor(rule)">
                    {{ t('editor.edit') }}
                  </button>
                  <button type="button" :disabled="saving" @click="deleteRule(rule)">
                    {{ t('editor.delete') }}
                  </button>
                </template>
                <template v-else>
                  <button type="button" :disabled="saving" @click="showResponseEditor(rule)">
                    {{ t('editor.edit') }}
                  </button>
                  <button type="button" :disabled="saving" @click="deleteRule(rule)">
                    {{ t('editor.delete') }}
                  </button>
                </template>
              </div>
            </article>
          </div>

          <div v-else class="empty-state">
            <div class="empty-illustration">⌕</div>
            <h2>
              {{ search || ruleFiltersActive ? t('rules.noSearchResults') : t('rules.noRules') }}
            </h2>
            <p>
              {{ search || ruleFiltersActive ? t('rules.searchHint') : t('rules.createHint') }}
            </p>
            <AppButton
              v-if="!search && !ruleFiltersActive"
              :label="t('rules.createFirst')"
              :disabled="loading || saving"
              @click="createRule"
            />
            <AppButton
              v-if="search"
              :label="t('rules.clearSearch')"
              severity="secondary"
              outlined
              @click="search = ''"
            />
            <AppButton
              v-if="ruleFiltersActive"
              :label="t('rules.clearRuleFilters')"
              severity="secondary"
              outlined
              @click="clearRuleFilters"
            />
          </div>

          <footer class="prototype-note">
            {{
              unstyledMode
                ? t('prototype.unstyled')
                : comparePassThrough
                  ? t('prototype.passThrough')
                  : t('prototype.styled')
            }}
            <span>·</span>
            {{ memoryOnly ? t('prototype.memory') : t('prototype.extension') }}
          </footer>
        </section>
      </section>
    </main>
    <RedirectRuleEditor
      :open="editorOpen"
      :rule="editingRule"
      :tags="config.tags"
      :saving="saving"
      :issue="editorIssue"
      @close="editorOpen = false"
      @save="saveRedirectRule"
    />
    <ResponseRuleEditor
      :open="responseEditorOpen"
      :rule="editingResponseRule"
      :tags="config.tags"
      :saving="saving"
      :issue="responseEditorIssue"
      @close="responseEditorOpen = false"
      @save="saveResponseRule"
    />
    <BackupRestoreDialog
      :open="backupDialogOpen"
      :backup="config"
      :saving="saving"
      :issue="operationError"
      @close="backupDialogOpen = false"
      @restore="restoreBackup"
      @import-rules="importRules"
    />
    <RuleTagsDialog
      :open="ruleTagsDialogOpen"
      :tags="config.tags"
      :saving="saving"
      @close="closeRuleTagManager"
      @create="createTag"
      @rename="renameTag"
      @remove="removeTag"
    />
  </div>
</template>
