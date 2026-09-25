<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import lightMark from '../../shell-chrome/icons/128.png'
import darkMark from '../../../docs/brand/ajax-proxy-mark-dark.png'

const enabled = ref(true)
const darkMode = ref(false)
const section = ref('intercept')
const search = ref('')
const { locale, t } = useI18n({ useScope: 'global' })
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
const rules = ref([
  {
    id: 'rule-1',
    enabled: true,
    match: 'api.example.com/v1/profile',
    method: 'GET',
    actions: ['responseJson'],
    noteKey: 'sampleNote',
    hits: 18,
  },
  {
    id: 'rule-2',
    enabled: true,
    match: '/v1/catalog/.*',
    method: 'GET',
    actions: ['redirect', 'responseJson'],
    noteKey: 'catalogNote',
    hits: 7,
  },
  {
    id: 'rule-3',
    enabled: false,
    match: 'api.example.com/v1/checkout',
    method: 'POST',
    actions: ['responseFunction'],
    noteKey: 'checkoutNote',
    hits: 0,
  },
])

const activeMark = computed(() => (darkMode.value ? darkMark : lightMark))
const visibleRules = computed(() => {
  const query = search.value.trim().toLowerCase()
  return rules.value.filter((rule) => {
    const searchable = [
      rule.match,
      t(`rules.${rule.noteKey}`),
      rule.method,
      ...rule.actions.map((action) => t(`action.${action}`)),
    ]
    const matchesSearch = !query || searchable.join(' ').toLowerCase().includes(query)
    const matchesSection = section.value === 'intercept' || rule.actions.includes('redirect')
    return matchesSearch && matchesSection
  })
})
const resultCount = computed(() => {
  if (locale.value === 'zh-CN') return t('rules.count', { count: visibleRules.value.length })
  const key = visibleRules.value.length === 1 ? 'rules.countOne' : 'rules.countOther'
  return t(key, { count: visibleRules.value.length })
})

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
  },
  { immediate: true }
)

function createRule() {
  const id = `rule-${Date.now()}`
  rules.value.unshift({
    id,
    enabled: false,
    match: '',
    isDraft: true,
    method: 'ANY',
    actions: section.value === 'intercept' ? ['responseJson'] : ['redirect'],
    noteKey: 'newRuleNote',
    hits: 0,
  })
}
</script>

<template>
  <!-- Keep Vue-specific formatting warnings disabled here; Prettier is the template formatter. -->
  <!-- eslint-disable vue/max-attributes-per-line, vue/html-self-closing, vue/singleline-html-element-content-newline -->
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
          <ToggleSwitch v-model="enabled" :aria-label="t('proxy.aria')" />
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
          <span class="nav-count">{{ rules.length }}</span>
        </button>
        <button
          type="button"
          class="nav-item"
          :class="{ selected: section === 'redirect' }"
          @click="section = 'redirect'"
        >
          <span class="nav-icon redirect-icon">↗</span>
          <span>{{ t('workspace.redirect') }}</span>
          <span class="nav-count">1</span>
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
            :label="t('rules.create')"
            :pt="comparePassThrough ? passThroughCreateButton : undefined"
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
          <span class="result-count">{{ resultCount }}</span>
          <AppButton :label="t('rules.backup')" severity="secondary" text />
        </div>

        <div v-if="!enabled" class="disabled-notice" role="status">
          {{ t('proxy.disabledNotice') }}
        </div>

        <div v-if="visibleRules.length" class="rule-list">
          <article v-for="(rule, index) in visibleRules" :key="rule.id" class="rule-row">
            <div class="rule-order">
              {{ String(index + 1).padStart(2, '0') }}
            </div>
            <ToggleSwitch
              v-model="rule.enabled"
              :aria-label="t('rules.enableAria', { name: t(`rules.${rule.noteKey}`) })"
            />
            <div class="rule-main">
              <div class="rule-title-line">
                <code>{{ rule.isDraft ? t('rules.urlPlaceholder') : rule.match }}</code>
                <AppTag :value="rule.method" severity="secondary" />
                <span v-if="index === 0 && rule.enabled" class="priority-pill">{{
                  t('rules.priority')
                }}</span>
              </div>
              <div class="rule-meta">
                <span v-for="action in rule.actions" :key="action" class="action-label">
                  <span class="action-dot" :class="{ coral: action === 'responseJson' }" />
                  {{ t(`action.${action}`) }}
                </span>
                <span class="meta-separator" />
                <span>{{ t(`rules.${rule.noteKey}`) }}</span>
              </div>
            </div>
            <div class="hit-count">
              <strong>{{ rule.hits }}</strong>
              <span>{{ t('rules.hits') }}</span>
            </div>
            <AppButton severity="secondary" text rounded :aria-label="t('rules.moreActions')">
              ⋯
            </AppButton>
          </article>
        </div>

        <div v-else class="empty-state">
          <div class="empty-illustration">⌕</div>
          <h2>{{ search ? t('rules.noSearchResults') : t('rules.noRules') }}</h2>
          <p>
            {{ search ? t('rules.searchHint') : t('rules.createHint') }}
          </p>
          <AppButton v-if="!search" :label="t('rules.createFirst')" @click="createRule" />
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
          <span>·</span> {{ t('prototype.memory') }}
        </footer>
      </section>
    </section>
  </main>
</template>
