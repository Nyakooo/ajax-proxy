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
import { supportedLocales } from './i18n/index.js'
import {
  isV3FunctionError,
  isV3FetchOutcome,
  isV3XHROutcome,
  isV3HitNotice,
  isV3HitCountersCleared,
  isV3NoMatch,
  NoticeFrom,
  NoticeKey,
  NoticeTo,
} from '@proxy/protocol'
import RedirectRuleEditor from './components/RedirectRuleEditor.vue'
import ResponseRuleEditor from './components/ResponseRuleEditor.vue'
import RuleFilterPopover from './components/RuleFilterPopover.vue'
import RuleTagFilterPopover from './components/RuleTagFilterPopover.vue'
import RuleTagsDialog from './components/RuleTagsDialog.vue'
import { buildV3ResponseRule } from './services/v3ResponseDraft.js'
import { validateFunctionResponseDraft } from './services/v3FunctionResponseDraft.js'
import { cloneV3RuleTemplate, V3_RULE_TEMPLATE_CATALOG } from './services/v3RuleTemplateCatalog.js'
import { createV3DiagnosticsCaptureStorage } from './services/v3DiagnosticsCaptureStorage.js'
import { createActiveTabOriginService } from './services/activeTabOrigin.js'
import { useThemePreference } from './services/useThemePreference.js'
import { matchesRuleSearch, orderPinnedRules } from '@proxy/v3-domain'
import lightMark from '../../shell-chrome/icons/128.png'
import darkMark from '../../../docs/brand/ajax-proxy-mark-dark.png'

const BackupRestoreDialog = defineAsyncComponent(
  () => import('./components/BackupRestoreDialog.vue')
)
const RuleTemplatesDialog = defineAsyncComponent(
  () => import('./components/RuleTemplatesDialog.vue')
)
const SiteSwitchesDialog = defineAsyncComponent(() => import('./components/SiteSwitchesDialog.vue'))

const { themeMode, darkMode, setThemeMode } = useThemePreference()
const section = ref('response')
const search = ref('')
const pageSize = ref(20)
const currentPage = ref(1)
const pinnedOnly = ref(false)
const requestedEditNotice = ref('')
const searchBox = ref(null)
const { locale, t } = useI18n({ useScope: 'global' })
let configService
let diagnosticsCaptureStorage
let ruleOperations
let pendingEditRequestId = ''
let pendingEditRequestAction = ''
let v3BackupVersion = 4
const memoryOnly = ref(!globalThis.chrome?.runtime?.sendMessage)
const loading = ref(true)
const configReady = ref(false)
const saving = ref(false)
const clearingHitCounters = ref(false)
const operationError = ref('')
const editorOpen = ref(false)
const editingRule = ref(null)
const editorIssue = ref('')
const responseEditorOpen = ref(false)
const editingResponseRule = ref(null)
const responseEditorIssue = ref('')
const backupDialogOpen = ref(false)
const ruleTemplatesDialogOpen = ref(false)
const siteSwitchesDialogOpen = ref(false)
const backupDialogTrigger = ref(null)
const ruleTemplatesDialogTrigger = ref(null)
const siteSwitchesDialogTrigger = ref(null)
const ruleFiltersOpen = ref(false)
const ruleFilterControl = ref(null)
const ruleTagFilterOpen = ref(false)
const ruleTagsDialogOpen = ref(false)
const ruleDiagnosticsOpen = ref(false)
const diagnosticUrl = ref('')
const diagnosticMethod = ref('GET')
const diagnosticResult = ref(null)
const ruleStatusFilter = ref('all')
const ruleMatchTypeFilter = ref('all')
const selectedTagId = ref('')
const selectedRuleIds = ref([])
const config = ref(createEmptyConfig())
const configRevision = ref('')
const configConflict = ref(false)
const hitCounters = ref({})
const hasHitCounters = computed(() => Object.values(hitCounters.value).some((count) => count > 0))
const recentMatches = ref([])
const recentFunctionErrors = ref([])
const noMatchCaptureArmed = ref(false)
const recentNoMatches = ref([])
const fetchOutcomeCaptureArmed = ref(false)
const recentFetchOutcomes = ref([])
const currentSiteOrigin = ref('')
let removeActiveTabOriginListener
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
    formatVersion: v3BackupVersion,
    settings: { globalEnabled: true, mode: 'interceptor', language: locale.value },
    tags: [],
    rules: [],
    disabledOrigins: [],
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
const disabledOrigins = computed(() => config.value.disabledOrigins ?? [])
const redirectRuleCount = computed(() => rules.value.filter((rule) => rule.request).length)
const responseRuleCount = computed(() => rules.value.filter((rule) => rule.response).length)
const ruleFiltersActive = computed(
  () =>
    ruleStatusFilter.value !== 'all' ||
    ruleMatchTypeFilter.value !== 'all' ||
    selectedTagId.value !== '' ||
    pinnedOnly.value
)

const selectedTagName = computed(
  () => config.value.tags.find((tag) => tag.id === selectedTagId.value)?.name ?? ''
)
const ruleTagsControl = ref(null)

function ruleTagNames(rule) {
  const selected = new Set(rule.tagIds ?? [])
  return config.value.tags.filter((tag) => selected.has(tag.id)).map((tag) => tag.name)
}

function ruleDisplayName(rule) {
  return rule?.title?.trim() || rule?.match?.url || rule?.id || ''
}

function ruleDisplayNameById(ruleId) {
  const rule = config.value.rules.find((candidate) => candidate.id === ruleId)
  return ruleDisplayName(rule) || ruleId
}

function ruleTitleById(ruleId) {
  return config.value.rules.find((candidate) => candidate.id === ruleId)?.title ?? ''
}

function applyRuleTitle(rule, title) {
  const cleanTitle = typeof title === 'string' ? title.trim() : ''
  if (cleanTitle) rule.title = cleanTitle
  else delete rule.title
}

function ruleActions(rule) {
  const actions = []
  if (rule.request) {
    actions.push({
      key: rule.request.redirect?.type === 'function' ? 'redirectFunction' : 'redirect',
      enabled: rule.request.enabled,
    })
  }
  if (rule.response) {
    actions.push({
      key: rule.response.replace?.code ? 'responseFunction' : 'responseJson',
      enabled: rule.response.enabled,
    })
  }
  return actions
}

function functionErrorActionLabel(failure) {
  return t(`action.${failure.action === 'redirect' ? 'redirectFunction' : 'responseFunction'}`)
}

function isFirstActiveRule(rule) {
  return (
    viewOrderedRules.value.find((item) =>
      section.value === 'redirect'
        ? item.enabled && item.request?.enabled
        : item.enabled && item.response?.enabled
    )?.id === rule.id
  )
}

const orderedRules = computed(() => orderPinnedRules(rules.value))
const viewOrderedRules = computed(() =>
  orderedRules.value.filter((rule) =>
    section.value === 'redirect' ? Boolean(rule.request) : Boolean(rule.response)
  )
)
const filteredRules = computed(() => {
  return viewOrderedRules.value.filter((rule) => {
    const matchesSearch = matchesRuleSearch(rule, search.value, config.value.tags)
    const matchesStatus =
      ruleStatusFilter.value === 'all' ||
      (ruleStatusFilter.value === 'enabled' ? rule.enabled : !rule.enabled)
    const matchType = rule.match.type ?? 'normal'
    const matchesType =
      ruleMatchTypeFilter.value === 'all' || ruleMatchTypeFilter.value === matchType
    const matchesTag =
      selectedTagId.value === '' || (rule.tagIds ?? []).includes(selectedTagId.value)
    return (
      matchesSearch &&
      matchesStatus &&
      matchesType &&
      matchesTag &&
      (!pinnedOnly.value || rule.pinned)
    )
  })
})

