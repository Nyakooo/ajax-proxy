<script setup>
/* eslint vue/max-attributes-per-line: off, vue/html-self-closing: off, vue/html-closing-bracket-newline: off, vue/html-indent: off */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  V3_BACKUP_VERSION,
  deleteV3Rule,
  orderPinnedRules,
  setV3RuleEnabled,
  matchesRuleSearch,
} from '@proxy/v3-domain'
import { createV3ConfigService } from './services/v3Config.js'
import { useThemePreference } from './services/useThemePreference.js'
import lightMark from '../../shell-chrome/icons/128.png'
import darkMark from '../../../docs/brand/ajax-proxy-mark-dark.png'

defineOptions({ name: 'AjaxProxyRulesPopup' })

const props = defineProps({ service: { type: Object, default: null } })

const messages = {
  en: {
    global: 'Enable Ajax Proxy',
    search: 'Search rules',
    searchHelp: 'Words match together. Try method:GET type:redirect status:enabled pinned:true',
    theme: 'Theme',
    themeSystem: 'System',
    themeLight: 'Light',
    themeDark: 'Dark',
    actionFilter: 'Rule type',
    allActions: 'All',
    pinnedOnly: 'Pinned only',
    openPanel: 'Open full panel',
    openInTab: 'Open in tab',
    shortcuts: 'Keyboard shortcuts',
    loading: 'Loading rules…',
    loadError: 'Could not load rules. Try reopening this popup.',
    empty: 'No rules yet',
    noMatches: 'No matching rules',
    redirect: 'Redirect',
    response: 'Response',
    enabled: 'On',
    disabled: 'Off',
    pinned: 'Pinned',
    pin: 'Pin rule',
    unpin: 'Unpin rule',
    edit: 'Edit rule',
    remove: 'Delete rule',
    confirmDelete: 'Delete this rule?',
    cancel: 'Cancel',
    confirm: 'Delete',
    saveError: 'Could not save this change. Your rules are unchanged.',
    conflict: 'Rules changed elsewhere. Showing the latest version; try your change again.',
    refreshError: 'Could not refresh rules. Try reopening this popup.',
    openError: 'Could not open the full panel.',
    openErrorNoReply:
      'The extension background did not respond. Reload the extension and try again.',
    hit: 'hits',
    any: 'ANY',
    helpLabel: 'Search examples',
    rulesLabel: 'Rules',
    tags: 'Tags',
  },
  'zh-CN': {
    global: '启用 Ajax Proxy',
    search: '搜索规则',
    searchHelp: '多个词同时匹配。试试 method:GET type:redirect status:enabled pinned:true',
    theme: '主题',
    themeSystem: '跟随系统',
    themeLight: '浅色',
    themeDark: '深色',
    actionFilter: '规则类型',
    allActions: '全部',
    pinnedOnly: '只看置顶',
    openPanel: '打开大面板',
    openInTab: '在标签页打开',
    shortcuts: '设置快捷键',
    loading: '正在加载规则…',
    loadError: '无法加载规则，请重新打开此弹窗。',
    empty: '还没有规则',
    noMatches: '没有匹配的规则',
    redirect: '重定向',
    response: '响应',
    enabled: '已启用',
    disabled: '已停用',
    pinned: '置顶',
    pin: '置顶规则',
    unpin: '取消置顶',
    edit: '编辑规则',
    remove: '删除规则',
    confirmDelete: '确定删除此规则？',
    cancel: '取消',
    confirm: '删除',
    saveError: '保存失败，规则没有更改。',
    conflict: '规则已在其他位置更改，已显示最新版本；请重新操作。',
    refreshError: '无法刷新规则，请重新打开此弹窗。',
    openError: '无法打开大面板。',
    openErrorNoReply: '扩展后台没有响应，请在扩展管理页重新加载后再试。',
    hit: '次命中',
    any: '任意',
    helpLabel: '搜索示例',
    rulesLabel: '规则',
    tags: '标签',
  },
}

const service = props.service ?? createV3ConfigService()
const { themeMode, darkMode, setThemeMode } = useThemePreference()
const config = ref(null)
const revision = ref('')
const hitCounters = ref({})
const query = ref('')
const pinnedOnly = ref(false)
const actionFilter = ref('all')
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const panelOpenDetails = ref('')
const pendingDelete = ref('')
let removeMessageListener
let removeStorageListener
let refreshRequested = false

