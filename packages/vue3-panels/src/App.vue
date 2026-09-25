<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { isV3HitNotice, NoticeFrom, NoticeKey, NoticeTo } from '@proxy/protocol'
import RedirectRuleEditor from './components/RedirectRuleEditor.vue'
import ResponseRuleEditor from './components/ResponseRuleEditor.vue'
import { buildV3ResponseRule } from './services/v3ResponseDraft.js'
import { validateFunctionResponseDraft } from './services/v3FunctionResponseDraft.js'
import lightMark from '../../shell-chrome/icons/128.png'
import darkMark from '../../../docs/brand/ajax-proxy-mark-dark.png'

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
const config = ref(createEmptyConfig())
const hitCounters = ref({})
const recentMatch = ref(null)
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
const redirectRuleCount = computed(() => rules.value.filter((rule) => rule.request?.enabled).length)
const interceptRuleCount = computed(
  () => rules.value.filter((rule) => rule.response?.enabled).length
)

function ruleActions(rule) {
  const actions = []
  if (rule.request?.enabled) actions.push('redirect')
  if (rule.response?.enabled) {
    actions.push(rule.response.replace?.code ? 'responseFunction' : 'responseJson')
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
      ...actions.map((action) => t(`action.${action}`)),
    ]
    const matchesSearch = !query || searchable.join(' ').toLowerCase().includes(query)
    const matchesSection =
      section.value === 'redirect' ? rule.request?.enabled : rule.response?.enabled
    return matchesSearch && matchesSection
  })
})
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
    message.to !== NoticeTo.PANELS ||
    message.key !== NoticeKey.V3_HIT ||
    !isV3HitNotice(message.value)
  ) {
    return
  }

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

async function deleteRule(rule) {
  const isRedirect = section.value === 'redirect'
  const actionExists = isRedirect ? rule.request?.enabled : rule.response?.enabled
  if (!actionExists) return
  const keepOtherAction = isRedirect
    ? Boolean(rule.response?.enabled)
    : Boolean(rule.request?.enabled)
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
  if (search.value.trim()) return
  const targetIndex = config.value.rules.findIndex((item) => item.id === targetRule.id)
  const nextRules = ruleOperations.moveV3Rule(config.value.rules, rule.id, targetIndex)
  if (nextRules !== config.value.rules) {
    await persistConfig({ ...config.value, rules: [...nextRules] })
  }
}
</script>

<template>
  <!-- Keep Vue-specific formatting warnings disabled here; Prettier is the template formatter. -->
  <!-- eslint-disable vue/max-attributes-per-line, vue/html-self-closing, vue/singleline-html-element-content-newline -->
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
            <AppButton :label="t('rules.tags')" severity="secondary" outlined />
            <AppButton :label="t('rules.filter')" severity="secondary" outlined />
            <div class="toolbar-spacer" />
            <span class="result-count">{{ loading ? t('editor.loading') : resultCount }}</span>
            <AppButton :label="t('rules.backup')" severity="secondary" text />
          </div>

          <div v-if="operationError" class="operation-alert" role="alert">
            {{ operationError }}
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

          <div v-if="visibleRules.length" class="rule-list">
            <article v-for="(rule, index) in visibleRules" :key="rule.id" class="rule-row">
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
                </div>
                <div class="rule-meta">
                  <span v-for="action in ruleActions(rule)" :key="action" class="action-label">
                    <span class="action-dot" :class="{ coral: action === 'responseJson' }" />
                    {{ t(`action.${action}`) }}
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
                  :disabled="index === 0 || saving || Boolean(search.trim())"
                  :title="search.trim() ? t('rules.clearSearchToReorder') : undefined"
                  @click="moveRule(rule, visibleRules[index - 1])"
                >
                  ↑
                </button>
                <button
                  type="button"
                  :aria-label="t('editor.moveDown', { url: rule.match.url })"
                  :disabled="index === visibleRules.length - 1 || saving || Boolean(search.trim())"
                  :title="search.trim() ? t('rules.clearSearchToReorder') : undefined"
                  @click="moveRule(rule, visibleRules[index + 1])"
                >
                  ↓
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
            <h2>{{ search ? t('rules.noSearchResults') : t('rules.noRules') }}</h2>
            <p>
              {{ search ? t('rules.searchHint') : t('rules.createHint') }}
            </p>
            <AppButton
              v-if="!search"
              :label="t('rules.createFirst')"
              :disabled="loading || saving"
              @click="createRule"
            />
            <AppButton
              v-else
              :label="t('rules.clearSearch')"
              severity="secondary"
              outlined
              @click="search = ''"
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
      :saving="saving"
      :issue="editorIssue"
      @close="editorOpen = false"
      @save="saveRedirectRule"
    />
    <ResponseRuleEditor
      :open="responseEditorOpen"
      :rule="editingResponseRule"
      :saving="saving"
      :issue="responseEditorIssue"
      @close="responseEditorOpen = false"
      @save="saveResponseRule"
    />
  </div>
</template>