const pageCount = computed(() =>
  Math.max(1, Math.ceil(filteredRules.value.length / pageSize.value))
)
const pageRules = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredRules.value.slice(start, start + pageSize.value)
})
const visibleRules = pageRules

watch([filteredRules, pageSize], () => {
  currentPage.value = Math.min(currentPage.value, pageCount.value)
})

watch([search, ruleStatusFilter, ruleMatchTypeFilter, selectedTagId, pinnedOnly, section], () => {
  currentPage.value = 1
})

watch(
  () => pageRules.value.map((rule) => rule.id),
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
  pinnedOnly.value = false
}

function openRuleTagManager() {
  ruleTagFilterOpen.value = false
  ruleTagsDialogOpen.value = true
}

function toggleRuleTagFilter() {
  if (ruleTagFilterOpen.value) {
    closeRuleTagFilter()
    return
  }
  ruleFiltersOpen.value = false
  ruleDiagnosticsOpen.value = false
  ruleTagFilterOpen.value = true
}

function closeRuleTagFilter() {
  ruleTagFilterOpen.value = false
  nextTick(() => ruleTagsControl.value?.querySelector('button')?.focus())
}

function toggleRuleFilters() {
  if (ruleFiltersOpen.value) {
    closeRuleFilters()
    return
  }
  ruleTagFilterOpen.value = false
  ruleDiagnosticsOpen.value = false
  ruleFiltersOpen.value = true
}

function closeRuleFilters() {
  ruleFiltersOpen.value = false
  nextTick(() => ruleFilterControl.value?.querySelector('button')?.focus())
}

function toggleRuleDiagnostics() {
  if (ruleDiagnosticsOpen.value) {
    ruleDiagnosticsOpen.value = false
    return
  }
  ruleFiltersOpen.value = false
  ruleTagFilterOpen.value = false
  ruleDiagnosticsOpen.value = true
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

  if (message.key === NoticeKey.V3_HITS_CLEARED && isV3HitCountersCleared(message.value)) {
    if (message.value.scope === 'all') hitCounters.value = {}
    else {
      const nextCounters = { ...hitCounters.value }
      delete nextCounters[message.value.rule_id]
      hitCounters.value = nextCounters
    }
    return
  }

  if (message.key === NoticeKey.V3_FUNCTION_ERROR && isV3FunctionError(message.value)) {
    const rule = config.value.rules.find((candidate) => candidate.id === message.value.rule_id)
    const actionEnabled =
      message.value.action === 'redirect'
        ? rule?.request?.enabled && rule.request.redirect?.type === 'function'
        : rule?.response?.enabled && typeof rule.response.replace.code === 'string'
    if (!rule || !rule.enabled || rule.match.url !== message.value.match_url || !actionEnabled) {
      return
    }
    recentFunctionErrors.value = [
      { ...message.value, receivedAt: Date.now() },
      ...recentFunctionErrors.value,
    ].slice(0, 10)
    return
  }

  if (message.key === NoticeKey.V3_NO_MATCH && isV3NoMatch(message.value)) {
    const knownRuleIds = new Set(config.value.rules.map((rule) => rule.id))
    const event = {
      method: message.value.method,
      rules: message.value.rules.filter((rule) => knownRuleIds.has(rule.rule_id)),
      truncated: message.value.truncated,
      receivedAt: Date.now(),
    }
    // Reject payloads referring only to unknown/stale rules. Empty rules is valid
    // when the active configuration genuinely has no rules.
    if (message.value.rules.length && !event.rules.length) return
    recentNoMatches.value = [event, ...recentNoMatches.value].slice(0, 10)
    return
  }

  if (
    message.key === NoticeKey.V3_FETCH_OUTCOME &&
    (isV3FetchOutcome(message.value) || isV3XHROutcome(message.value))
  ) {
    const rule = config.value.rules.find((candidate) => candidate.id === message.value.rule_id)
    if (!rule || !rule.enabled) return
    const isMockOutcome = message.value.reason === 'mock-network-skipped'
    if (
      isMockOutcome &&
      (message.value.stage !== 'request' ||
        message.value.outcome !== 'applied' ||
        !rule.response?.enabled ||
        rule.response.mode !== 'mock')
    ) {
      return
    }
    const actionEnabled =
      message.value.stage === 'request'
        ? message.value.reason === 'network-failed' || isMockOutcome
          ? Boolean(rule.request?.enabled || rule.response?.enabled)
          : Boolean(rule.request?.enabled)
        : Boolean(rule.response?.enabled)
    if (!actionEnabled) return
    recentFetchOutcomes.value = [
      { ...message.value, receivedAt: Date.now() },
      ...recentFetchOutcomes.value,
    ].slice(0, 10)
    return
  }

  if (message.key !== NoticeKey.V3_HIT || !isV3HitNotice(message.value)) return

  const { rule_id: ruleId, count } = message.value
  const hitRule = config.value.rules.find((rule) => rule.id === ruleId)
  if (!hitRule) return
  if (
    message.value.response_mode === 'mock' &&
    (message.value.network_skipped !== true ||
      hitRule.response?.enabled !== true ||
      hitRule.response.mode !== 'mock')
  ) {
    return
  }
  if (count > (hitCounters.value[ruleId] ?? 0)) {
    hitCounters.value = { ...hitCounters.value, [ruleId]: count }
  }
  // Storage can publish the updated counter before the corresponding runtime
  // message arrives. Keep the request details even when its count is current.
  if (recentMatches.value.some((match) => match.rule_id === ruleId && match.count === count)) return
  recentMatches.value = [
    { ...message.value, receivedAt: Date.now() },
    ...recentMatches.value,
  ].slice(0, 10)
}