const language = computed(() => (config.value?.settings?.language === 'en' ? 'en' : 'zh-CN'))
const t = (key) => messages[language.value][key] ?? messages.en[key] ?? key
const isEdge = typeof navigator !== 'undefined' && /edg\//i.test(navigator.userAgent)
const activeMark = computed(() => (darkMode.value ? darkMark : lightMark))
const shownRules = computed(() => {
  if (!config.value) return []
  const tags = config.value.tags ?? []
  return orderPinnedRules(config.value.rules).filter((rule) => {
    const matchesAction =
      actionFilter.value === 'all' ||
      (actionFilter.value === 'redirect' ? Boolean(rule.request) : Boolean(rule.response))
    return (
      matchesAction &&
      (!pinnedOnly.value || rule.pinned === true) &&
      matchesRuleSearch(rule, query.value, tags)
    )
  })
})

function blankConfig() {
  return {
    format: 'ajax-proxy-backup',
    formatVersion: V3_BACKUP_VERSION,
    settings: { globalEnabled: true, mode: 'interceptor', language: 'zh-CN' },
    tags: [],
    rules: [],
    disabledOrigins: [],
  }
}

async function refreshSnapshot({ preserveError = false } = {}) {
  const result = await service.getSnapshot()
  if (!result.ok) {
    error.value = config.value ? 'refreshError' : 'loadError'
    return false
  }
  const snapshot = result.snapshot
  config.value = snapshot.config
    ? {
        ...snapshot.config,
        formatVersion: V3_BACKUP_VERSION,
        disabledOrigins: snapshot.config.disabledOrigins ?? [],
      }
    : blankConfig()
  revision.value = snapshot.revision
  hitCounters.value = snapshot.hitCounters
  if (!preserveError) error.value = ''
  return true
}

function onExternalChange(message) {
  if (message?.key === 'ajax-proxy:notice:v3-config') {
    if (saving.value) refreshRequested = true
    else void refreshSnapshot()
  }
}

async function save(nextConfig) {
  if (saving.value || !config.value) return
  saving.value = true
  error.value = ''
  const result = await service.saveConfig(
    { ...nextConfig, formatVersion: V3_BACKUP_VERSION },
    revision.value
  )
  if (result.ok) {
    revision.value = result.revision
    config.value = { ...nextConfig, formatVersion: V3_BACKUP_VERSION }
  } else if (result.error === 'config-conflict') {
    await refreshSnapshot({ preserveError: true })
    error.value = 'conflict'
  } else {
    error.value = 'saveError'
  }
  saving.value = false
  if (refreshRequested) {
    refreshRequested = false
    await refreshSnapshot({ preserveError: true })
  }
  return result.ok
}

async function changeGlobal(enabled, event) {
  if (!config.value || enabled === config.value.settings.globalEnabled) return
  const control = event?.target
  const saved = await save({
    ...config.value,
    settings: { ...config.value.settings, globalEnabled: enabled },
  })
  if (!saved && control) control.checked = config.value.settings.globalEnabled
}

function changeRule(id, update) {
  const rules = config.value.rules.map((rule) => (rule.id === id ? update(rule) : rule))
  void save({ ...config.value, rules: orderPinnedRules(rules) })
}

async function toggleRule(rule, event) {
  const rules = setV3RuleEnabled(config.value.rules, rule.id, !rule.enabled)
  const control = event?.target
  const saved = await save({ ...config.value, rules })
  if (!saved && control) control.checked = rule.enabled
}

function togglePinned(rule) {
  changeRule(rule.id, (current) => ({ ...current, pinned: current.pinned !== true }))
}

function deleteRule(rule) {
  if (pendingDelete.value !== rule.id) {
    pendingDelete.value = rule.id
    return
  }
  const rules = deleteV3Rule(config.value.rules, rule.id)
  pendingDelete.value = ''
  void save({ ...config.value, rules })
}

function actionNames(rule) {
  const result = []
  if (rule.request) result.push(t('redirect'))
  if (rule.response) result.push(t('response'))
  return result.length ? result : [t('response')]
}

function ruleTags(rule) {
  const ids = new Set(rule.tagIds ?? [])
  return (config.value?.tags ?? []).filter((tag) => ids.has(tag.id)).map((tag) => tag.name)
}

