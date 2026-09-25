<script setup>
import { computed, ref, watch } from 'vue'
import lightMark from '../../shell-chrome/icons/128.png'
import darkMark from '../../../docs/brand/ajax-proxy-mark-dark.png'

const enabled = ref(true)
const darkMode = ref(false)
const language = ref('简体中文')
const section = ref('intercept')
const search = ref('')
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
    actions: ['响应 JSON'],
    note: '固定用户信息响应',
    hits: 18,
  },
  {
    id: 'rule-2',
    enabled: true,
    match: '/v1/catalog/.*',
    method: 'GET',
    actions: ['重定向', '响应 JSON'],
    note: '本地 catalog fixture',
    hits: 7,
  },
  {
    id: 'rule-3',
    enabled: false,
    match: 'api.example.com/v1/checkout',
    method: 'POST',
    actions: ['响应函数'],
    note: '异常支付响应',
    hits: 0,
  },
])

const activeMark = computed(() => (darkMode.value ? darkMark : lightMark))
const visibleRules = computed(() => {
  const query = search.value.trim().toLowerCase()
  return rules.value.filter((rule) => {
    const matchesSearch =
      !query || `${rule.match} ${rule.note} ${rule.method}`.toLowerCase().includes(query)
    const matchesSection = section.value === 'intercept' || rule.actions.includes('重定向')
    return matchesSearch && matchesSection
  })
})

watch(darkMode, (dark) => {
  document.documentElement.classList.toggle('app-dark', dark)
})

function createRule() {
  const id = `rule-${Date.now()}`
  rules.value.unshift({
    id,
    enabled: false,
    match: '输入要匹配的 URL',
    method: 'ANY',
    actions: section.value === 'intercept' ? ['响应 JSON'] : ['重定向'],
    note: '新建规则（原型内存数据）',
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
          <span>请求调试工作台</span>
        </div>
      </div>

      <div class="page-context">
        <span class="context-dot" :class="{ 'context-dot-off': !enabled }" />
        <div>
          <span class="context-label">当前页面</span>
          <strong>dev.example.com</strong>
        </div>
      </div>

      <div class="top-actions">
        <label class="enable-control">
          <span>{{ enabled ? '代理已启用' : '代理已停用' }}</span>
          <ToggleSwitch v-model="enabled" aria-label="全局启用 Ajax Proxy" />
        </label>
        <AppButton
          class="theme-toggle"
          :label="darkMode ? '深色' : '浅色'"
          severity="secondary"
          text
          @click="darkMode = !darkMode"
        />
        <div class="language-toggle" role="group" aria-label="界面语言">
          <button
            v-for="item in ['简体中文', 'English']"
            :key="item"
            type="button"
            :aria-pressed="language === item"
            :class="{ selected: language === item }"
            @click="language = item"
          >
            {{ item === '简体中文' ? '中' : 'EN' }}
          </button>
        </div>
      </div>
    </header>

    <section class="workspace">
      <aside class="sidebar">
        <p class="sidebar-heading">工作区</p>
        <button
          type="button"
          class="nav-item"
          :class="{ selected: section === 'intercept' }"
          @click="section = 'intercept'"
        >
          <span class="nav-icon intercept-icon">⇄</span>
          <span>拦截规则</span>
          <span class="nav-count">{{ rules.length }}</span>
        </button>
        <button
          type="button"
          class="nav-item"
          :class="{ selected: section === 'redirect' }"
          @click="section = 'redirect'"
        >
          <span class="nav-icon redirect-icon">↗</span>
          <span>重定向规则</span>
          <span class="nav-count">1</span>
        </button>
        <div class="sidebar-divider" />
        <div class="sidebar-tip">
          <span class="tip-mark">i</span>
          <p>多条规则同时匹配时，由列表中的第一条完整命中规则处理请求。</p>
        </div>
        <div class="sidebar-footer">
          <span class="status-pulse" :class="{ paused: !enabled }" />
          <span>{{ enabled ? '正在监视当前页面' : '规则暂不作用于页面' }}</span>
        </div>
      </aside>

      <section class="content">
        <div class="content-heading">
          <div>
            <div class="eyebrow">规则管理 / {{ section === 'intercept' ? '拦截' : '重定向' }}</div>
            <h1>{{ section === 'intercept' ? '拦截规则' : '重定向规则' }}</h1>
            <p>按原始请求条件匹配，并在一个规则中管理请求与响应行为。</p>
          </div>
          <AppButton
            label="创建规则"
            :pt="comparePassThrough ? passThroughCreateButton : undefined"
            @click="createRule"
          />
        </div>

        <div class="toolbar">
          <label class="search-box">
            <span class="search-glyph">⌕</span>
            <InputText v-model="search" placeholder="搜索 URL、method 或备注" />
            <kbd>⌘ K</kbd>
          </label>
          <AppButton label="标签" severity="secondary" outlined />
          <AppButton label="筛选" severity="secondary" outlined />
          <div class="toolbar-spacer" />
          <span class="result-count">{{ visibleRules.length }} 条规则</span>
          <AppButton label="备份 / 恢复" severity="secondary" text />
        </div>

        <div v-if="!enabled" class="disabled-notice" role="status">
          全局代理已停用。规则仍可查看和编辑，启用后才会应用到页面请求。
        </div>

        <div v-if="visibleRules.length" class="rule-list">
          <article v-for="(rule, index) in visibleRules" :key="rule.id" class="rule-row">
            <div class="rule-order">
              {{ String(index + 1).padStart(2, '0') }}
            </div>
            <ToggleSwitch v-model="rule.enabled" :aria-label="`启用规则 ${rule.note}`" />
            <div class="rule-main">
              <div class="rule-title-line">
                <code>{{ rule.match }}</code>
                <AppTag :value="rule.method" severity="secondary" />
                <span v-if="index === 0 && rule.enabled" class="priority-pill">优先级最高</span>
              </div>
              <div class="rule-meta">
                <span v-for="action in rule.actions" :key="action" class="action-label">
                  <span class="action-dot" :class="{ coral: action === '响应 JSON' }" />
                  {{ action }}
                </span>
                <span class="meta-separator" />
                <span>{{ rule.note }}</span>
              </div>
            </div>
            <div class="hit-count">
              <strong>{{ rule.hits }}</strong>
              <span>命中</span>
            </div>
            <AppButton severity="secondary" text rounded aria-label="更多规则操作"> ⋯ </AppButton>
          </article>
        </div>

        <div v-else class="empty-state">
          <div class="empty-illustration">⌕</div>
          <h2>{{ search ? '没有符合条件的规则' : '还没有规则' }}</h2>
          <p>
            {{ search ? '试试缩短搜索词，或清除搜索条件。' : '创建一条规则，开始调试请求与响应。' }}
          </p>
          <AppButton v-if="!search" label="创建第一条规则" @click="createRule" />
          <AppButton v-else label="清除搜索" severity="secondary" outlined @click="search = ''" />
        </div>

        <footer class="prototype-note">
          {{
            unstyledMode
              ? 'PrimeVue unstyled + Pass Through CSS'
              : comparePassThrough
                ? 'PrimeVue styled + Pass Through CTA'
                : 'PrimeVue 4 styled + Ajax Proxy tokens'
          }}
          <span>·</span> 原型数据只保存在当前页面内存中
        </footer>
      </section>
    </section>
  </main>
</template>