function formatMatchTime(timestamp) {
  return new Intl.DateTimeFormat(locale.value, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(timestamp)
}

function formatHitCount(count) {
  return new Intl.NumberFormat(locale.value).format(count)
}

function focusSearchWithShortcut(event) {
  if (
    (!event.metaKey && !event.ctrlKey) ||
    event.altKey ||
    event.shiftKey ||
    event.key.toLowerCase() !== 'k'
  ) {
    return
  }

  if (document.querySelector('[role="dialog"][aria-modal="true"]')) return

  const target = event.target
  const isEditingField =
    target instanceof HTMLElement &&
    target.closest('input, textarea, select, [contenteditable="true"]')
  if (isEditingField && !searchBox.value?.contains(target)) return

  const input = searchBox.value?.querySelector('input')
  if (!input) return
  event.preventDefault()
  input.focus()
  input.select()
}

function runRuleDiagnostics() {
  const url = diagnosticUrl.value.trim()
  if (!url || !ruleOperations) {
    diagnosticResult.value = null
    return
  }
  diagnosticResult.value = ruleOperations.analyzeV3RuleMatches(
    config.value.rules,
    { url, method: diagnosticMethod.value },
    config.value.settings.globalEnabled
  )
}

let removeExtensionMessageListener
let removeEditRequestListener
let removeDiagnosticsStorageListener

function getDiagnosticsCaptureStorage() {
  if (!diagnosticsCaptureStorage?.available) {
    diagnosticsCaptureStorage = createV3DiagnosticsCaptureStorage()
  }
  return diagnosticsCaptureStorage
}

async function setNoMatchCapture(armed) {
  if (memoryOnly.value) return
  try {
    const storage = getDiagnosticsCaptureStorage()
    if (!storage.available) return
    await storage.setNoMatchCaptureArmed(armed)
    noMatchCaptureArmed.value = armed
  } catch {
    operationError.value = t('editor.saveFailed', { error: 'storage-unavailable' })
  }
}

function cancelNoMatchCapture() {
  if (noMatchCaptureArmed.value) void setNoMatchCapture(false)
}

async function setFetchOutcomeCapture(armed) {
  if (memoryOnly.value) return
  try {
    const storage = getDiagnosticsCaptureStorage()
    if (!storage.available) return
    await storage.setFetchOutcomeCaptureArmed(armed)
    fetchOutcomeCaptureArmed.value = armed
  } catch {
    operationError.value = t('editor.saveFailed', { error: 'storage-unavailable' })
  }
}

function cancelFetchOutcomeCapture() {
  if (fetchOutcomeCaptureArmed.value) void setFetchOutcomeCapture(false)
}

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
  window.addEventListener('keydown', focusSearchWithShortcut)
  const applyEditRequest = (message) => {
    if (!configReady.value) {
      pendingEditRequestId = message.ruleId
      pendingEditRequestAction = message.action ?? ''
      return
    }
    openRequestedRule(message.ruleId, true, message.action)
  }
  const editRequestListener = (message, sender) => {
    if (
      message?.type !== 'ajax-proxy:edit-rule' ||
      typeof message.ruleId !== 'string' ||
      (message.action !== undefined && !['response', 'redirect'].includes(message.action)) ||
      (message.targetTabId !== undefined &&
        (!Number.isSafeInteger(message.targetTabId) || message.targetTabId < 0)) ||
      sender?.id !== globalThis.chrome?.runtime?.id ||
      sender?.tab
    )
      return
    if (message.targetTabId !== undefined) {
      const tabs = globalThis.chrome?.tabs
      if (typeof tabs?.getCurrent !== 'function') return
      tabs.getCurrent((tab) => {
        const error = globalThis.chrome?.runtime?.lastError
        if (!error && tab?.id === message.targetTabId) applyEditRequest(message)
      })
      return
    }
    applyEditRequest(message)
  }
  globalThis.chrome?.runtime?.onMessage?.addListener(editRequestListener)
  removeEditRequestListener = () =>
    globalThis.chrome?.runtime?.onMessage?.removeListener(editRequestListener)
  removeActiveTabOriginListener = createActiveTabOriginService().subscribe((origin) => {
    currentSiteOrigin.value = origin
  })
  try {
    const {
      analyzeV3RuleMatches,
      deleteV3Rule,
      insertV3Rule,
      moveV3Rule,
      replaceV3Rule,
      setV3RuleEnabled,
      V3_BACKUP_VERSION,
    } = await import('@proxy/v3-domain')
    v3BackupVersion = V3_BACKUP_VERSION
    ruleOperations = {
      analyzeV3RuleMatches,
      deleteV3Rule,
      insertV3Rule,
      moveV3Rule,
      replaceV3Rule,
      setV3RuleEnabled,
    }

    if (memoryOnly.value) {
      config.value = createPreviewConfig()
      loading.value = false
      return
    }

    const { createV3ConfigService } = await import('./services/v3Config.js')
    configService = createV3ConfigService()
    const result = await configService.getSnapshot()
    if (result.ok) {
      const snapshotConfig = result.snapshot.config
      config.value = snapshotConfig
        ? {
            ...snapshotConfig,
            formatVersion: v3BackupVersion,
            disabledOrigins: snapshotConfig.disabledOrigins ?? [],
          }
        : createEmptyConfig()
      configRevision.value = result.snapshot.revision
      hitCounters.value = result.snapshot.hitCounters
      if (snapshotConfig) locale.value = snapshotConfig.settings.language
      configReady.value = true
      const requestedEditId = new URLSearchParams(window.location.search).get('edit')
      const requestedEditAction = new URLSearchParams(window.location.search).get('action')
      if (requestedEditId || pendingEditRequestId)
        openRequestedRule(
          requestedEditId || pendingEditRequestId,
          false,
          requestedEditAction || pendingEditRequestAction
        )
      pendingEditRequestId = ''
      pendingEditRequestAction = ''
      removeExtensionMessageListener = configService.subscribe(receiveExtensionMessage)
      const captureStorage = getDiagnosticsCaptureStorage()
      if (captureStorage.canObserveChanges) {
        const state = await captureStorage.getState()
        noMatchCaptureArmed.value = state.noMatchCaptureArmed
        fetchOutcomeCaptureArmed.value = state.fetchOutcomeCaptureArmed
        removeDiagnosticsStorageListener = captureStorage.subscribe((changed) => {
          if (Object.hasOwn(changed, 'noMatchCaptureArmed')) {
            noMatchCaptureArmed.value = changed.noMatchCaptureArmed
          }
          if (Object.hasOwn(changed, 'fetchOutcomeCaptureArmed')) {
            fetchOutcomeCaptureArmed.value = changed.fetchOutcomeCaptureArmed
          }
        })
      }
      window.addEventListener('pagehide', cancelNoMatchCapture)
      window.addEventListener('pagehide', cancelFetchOutcomeCapture)
    } else {
      operationError.value = t('editor.loadFailed', { error: result.error ?? 'invalid-data' })
    }
  } catch {
    operationError.value = t('editor.loadFailed', { error: 'service-unavailable' })
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', focusSearchWithShortcut)
  cancelNoMatchCapture()
  cancelFetchOutcomeCapture()
  removeExtensionMessageListener?.()
  removeEditRequestListener?.()
  removeDiagnosticsStorageListener?.()
  removeActiveTabOriginListener?.()
  window.removeEventListener('pagehide', cancelNoMatchCapture)
  window.removeEventListener('pagehide', cancelFetchOutcomeCapture)
})

async function persistConfig(nextConfig) {
  operationError.value = ''
  configConflict.value = false
  nextConfig = {
    ...nextConfig,
    formatVersion: v3BackupVersion,
    disabledOrigins: nextConfig.disabledOrigins ?? [],
  }
  if (memoryOnly.value) {
    config.value = nextConfig
    return true
  }
  saving.value = true
  const result = await configService.saveConfig(nextConfig, configRevision.value)
  saving.value = false
  if (!result.ok) {
    if (result.error === 'config-conflict') {
      configConflict.value = true
      operationError.value = t('editor.configConflict')
    } else {
      operationError.value = result.issues?.[0]
        ? t('editor.validationFailed', { issue: result.issues[0].message })
        : t('editor.saveFailed', { error: result.error ?? 'invalid-response' })
    }
    return false
  }
  config.value = nextConfig
  configRevision.value = result.revision
  return true
}