async function sendOpenPanel(message) {
  const runtime = globalThis.chrome?.runtime
  panelOpenDetails.value = ''
  if (typeof runtime?.sendMessage !== 'function') {
    error.value = 'openError'
    return
  }
  try {
    const result = await runtime.sendMessage(message)
    if (result?.ok !== true) {
      error.value = result ? 'openError' : 'openErrorNoReply'
      if (typeof result?.details === 'string') panelOpenDetails.value = result.details
    }
  } catch {
    error.value = 'openError'
  }
}

function openEditor(rule) {
  const action =
    actionFilter.value !== 'all' ? actionFilter.value : rule.response ? 'response' : 'redirect'
  return sendOpenPanel({
    type: 'ajax-proxy:open-panel',
    ruleId: rule.id,
    action,
    ...currentScreenBounds(),
  })
}

function currentScreenBounds() {
  const display = globalThis.screen
  if (!display) return {}
  const values = [
    display.availLeft ?? 0,
    display.availTop ?? 0,
    display.availWidth,
    display.availHeight,
  ]
  if (!values.every((value) => Number.isFinite(value))) return {}
  const [left, top, width, height] = values.map(Math.round)
  if (
    !Number.isInteger(left) ||
    !Number.isInteger(top) ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    left < -50000 ||
    left > 50000 ||
    top < -50000 ||
    top > 50000 ||
    width < 400 ||
    width > 20000 ||
    height < 300 ||
    height > 20000
  )
    return {}
  return { screen: { left, top, width, height } }
}

function openPanel() {
  return sendOpenPanel({ type: 'ajax-proxy:open-panel', ...currentScreenBounds() })
}

function openPanelInTab() {
  return sendOpenPanel({ type: 'ajax-proxy:open-panel', target: 'tab' })
}

async function openShortcuts() {
  const url = isEdge ? 'edge://extensions/shortcuts' : 'chrome://extensions/shortcuts'
  try {
    const createTab = globalThis.chrome?.tabs?.create
    if (typeof createTab !== 'function') {
      error.value = 'openError'
      return
    }
    await createTab.call(globalThis.chrome.tabs, { url })
  } catch {
    error.value = 'openError'
  }
}