async function clearHitCounters(target) {
  if (memoryOnly.value || clearingHitCounters.value || loading.value || saving.value) return
  if (target.scope === 'all' && !globalThis.confirm(t('rules.confirmClearAllHits'))) return

  clearingHitCounters.value = true
  operationError.value = ''
  try {
    const result = await configService.clearHitCounters(target)
    if (result.ok) {
      hitCounters.value = result.hitCounters
    } else {
      operationError.value = t('rules.clearHitsFailed', {
        error: result.issues?.[0]?.message ?? result.error ?? 'invalid-response',
      })
    }
  } catch {
    operationError.value = t('rules.clearHitsFailed', { error: 'message-failed' })
  } finally {
    clearingHitCounters.value = false
  }
}

function openDialog(openState, trigger, event) {
  ruleFiltersOpen.value = false
  ruleTagFilterOpen.value = false
  ruleDiagnosticsOpen.value = false
  trigger.value = event.currentTarget
  openState.value = true
}

function openBackupDialog(event) {
  openDialog(backupDialogOpen, backupDialogTrigger, event)
}

function openRuleTemplatesDialog(event) {
  openDialog(ruleTemplatesDialogOpen, ruleTemplatesDialogTrigger, event)
}

function openSiteSwitchesDialog(event) {
  openDialog(siteSwitchesDialogOpen, siteSwitchesDialogTrigger, event)
}

async function closeDialog(openState, trigger) {
  openState.value = false
  await nextTick()
  if (trigger.value?.isConnected) trigger.value.focus()
}

function closeBackupDialog() {
  return closeDialog(backupDialogOpen, backupDialogTrigger)
}

function closeRuleTemplatesDialog() {
  return closeDialog(ruleTemplatesDialogOpen, ruleTemplatesDialogTrigger)
}

function closeSiteSwitchesDialog() {
  return closeDialog(siteSwitchesDialogOpen, siteSwitchesDialogTrigger)
}

async function loadLatestConfig() {
  if (!configConflict.value || !globalThis.confirm(t('editor.confirmLoadLatest'))) return
  saving.value = true
  const result = await configService.getSnapshot()
  saving.value = false
  if (!result.ok) {
    operationError.value = t('editor.loadFailed', { error: result.error ?? 'invalid-response' })
    return
  }
  const snapshotConfig = result.snapshot.config
  config.value = snapshotConfig
    ? {
        ...snapshotConfig,
        formatVersion: v3BackupVersion,
        disabledOrigins: snapshotConfig.disabledOrigins ?? [],
      }
    : createEmptyConfig()
  configRevision.value = result.snapshot.revision
  if (snapshotConfig) locale.value = snapshotConfig.settings.language
  configConflict.value = false
  operationError.value = ''
  editorOpen.value = false
  editingRule.value = null
  editorIssue.value = ''
  responseEditorOpen.value = false
  editingResponseRule.value = null
  responseEditorIssue.value = ''
  siteSwitchesDialogOpen.value = false
  ruleTemplatesDialogOpen.value = false
  backupDialogOpen.value = false
  ruleTagsDialogOpen.value = false
}

async function restoreBackup(backup) {
  if (!(await persistConfig(backup))) return
  recentMatches.value = []
  recentFunctionErrors.value = []
  locale.value = backup.settings.language
  await closeBackupDialog()
}

async function addRuleTemplate(templateId) {
  if (!ruleOperations || loading.value || saving.value) return
  const template = cloneV3RuleTemplate(templateId)
  if (!template) return
  const templateDefinition = V3_RULE_TEMPLATE_CATALOG.find((item) => item.templateId === templateId)
  const rule = {
    ...template,
    id: createRuleId(config.value.rules),
    enabled: false,
    ...(templateDefinition ? { title: t(templateDefinition.titleKey) } : {}),
  }
  const nextRules = ruleOperations.insertV3Rule(config.value.rules, rule, config.value.rules.length)
  if (nextRules === config.value.rules) return
  if (!(await persistConfig({ ...config.value, rules: [...nextRules] }))) return

  ruleTemplatesDialogOpen.value = false
  if (rule.request?.enabled) {
    section.value = 'redirect'
    showEditor(rule)
  } else {
    section.value = 'response'
    showResponseEditor(rule)
  }
  await revealRule(rule.id, true)
}

function showEditor(rule = null) {
  ruleFiltersOpen.value = false
  ruleTagFilterOpen.value = false
  ruleDiagnosticsOpen.value = false
  editorIssue.value = ''
  editingRule.value = rule
  editorOpen.value = true
}

function createRule() {
  if (!ruleOperations || loading.value || saving.value) return
  if (section.value === 'redirect')
    showEditor({
      enabled: true,
      tagIds: [],
      match: { url: '', method: 'ANY', type: 'normal' },
      request: { enabled: true, redirect: { url: '' } },
    })
  else
    showResponseEditor({
      enabled: true,
      tagIds: [],
      match: { url: '', method: 'ANY', type: 'normal' },
      response: { enabled: true, replace: { status: 200, body: {} } },
    })
}

function showResponseEditor(rule = null) {
  ruleFiltersOpen.value = false
  ruleTagFilterOpen.value = false
  ruleDiagnosticsOpen.value = false
  responseEditorIssue.value = ''
  editingResponseRule.value = rule
  responseEditorOpen.value = true
}

function openRequestedRule(ruleId, confirmReplace = false, requestedAction = '') {
  const rule = config.value.rules.find((candidate) => candidate.id === ruleId)
  if (!rule) {
    requestedEditNotice.value = t('rules.requestedEditMissing', { id: ruleId })
    return
  }
  const action =
    requestedAction === 'redirect' && rule.request
      ? 'redirect'
      : requestedAction === 'response' && rule.response
        ? 'response'
        : rule.response
          ? 'response'
          : 'redirect'
  if (action === 'redirect' && editingRule.value?.id === ruleId && editorOpen.value) return
  if (action === 'response' && editingResponseRule.value?.id === ruleId && responseEditorOpen.value)
    return
  requestedEditNotice.value = ''
  if (confirmReplace && (editorOpen.value || responseEditorOpen.value)) {
    if (!globalThis.confirm(t('rules.confirmSwitchEditor'))) return
    editorOpen.value = false
    editingRule.value = null
    editorIssue.value = ''
    responseEditorOpen.value = false
    editingResponseRule.value = null
    responseEditorIssue.value = ''
  }
  section.value = action
  if (action === 'response') showResponseEditor(rule)
  else showEditor(rule)
}

function createRuleFromMatch(match, action) {
  if (loading.value || saving.value) return
  const rule = {
    enabled: false,
    tagIds: [],
    match: {
      url: match.url || match.match_url,
      method: match.method,
      type: 'normal',
    },
  }
  if (action === 'redirect') {
    section.value = 'redirect'
    showEditor({ ...rule, request: { enabled: true, redirect: { url: '' } } })
    return
  }
  section.value = 'response'
  showResponseEditor({
    ...rule,
    response: { enabled: true, replace: { status: 200, body: {} } },
  })
}

function closeQuickRedirectEditor() {
  editorOpen.value = false
}

function closeQuickResponseEditor() {
  responseEditorOpen.value = false
}

async function revealRule(id, clearFilters = false) {
  if (clearFilters) {
    search.value = ''
    ruleStatusFilter.value = 'all'
    ruleMatchTypeFilter.value = 'all'
    selectedTagId.value = ''
    pinnedOnly.value = false
  }
  await nextTick()
  const index = filteredRules.value.findIndex((rule) => rule.id === id)
  if (index < 0) return
  currentPage.value = Math.floor(index / pageSize.value) + 1
  await nextTick()
  Array.from(document.querySelectorAll('[data-rule-id]'))
    .find((element) => element.dataset.ruleId === id)
    ?.scrollIntoView?.({ block: 'nearest' })
}

async function saveRedirectRule(fields) {
  const current = config.value
  const existing = editingRule.value?.id ? editingRule.value : null
  const isNewRule = !editingRule.value?.id
  const id = editingRule.value?.id ?? createRuleId(current.rules)
  const rule = {
    ...(editingRule.value ?? {}),
    id,
    enabled: fields.enabled,
    tagIds: [...(fields.tagIds ?? [])],
    match: fields.match,
    request: {
      enabled: fields.redirectEnabled ?? true,
      redirect:
        fields.redirectMode === 'function'
          ? {
              type: 'function',
              code: fields.code,
              ...(fields.exclusions?.length ? { exclusions: [...fields.exclusions] } : {}),
            }
          : {
              url: fields.redirectUrl,
              ...(Object.keys(fields.redirectHeaders ?? {}).length
                ? { headers: { ...fields.redirectHeaders } }
                : {}),
              ...(fields.exclusions?.length ? { exclusions: [...fields.exclusions] } : {}),
            },
    },
  }
  applyRuleTitle(rule, fields.title)
  const nextRules = existing
    ? ruleOperations.replaceV3Rule(current.rules, id, rule)
    : ruleOperations.insertV3Rule(current.rules, rule, current.rules.length)
  if (nextRules === current.rules) {
    editorIssue.value = t('editor.duplicateRule')
    return
  }
  if (await persistConfig({ ...current, rules: [...nextRules] })) {
    editorOpen.value = false
    if (isNewRule) await revealRule(id, true)
    editingRule.value = null
  }
}