onMounted(async () => {
  try {
    removeMessageListener = service.subscribe(onExternalChange)
    const storage = globalThis.chrome?.storage?.onChanged
    const handleStorageChange = (changes, area) => {
      if (
        area !== 'local' ||
        (!changes['ajax-proxy:storage:v3-config'] && !changes['ajax-proxy:storage:v3-hits'])
      )
        return
      if (saving.value) refreshRequested = true
      else void refreshSnapshot()
    }
    storage?.addListener?.(handleStorageChange)
    removeStorageListener = () => storage?.removeListener?.(handleStorageChange)
    await refreshSnapshot()
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => {
  removeMessageListener?.()
  removeStorageListener?.()
})
</script>

<template>
  <main class="popup" :class="{ 'popup-dark': darkMode }" :lang="language">
    <header class="popup-header">
      <div class="brand-row">
        <img :src="activeMark" alt="Ajax Proxy" class="brand-mark" />
        <strong>Ajax Proxy</strong>
        <label class="theme-select">
          <span class="sr-only">{{ t('theme') }}</span>
          <select
            :value="themeMode"
            :aria-label="t('theme')"
            @change="setThemeMode($event.target.value)"
          >
            <option value="system">{{ t('themeSystem') }}</option>
            <option value="light">{{ t('themeLight') }}</option>
            <option value="dark">{{ t('themeDark') }}</option>
          </select>
        </label>
        <label class="global-switch">
          <span>{{ t('global') }}</span>
          <input
            type="checkbox"
            :checked="config?.settings.globalEnabled"
            :disabled="loading || saving || !config"
            @change="changeGlobal($event.target.checked, $event)"
          />
          <span class="switch-track" aria-hidden="true" />
        </label>
      </div>
      <label class="search-field">
        <span class="search-icon" aria-hidden="true">⌕</span>
        <input v-model="query" type="search" :placeholder="t('search')" :aria-label="t('search')" />
      </label>
      <div class="search-options">
        <label class="pinned-filter"
          ><input v-model="pinnedOnly" type="checkbox" /> <span>{{ t('pinnedOnly') }}</span></label
        >
        <label class="action-filter">
          <span>{{ t('actionFilter') }}</span>
          <select v-model="actionFilter" :aria-label="t('actionFilter')">
            <option value="all">{{ t('allActions') }}</option>
            <option value="response">{{ t('response') }}</option>
            <option value="redirect">{{ t('redirect') }}</option>
          </select>
        </label>
        <details class="search-help">
          <summary>{{ t('helpLabel') }}</summary>
          <span>{{ t('searchHelp') }}</span>
        </details>
      </div>
    </header>

    <section class="rule-scroll" :aria-label="t('rulesLabel')">
      <p v-if="error" class="popup-error" role="alert">
        <span>{{ t(error) }}</span>
        <span v-if="panelOpenDetails"> {{ panelOpenDetails }}</span>
      </p>
      <p v-if="loading" class="empty-state">
        {{ t('loading') }}
      </p>
      <p v-else-if="shownRules.length === 0" class="empty-state">
        {{ query || pinnedOnly ? t('noMatches') : t('empty') }}
      </p>
      <article
        v-for="rule in shownRules"
        :key="rule.id"
        class="rule-card"
        :class="{ 'rule-card-disabled': !rule.enabled }"
      >
        <div class="rule-primary">
          <div class="rule-summary">
            <div class="rule-title-row">
              <span class="rule-actions">{{ actionNames(rule).join(' + ') }}</span>
              <span v-if="rule.pinned" class="pin-badge">★ {{ t('pinned') }}</span>
            </div>
            <p class="rule-match">
              <b>{{ rule.match.method || t('any') }}</b
              ><span class="match-separator">·</span
              ><span class="rule-url" :title="rule.match.url">{{ rule.match.url }}</span>
            </p>
            <div v-if="ruleTags(rule).length" class="rule-tags" :aria-label="t('tags')">
              <span v-for="tag in ruleTags(rule)" :key="tag" class="rule-tag">{{ tag }}</span>
            </div>
            <small class="hit-count"
              >{{ new Intl.NumberFormat(language).format(hitCounters[rule.id] ?? 0) }}
              {{ t('hit') }}</small
            >
          </div>
          <div class="rule-controls">
            <label
              class="rule-switch"
              :aria-label="`${rule.enabled ? t('enabled') : t('disabled')}: ${rule.match.url}`"
            >
              <input
                type="checkbox"
                :checked="rule.enabled"
                :disabled="saving"
                @change="toggleRule(rule, $event)"
              />
              <span class="switch-track" aria-hidden="true" />
            </label>
            <button
              class="icon-button"
              type="button"
              :aria-label="t(rule.pinned ? 'unpin' : 'pin')"
              :title="t(rule.pinned ? 'unpin' : 'pin')"
              :disabled="saving"
              @click="togglePinned(rule)"
            >
              ★
            </button>
            <button
              class="icon-button"
              type="button"
              :aria-label="`${t('edit')}: ${rule.match.url}`"
              :title="t('edit')"
              @click="openEditor(rule)"
            >
              ✎
            </button>
            <button
              class="icon-button delete-button"
              type="button"
              :aria-label="`${t('remove')}: ${rule.match.url}`"
              :title="t('remove')"
              :disabled="saving"
              @click="deleteRule(rule)"
            >
              ×
            </button>
          </div>
        </div>
        <div
          v-if="pendingDelete === rule.id"
          class="delete-confirm"
          role="group"
          :aria-label="t('confirmDelete')"
        >
          <span>{{ t('confirmDelete') }}</span>
          <button type="button" @click="pendingDelete = ''">
            {{ t('cancel') }}
          </button>
          <button type="button" class="confirm-delete" :disabled="saving" @click="deleteRule(rule)">
            {{ t('confirm') }}
          </button>
        </div>
      </article>
    </section>

    <footer class="popup-footer">
      <button type="button" class="footer-primary" @click="openPanel">
        {{ t('openPanel') }}
      </button>
      <button type="button" class="footer-tertiary" @click="openPanelInTab">
        {{ t('openInTab') }}
      </button>
      <button type="button" class="footer-secondary" @click="openShortcuts">
        {{ t('shortcuts') }}
      </button>
    </footer>
  </main>
</template>