async function saveResponseRule(fields) {
  const current = config.value
  const id = editingResponseRule.value?.id ?? createRuleId(current.rules)
  const existing = editingResponseRule.value?.id ? editingResponseRule.value : null
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
    applyRuleTitle(rule, fields.title)
    const nextRules = existing
      ? ruleOperations.replaceV3Rule(current.rules, id, rule)
      : ruleOperations.insertV3Rule(current.rules, rule, current.rules.length)
    if (nextRules === current.rules) {
      responseEditorIssue.value = t('editor.duplicateRule')
      return
    }
    if (await persistConfig({ ...current, rules: [...nextRules] })) {
      responseEditorOpen.value = false
      if (!existing) await revealRule(id, true)
      editingResponseRule.value = null
    }
    return
  }
  const result = buildV3ResponseRule({
    id,
    match: fields.match,
    statusDraft: fields.status,
    bodyDraft: JSON.stringify(fields.body),
    deliveryMode: fields.deliveryMode,
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
  rule.enabled = fields.enabled
  rule.tagIds = [...(fields.tagIds ?? [])]
  applyRuleTitle(rule, fields.title)
  const nextRules = existing
    ? ruleOperations.replaceV3Rule(current.rules, id, rule)
    : ruleOperations.insertV3Rule(current.rules, rule, current.rules.length)
  if (nextRules === current.rules) {
    responseEditorIssue.value = t('editor.duplicateRule')
    return
  }
  if (await persistConfig({ ...current, rules: [...nextRules] })) {
    responseEditorOpen.value = false
    if (!existing) await revealRule(id, true)
    editingResponseRule.value = null
  }
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

async function disableSiteOrigin(origin) {
  const nextDisabledOrigins = new Set(disabledOrigins.value)
  nextDisabledOrigins.add(origin)
  if (
    await persistConfig({
      ...config.value,
      disabledOrigins: [...nextDisabledOrigins].sort(),
    })
  ) {
    await closeSiteSwitchesDialog()
  }
}

async function enableSiteOrigin(origin) {
  const nextDisabledOrigins = disabledOrigins.value.filter((item) => item !== origin)
  await persistConfig({ ...config.value, disabledOrigins: nextDisabledOrigins })
}

async function setRuleEnabled(id, value) {
  const nextRules = ruleOperations.setV3RuleEnabled(config.value.rules, id, value)
  if (nextRules !== config.value.rules) {
    await persistConfig({ ...config.value, rules: [...nextRules] })
  }
}

async function setRulePinned(rule, pinned) {
  const updated = config.value.rules.map((item) => {
    if (item.id !== rule.id) return item
    const next = { ...item }
    if (pinned) next.pinned = true
    else delete next.pinned
    return next
  })
  const nextRules = orderPinnedRules(updated)
  if (await persistConfig({ ...config.value, rules: [...nextRules] })) {
    await revealRule(rule.id)
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

async function deleteSelectedRules() {
  const selected = new Set(selectedRuleIds.value)
  if (
    selected.size === 0 ||
    !window.confirm(t('rules.confirmDeleteSelected', { count: selected.size }))
  )
    return
  const nextRules = config.value.rules.filter((rule) => !selected.has(rule.id))
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
  if (await persistConfig(validation.data)) await closeBackupDialog()
}

async function duplicateRule(rule) {
  const current = config.value
  const sourceIndex = current.rules.findIndex((item) => item.id === rule.id)
  if (sourceIndex < 0) return
  const duplicate = structuredClone(toRaw(rule))
  duplicate.id = createRuleId(current.rules)
  duplicate.enabled = false
  if (duplicate.title) {
    const suffix = t('rules.duplicateTitleSuffix')
    duplicate.title = `${duplicate.title.slice(0, 120 - suffix.length)}${suffix}`
  }
  const nextRules = ruleOperations.insertV3Rule(current.rules, duplicate, sourceIndex + 1)
  if (nextRules !== current.rules) await persistConfig({ ...current, rules: [...nextRules] })
}

async function moveRule(rule, targetRule) {
  if (!targetRule || search.value.trim() || ruleFiltersActive.value) return
  if (Boolean(rule.pinned) !== Boolean(targetRule.pinned)) return
  const targetIndex = orderedRules.value.findIndex((item) => item.id === targetRule.id)
  const nextRules = ruleOperations.moveV3Rule(orderedRules.value, rule.id, targetIndex)
  if (nextRules !== config.value.rules) {
    await persistConfig({ ...config.value, rules: [...orderPinnedRules(nextRules)] })
  }
}

function neighborRule(rule, direction) {
  const index = viewOrderedRules.value.findIndex((item) => item.id === rule.id)
  const neighbor = viewOrderedRules.value[index + direction]
  return Boolean(neighbor) && Boolean(neighbor.pinned) === Boolean(rule.pinned) ? neighbor : null
}

function editRuleAction(rule, action) {
  if (action === 'redirect') showEditor(rule)
  else showResponseEditor(rule)
}

async function deleteRule(rule) {
  if (!window.confirm(t('editor.confirmDelete', { url: ruleDisplayName(rule) }))) return
  const nextRules = ruleOperations.deleteV3Rule(config.value.rules, rule.id)
  await persistConfig({ ...config.value, rules: [...nextRules] })
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
            <strong>{{ currentSiteOrigin || t('site.unavailable') }}</strong>
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
          <label class="theme-control">
            <span>{{ t('theme.label') }}</span>
            <select
              :value="themeMode"
              :aria-label="t('theme.label')"
              @change="setThemeMode($event.target.value)"
            >
              <option value="system">{{ t('theme.system') }}</option>
              <option value="light">{{ t('theme.light') }}</option>
              <option value="dark">{{ t('theme.dark') }}</option>
            </select>
          </label>
          <div class="language-toggle" role="group" :aria-label="t('language.aria')">
            <button
              v-for="item in supportedLocales"
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
          <nav :aria-label="t('workspace.title')">
            <button
              type="button"
              class="nav-item"
              :class="{ selected: section === 'response' }"
              :aria-current="section === 'response' ? 'page' : undefined"
              @click="section = 'response'"
            >
              <span class="nav-icon intercept-icon">⇄</span>
              <span>{{ t('workspace.responseRules') }}</span>
              <span class="nav-count">{{ responseRuleCount }}</span>
            </button>
            <button
              type="button"
              class="nav-item"
              :class="{ selected: section === 'redirect' }"
              :aria-current="section === 'redirect' ? 'page' : undefined"
              @click="section = 'redirect'"
            >
              <span class="nav-icon redirect-icon">↗</span>
              <span>{{ t('workspace.redirectRules') }}</span>
              <span class="nav-count">{{ redirectRuleCount }}</span>
            </button>
          </nav>
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
                {{ t('rules.eyebrow') }}
              </div>
              <h1>
                {{
                  section === 'response'
                    ? t('workspace.responseRules')
                    : t('workspace.redirectRules')
                }}
              </h1>
              <p>{{ t('rules.description') }}</p>
            </div>
            <AppButton
              class="create-rule-button"
              :label="t('rules.create')"
              :pt="comparePassThrough ? passThroughCreateButton : undefined"
              :disabled="loading || saving"
              @click="createRule"
            />
          </div>

          <div class="toolbar">
            <label ref="searchBox" class="search-box">
              <span class="search-glyph">⌕</span>
              <InputText v-model="search" :placeholder="t('rules.searchPlaceholder')" />
              <kbd>{{ t('rules.searchShortcut') }}</kbd>
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
            <AppButton
              :label="pinnedOnly ? t('rules.showAllRules') : t('rules.showPinnedRules')"
              severity="secondary"
              outlined
              :aria-pressed="pinnedOnly"
              @click="pinnedOnly = !pinnedOnly"
            />
            <AppButton
              :label="t('rules.clearAllHits')"
              severity="secondary"
              outlined
              :disabled="loading || saving || clearingHitCounters || !hasHitCounters || memoryOnly"
              @click="clearHitCounters({ scope: 'all' })"
            />
            <AppButton
              :label="t('diagnostics.open')"
              severity="secondary"
              outlined
              :aria-expanded="ruleDiagnosticsOpen"
              :disabled="loading"
              @click="toggleRuleDiagnostics"
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
                @click="toggleRuleTagFilter"
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
            <div ref="ruleFilterControl" class="filter-control">
              <AppButton
                :label="t('rules.filter')"
                severity="secondary"
                outlined
                :aria-expanded="ruleFiltersOpen"
                @click="toggleRuleFilters"
                @keydown.esc.stop.prevent="closeRuleFilters"
              />
              <RuleFilterPopover
                :open="ruleFiltersOpen"
                :status="ruleStatusFilter"
                :match-type="ruleMatchTypeFilter"
                @close="closeRuleFilters"
                @update:status="ruleStatusFilter = $event"
                @update:match-type="ruleMatchTypeFilter = $event"
                @clear="clearRuleFilters"
              />
            </div>
            <div class="toolbar-spacer" />
            <span class="result-count">{{ loading ? t('editor.loading') : resultCount }}</span>
            <label class="page-size-control">
              <span>{{ t('rules.pageSize') }}</span>
              <select v-model.number="pageSize" :aria-label="t('rules.pageSize')">
                <option :value="20">20</option>
                <option :value="50">50</option>
                <option :value="100">100</option>
              </select>
            </label>
            <AppButton
              :label="t('site.manage')"
              severity="secondary"
              text
              :disabled="loading || saving"
              @click="openSiteSwitchesDialog"
            />
            <AppButton
              :label="t('ruleTemplates.open')"
              severity="secondary"
              text
              :disabled="loading || saving"
              @click="openRuleTemplatesDialog"
            />
            <AppButton
              :label="t('rules.backup')"
              severity="secondary"
              text
              :disabled="loading || saving"
              @click="openBackupDialog"
            />
          </div>

          <div v-if="operationError" class="operation-alert" role="alert">
            {{ operationError }}
            <AppButton
              v-if="configConflict"
              :label="t('editor.loadLatest')"
              severity="secondary"
              outlined
              :disabled="saving"
              @click="loadLatestConfig"
            />
          </div>
          <div v-if="requestedEditNotice" class="operation-alert" role="alert">
            {{ requestedEditNotice }}
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
              :label="t('rules.deleteSelected')"
              severity="danger"
              outlined
              :disabled="saving || loading"
              @click="deleteSelectedRules"
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

          <section v-if="ruleDiagnosticsOpen" class="rule-diagnostics">
            <header>
              <h2>{{ t('diagnostics.title') }}</h2>
              <p>{{ t('diagnostics.description') }}</p>
            </header>
            <form class="diagnostic-form" @submit.prevent="runRuleDiagnostics">
              <label>
                <span>{{ t('diagnostics.urlLabel') }}</span>
                <input
                  v-model="diagnosticUrl"
                  data-testid="diagnostic-url-input"
                  type="text"
                  maxlength="8192"
                  autocomplete="off"
                  @input="diagnosticResult = null"
                />
              </label>
              <label>
                <span>{{ t('diagnostics.methodLabel') }}</span>
                <select
                  v-model="diagnosticMethod"
                  data-testid="diagnostic-method-select"
                  @change="diagnosticResult = null"
                >
                  <option
                    v-for="method in ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']"
                    :key="method"
                  >
                    {{ method }}
                  </option>
                </select>
              </label>
              <AppButton
                type="submit"
                :label="t('diagnostics.analyze')"
                severity="secondary"
                outlined
                :disabled="!diagnosticUrl.trim() || loading"
              />
            </form>
            <template v-if="diagnosticResult">
              <p class="diagnostic-summary" role="status">
                {{
                  diagnosticResult.selectedRuleId
                    ? t('diagnostics.firstMatch', {
                        id: diagnosticResult.selectedRuleId,
                        title: ruleDisplayNameById(diagnosticResult.selectedRuleId),
                      })
                    : t('diagnostics.noMatch')
                }}
              </p>
              <ol v-if="diagnosticResult.results.length" class="diagnostic-results">
                <li
                  v-for="result in diagnosticResult.results"
                  :key="result.ruleId"
                  :class="{ matched: result.reason === 'matched' }"
                >
                  <span>{{ t(`diagnostics.reasons.${result.reason}`) }}</span>
                  <code>
                    {{
                      t('diagnostics.ruleSummary', {
                        index: result.index + 1,
                        id: result.ruleId,
                        title: ruleDisplayNameById(result.ruleId),
                        url:
                          config.rules.find((rule) => rule?.id === result.ruleId)?.match?.url ?? '',
                      })
                    }}
                  </code>
                </li>
              </ol>
              <p v-else class="diagnostic-summary">{{ t('diagnostics.noRules') }}</p>
            </template>
          </section>

          <section class="recent-matches no-match-diagnostics" aria-live="polite">
            <header class="recent-matches-heading">
              <strong>{{ t('diagnostics.noMatchCapture.title') }}</strong>
              <small>{{ t('diagnostics.noMatchCapture.description') }}</small>
            </header>
            <button
              type="button"
              :aria-pressed="noMatchCaptureArmed"
              :disabled="memoryOnly || loading"
              @click="setNoMatchCapture(!noMatchCaptureArmed)"
            >
              {{
                t(
                  noMatchCaptureArmed
                    ? 'diagnostics.noMatchCapture.waiting'
                    : 'diagnostics.noMatchCapture.capture'
                )
              }}
            </button>
            <p v-if="!recentNoMatches.length" class="diagnostic-summary">
              {{ t('diagnostics.noMatchCapture.empty') }}
            </p>
            <ol v-else class="recent-matches-list">
              <li v-for="(event, index) in recentNoMatches" :key="`${event.receivedAt}-${index}`">
                <div class="recent-match-copy">
                  <code>{{ event.method }}</code>
                  <small v-if="event.rules.length">
                    <span
                      v-for="(rule, ruleIndex) in event.rules"
                      :key="`${rule.rule_id}-${ruleIndex}`"
                    >
                      <code>{{ ruleDisplayNameById(rule.rule_id) }}</code>
                      <span v-if="ruleTitleById(rule.rule_id)" class="rule-diagnostic-id"
                        >({{ rule.rule_id }})</span
                      >
                      <span>: {{ t(`diagnostics.reasons.${rule.reason}`) }}</span>
                      <span v-if="ruleIndex < event.rules.length - 1"> · </span>
                    </span>
                  </small>
                  <small v-else>{{ t('diagnostics.noMatchCapture.noRules') }}</small>
                  <small v-if="event.truncated">
                    {{ t('diagnostics.noMatchCapture.truncated') }}
                  </small>
                </div>
                <time :datetime="new Date(event.receivedAt).toISOString()">{{
                  formatMatchTime(event.receivedAt)
                }}</time>
              </li>
            </ol>
          </section>

          <section class="recent-matches fetch-outcome-diagnostics" aria-live="polite">
            <header class="recent-matches-heading">
              <strong>{{ t('diagnostics.actionOutcomes.title') }}</strong>
              <small>{{ t('diagnostics.actionOutcomes.description') }}</small>
            </header>
            <button
              type="button"
              :aria-pressed="fetchOutcomeCaptureArmed"
              :disabled="memoryOnly || loading"
              @click="setFetchOutcomeCapture(!fetchOutcomeCaptureArmed)"
            >
              {{
                t(
                  fetchOutcomeCaptureArmed
                    ? 'diagnostics.actionOutcomes.waiting'
                    : 'diagnostics.actionOutcomes.capture'
                )
              }}
            </button>
            <p v-if="!recentFetchOutcomes.length" class="diagnostic-summary">
              {{ t('diagnostics.actionOutcomes.empty') }}
            </p>
            <ol v-else class="recent-matches-list">
              <li
                v-for="(event, index) in recentFetchOutcomes"
                :key="`${event.correlation_id}-${event.stage}-${index}`"
              >
                <div class="recent-match-copy">
                  <code>{{ ruleDisplayNameById(event.rule_id) }}</code>
                  <small v-if="ruleTitleById(event.rule_id)" class="rule-diagnostic-id"
                    >({{ event.rule_id }})</small
                  >
                  <small>
                    {{ event.kind === 'v3-xhr-outcome' ? 'XHR' : 'Fetch' }} ·
                    {{ t(`diagnostics.outcomes.stage.${event.stage}`) }} ·
                    {{ t(`diagnostics.outcomes.status.${event.outcome}`) }} ·
                    {{ t(`diagnostics.outcomes.reason.${event.reason}`) }}
                  </small>
                  <small
                    v-if="event.reason === 'mock-network-skipped' && event.stage === 'request'"
                    class="mock-outcome-notice"
                  >
                    <strong>{{ t('diagnostics.mockResponse.label') }}</strong>
                    {{ t('diagnostics.mockResponse.networkSkipped') }} ·
                    {{
                      t('diagnostics.mockResponse.httpStatus', {
                        status:
                          config.rules.find((rule) => rule.id === event.rule_id)?.response?.replace
                            ?.status ?? 200,
                      })
                    }}
                  </small>
                  <small>
                    {{ t('diagnostics.actionOutcomes.correlationId') }}:
                    <code>{{ event.correlation_id.slice(-16) }}</code>
                  </small>
                </div>
                <time :datetime="new Date(event.receivedAt).toISOString()">
                  {{ formatMatchTime(event.receivedAt) }}
                </time>
              </li>
            </ol>
          </section>

          <section
            v-if="recentMatches.length"
            class="recent-matches"
            :aria-label="t('rules.recentMatches')"
          >
            <header class="recent-matches-heading">
              <strong>{{ t('rules.recentMatches') }}</strong>
              <small>{{ t('rules.recentMatchesScope') }}</small>
            </header>
            <ol class="recent-matches-list">
              <li v-for="match in recentMatches" :key="`${match.rule_id}-${match.count}`">
                <div class="recent-match-copy">
                  <code>{{
                    t('rules.matchedRequest', { method: match.method, url: match.url })
                  }}</code>
                  <small v-if="ruleTitleById(match.rule_id)">{{
                    t('rules.ruleTitle', { title: ruleTitleById(match.rule_id) })
                  }}</small>
                  <small>{{ t('rules.matchCondition', { url: match.match_url }) }}</small>
                  <small
                    v-if="match.response_mode === 'mock' && match.network_skipped === true"
                    class="mock-hit-notice"
                  >
                    <strong>{{ t('diagnostics.mockResponse.label') }}</strong>
                    {{ t('diagnostics.mockResponse.networkSkipped') }} ·
                    {{ t('diagnostics.mockResponse.httpStatus', { status: match.status }) }}
                  </small>
                </div>
                <time :datetime="new Date(match.receivedAt).toISOString()">
                  {{ formatMatchTime(match.receivedAt) }}
                </time>
                <div class="recent-match-actions">
                  <button
                    type="button"
                    :aria-label="
                      t('rules.createResponseFromMatchLabel', {
                        method: match.method,
                        url: match.url,
                      })
                    "
                    @click="createRuleFromMatch(match, 'response')"
                  >
                    {{ t('rules.createResponseFromMatch') }}
                  </button>
                  <button
                    type="button"
                    :aria-label="
                      t('rules.createRedirectFromMatchLabel', {
                        method: match.method,
                        url: match.url,
                      })
                    "
                    @click="createRuleFromMatch(match, 'redirect')"
                  >
                    {{ t('rules.createRedirectFromMatch') }}
                  </button>
                </div>
              </li>
            </ol>
          </section>

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
                <strong>
                  <span>{{ functionErrorActionLabel(failure) }}：</span>
                  {{ t(`functionFailure.${failure.code}`) }}
                </strong>
                <small>{{
                  t('rules.functionErrorRule', { method: failure.method, url: failure.match_url })
                }}</small>
                <small v-if="ruleTitleById(failure.rule_id)">{{
                  t('rules.ruleTitle', { title: ruleTitleById(failure.rule_id) })
                }}</small>
              </li>
            </ul>
          </section>

          <div v-if="visibleRules.length" class="rule-list">
            <article
              v-for="rule in visibleRules"
              :key="rule.id"
              class="rule-row"
              :data-rule-id="rule.id"
            >
              <label class="rule-selection">
                <input
                  type="checkbox"
                  :checked="selectedRuleIds.includes(rule.id)"
                  :aria-label="t('rules.selectRule', { name: ruleDisplayName(rule), id: rule.id })"
                  :disabled="saving || loading"
                  @change="setRuleSelected(rule.id, $event.target.checked)"
                />
              </label>
              <div class="rule-order">
                {{
                  String(orderedRules.findIndex((item) => item.id === rule.id) + 1).padStart(2, '0')
                }}
              </div>
              <ToggleSwitch
                :model-value="rule.enabled"
                :aria-label="t('rules.enableAria', { name: ruleDisplayName(rule) })"
                :disabled="saving || loading"
                @update:modelValue="setRuleEnabled(rule.id, $event)"
              />
              <div class="rule-main">
                <div class="rule-title-line">
                  <div class="rule-heading-copy">
                    <strong v-if="rule.title" class="rule-display-title">{{ rule.title }}</strong>
                    <code :title="rule.match.url">{{ rule.match.url }}</code>
                  </div>
                  <AppTag :value="rule.match.method ?? 'ANY'" severity="secondary" />
                  <AppTag
                    :value="
                      rule.match.type === 'regex'
                        ? t('rules.regex')
                        : rule.match.type === 'exact'
                          ? t('rules.exact')
                          : t('rules.contains')
                    "
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
                      rule.request.redirect.type === 'function'
                        ? t('rules.redirectFunctionTarget')
                        : t('rules.redirectTarget', { url: rule.request.redirect.url })
                    }}</span>
                  </template>
                </div>
              </div>
              <div class="hit-count">
                <strong>{{ formatHitCount(hitCounters[rule.id] ?? 0) }}</strong>
                <span>{{ t('rules.hits') }}</span>
              </div>
              <div class="rule-actions">
                <button
                  type="button"
                  :aria-label="t('rules.clearHitForRule', { name: ruleDisplayName(rule) })"
                  :title="t('rules.clearHit')"
                  :disabled="
                    saving ||
                    loading ||
                    clearingHitCounters ||
                    memoryOnly ||
                    !(hitCounters[rule.id] > 0)
                  "
                  @click="clearHitCounters({ scope: 'rule', ruleId: rule.id })"
                >
                  {{ t('rules.clearHit') }}
                </button>
                <button
                  type="button"
                  :aria-label="
                    rule.pinned
                      ? t('rules.unpin', { name: ruleDisplayName(rule) })
                      : t('rules.pin', { name: ruleDisplayName(rule) })
                  "
                  :aria-pressed="Boolean(rule.pinned)"
                  :title="rule.pinned ? t('rules.unpinShort') : t('rules.pinShort')"
                  :disabled="saving || loading"
                  @click="setRulePinned(rule, !rule.pinned)"
                >
                  {{ rule.pinned ? '★' : '☆' }}
                </button>
                <button
                  type="button"
                  :aria-label="t('editor.moveUp', { url: ruleDisplayName(rule) })"
                  :disabled="
                    !neighborRule(rule, -1) || saving || Boolean(search.trim()) || ruleFiltersActive
                  "
                  :title="
                    search.trim() || ruleFiltersActive ? t('rules.clearSearchToReorder') : undefined
                  "
                  @click="moveRule(rule, neighborRule(rule, -1))"
                >
                  ↑
                </button>
                <button
                  type="button"
                  :aria-label="t('editor.moveDown', { url: ruleDisplayName(rule) })"
                  :disabled="
                    !neighborRule(rule, 1) || saving || Boolean(search.trim()) || ruleFiltersActive
                  "
                  :title="
                    search.trim() || ruleFiltersActive ? t('rules.clearSearchToReorder') : undefined
                  "
                  @click="moveRule(rule, neighborRule(rule, 1))"
                >
                  ↓
                </button>
                <button type="button" :disabled="saving || loading" @click="duplicateRule(rule)">
                  {{ t('editor.duplicate') }}
                </button>
                <button
                  v-if="rule.response"
                  type="button"
                  :disabled="saving"
                  @click="editRuleAction(rule, 'response')"
                >
                  {{ rule.request ? t('rules.editResponse') : t('editor.edit') }}
                </button>
                <button
                  v-if="rule.request"
                  type="button"
                  :disabled="saving"
                  @click="editRuleAction(rule, 'redirect')"
                >
                  {{ rule.response ? t('rules.editRedirect') : t('editor.edit') }}
                </button>
                <button type="button" :disabled="saving" @click="deleteRule(rule)">
                  {{ t('editor.delete') }}
                </button>
              </div>
            </article>
          </div>

          <nav v-if="pageCount > 1" class="pagination" :aria-label="t('rules.pagination')">
            <AppButton
              :label="t('rules.previousPage')"
              severity="secondary"
              outlined
              :disabled="currentPage <= 1"
              @click="currentPage--"
            />
            <span>{{ t('rules.pageIndicator', { current: currentPage, total: pageCount }) }}</span>
            <AppButton
              :label="t('rules.nextPage')"
              severity="secondary"
              outlined
              :disabled="currentPage >= pageCount"
              @click="currentPage++"
            />
          </nav>

          <div v-else-if="!visibleRules.length" class="empty-state">
            <div class="empty-illustration">⌕</div>
            <h2>
              {{
                search || ruleFiltersActive
                  ? t('rules.noSearchResults')
                  : rules.length
                    ? t('rules.noRulesInView')
                    : t('rules.noRules')
              }}
            </h2>
            <p>
              {{
                search || ruleFiltersActive
                  ? t('rules.searchHint')
                  : rules.length
                    ? t('rules.noRulesInViewHint')
                    : t('rules.createHint')
              }}
            </p>
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
        </section>
      </section>
    </main>
    <RedirectRuleEditor
      :open="editorOpen"
      :rule="editingRule"
      :tags="config.tags"
      :saving="saving"
      :issue="editorIssue"
      @close="closeQuickRedirectEditor"
      @save="saveRedirectRule"
    />
    <ResponseRuleEditor
      :open="responseEditorOpen"
      :rule="editingResponseRule"
      :tags="config.tags"
      :saving="saving"
      :issue="responseEditorIssue"
      @close="closeQuickResponseEditor"
      @save="saveResponseRule"
    />
    <BackupRestoreDialog
      :open="backupDialogOpen"
      :backup="config"
      :saving="saving"
      :issue="operationError"
      @close="closeBackupDialog"
      @restore="restoreBackup"
      @import-rules="importRules"
    />
    <RuleTemplatesDialog
      :open="ruleTemplatesDialogOpen"
      :saving="saving"
      :issue="operationError"
      @close="closeRuleTemplatesDialog"
      @apply="addRuleTemplate"
    />
    <SiteSwitchesDialog
      :open="siteSwitchesDialogOpen"
      :disabled-origins="disabledOrigins"
      :current-origin="currentSiteOrigin"
      :saving="saving"
      :issue="operationError"
      @close="closeSiteSwitchesDialog"
      @disable="disableSiteOrigin"
      @enable="enableSiteOrigin"
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
