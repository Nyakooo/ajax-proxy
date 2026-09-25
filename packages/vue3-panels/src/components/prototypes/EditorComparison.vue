<script setup>
import { computed, defineAsyncComponent, onBeforeUnmount, ref, watch } from 'vue'

const CodeMirrorJsonEditor = defineAsyncComponent(() => import('./CodeMirrorJsonEditor.vue'))
const JsonEditorTreePrototype = defineAsyncComponent(() => import('./JsonEditorTreePrototype.vue'))
const JsonTreePrototype = defineAsyncComponent(() => import('./JsonTreePrototype.vue'))
const editor = ref('textarea')
const sample = {
  profile: { id: 1024, displayName: '张小明', active: true, tags: ['trial', 'editor'] },
  preferences: { theme: 'dark', density: 'comfortable' },
  result: null,
}
const draft = ref(JSON.stringify(sample, null, 2))
const previewDraft = ref(draft.value)
let previewTimer
const editorNames = {
  textarea: '原生文本框',
  code: 'CodeMirror 6',
  jsoneditor: 'JSONEditor 树形',
  tree: '轻量树形编辑',
}
const parsed = computed(() => {
  try {
    return { ok: true, value: JSON.parse(previewDraft.value) }
  } catch (error) {
    return { ok: false, error: error.message }
  }
})
const sizeBytes = computed(() => new TextEncoder().encode(draft.value).length)

watch(draft, (value) => {
  clearTimeout(previewTimer)
  previewTimer = setTimeout(() => {
    previewDraft.value = value
  }, 180)
})

onBeforeUnmount(() => clearTimeout(previewTimer))

function loadSample(size) {
  const count = size === 'large' ? 1500 : size === 'medium' ? 150 : 4
  const data = {
    generated: true,
    profile: sample.profile,
    items: Array.from({ length: count }, (_, index) => ({
      id: index + 1,
      name: '商品 ' + (index + 1),
      enabled: index % 2 === 0,
      price: Number((index * 1.25).toFixed(2)),
      labels: ['catalog', 'sample'],
    })),
  }
  draft.value = JSON.stringify(data, null, 2)
}
</script>

<template>
  <!-- eslint-disable vue/max-attributes-per-line, vue/singleline-html-element-content-newline -->
  <main class="editor-prototype-page">
    <header class="prototype-header">
      <div>
        <p class="prototype-eyebrow">AJAX PROXY · V3 DESIGN STUDY</p>
        <h1>JSON 编辑器交互原型</h1>
        <p>同一份 JSON 数据对比轻量文本编辑、CodeMirror 6 与树形编辑。</p>
      </div>
      <span class="prototype-standalone-label">独立于面板运行</span>
    </header>

    <nav class="prototype-toolbar" aria-label="Editor options">
      <div class="prototype-mode-switch" role="group" aria-label="选择编辑器">
        <button
          v-for="(name, key) in editorNames"
          :key="key"
          type="button"
          :aria-pressed="editor === key"
          :class="{ selected: editor === key }"
          @click="editor = key"
        >
          {{ name }}
        </button>
      </div>
      <div class="prototype-samples" role="group" aria-label="JSON sample size">
        <span>样例大小</span>
        <button type="button" @click="loadSample('small')">小</button>
        <button type="button" @click="loadSample('medium')">中</button>
        <button type="button" @click="loadSample('large')">大</button>
      </div>
      <output>{{ sizeBytes.toLocaleString() }} bytes</output>
    </nav>

    <section class="prototype-comparison">
      <article class="prototype-editor-card">
        <header>
          <div>
            <span>编辑方式</span>
            <h2>{{ editorNames[editor] }}</h2>
          </div>
          <span class="prototype-mode-badge">{{ editor.toUpperCase() }}</span>
        </header>
        <textarea
          v-if="editor === 'textarea'"
          v-model="draft"
          class="prototype-textarea"
          aria-label="JSON text editor prototype"
          spellcheck="false"
        />
        <CodeMirrorJsonEditor
          v-else-if="editor === 'code'"
          v-model="draft"
          aria-label="CodeMirror JSON editor prototype"
        />
        <JsonEditorTreePrototype v-else-if="editor === 'jsoneditor'" v-model="draft" />
        <JsonTreePrototype v-else v-model="draft" />
      </article>

      <aside class="prototype-preview-card">
        <header>
          <div>
            <span>实时校验</span>
            <h2>{{ parsed.ok ? 'JSON 有效' : 'JSON 语法错误' }}</h2>
          </div>
          <span class="prototype-status" :class="{ invalid: !parsed.ok }" />
        </header>
        <pre v-if="parsed.ok">{{ JSON.stringify(parsed.value, null, 2) }}</pre>
        <p v-else class="prototype-parse-error" role="alert">
          {{ parsed.error }}
        </p>
        <div class="prototype-capabilities">
          <span>评估维度：输入法、键盘、撤销、结构操作、可访问性和大数据</span>
        </div>
      </aside>
    </section>
  </main>
</template>

<style>
:root {
  font-family: Inter, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  color: #19393e;
  background: #f2f7f6;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

button,
textarea,
input,
select {
  font: inherit;
}

button,
a {
  color: inherit;
}

.editor-prototype-page {
  width: min(1260px, calc(100% - 36px));
  margin: 32px auto;
}

.prototype-header,
.prototype-toolbar,
.prototype-editor-card > header,
.prototype-preview-card > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.prototype-eyebrow,
.prototype-editor-card > header span,
.prototype-preview-card > header span,
.prototype-samples > span {
  color: #648186;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.prototype-header h1 {
  margin: 7px 0;
  font-size: clamp(24px, 4vw, 34px);
}

.prototype-header p {
  margin: 0;
  color: #648186;
}

.prototype-header a {
  white-space: nowrap;
}

.prototype-toolbar {
  flex-wrap: wrap;
  margin: 25px 0 14px;
  padding: 12px;
  border: 1px solid #dce8e6;
  border-radius: 12px;
  background: white;
}

.prototype-mode-switch,
.prototype-samples {
  display: flex;
  align-items: center;
  gap: 6px;
}

.prototype-mode-switch button,
.prototype-samples button {
  min-height: 34px;
  padding: 0 11px;
  border: 1px solid #dce8e6;
  border-radius: 7px;
  background: white;
  cursor: pointer;
}

.prototype-mode-switch .selected {
  border-color: #168a85;
  background: #e3f4f2;
}

.prototype-mode-switch button:focus-visible,
.prototype-samples button:focus-visible,
.json-tree-node button:focus-visible,
.json-tree-leaf :focus-visible,
.prototype-textarea:focus-visible {
  outline: 2px solid #168a85;
  outline-offset: 2px;
}

.prototype-comparison {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(300px, 0.85fr);
  gap: 14px;
}

.prototype-editor-card,
.prototype-preview-card {
  min-width: 0;
  min-height: 640px;
  padding: 18px;
  border: 1px solid #dce8e6;
  border-radius: 12px;
  background: white;
}

.prototype-editor-card > header,
.prototype-preview-card > header {
  margin-bottom: 15px;
}

.prototype-editor-card h2,
.prototype-preview-card h2 {
  margin: 4px 0 0;
  font-size: 16px;
}

.prototype-mode-badge {
  padding: 5px 8px;
  border-radius: 6px;
  background: #edf4f3;
}

.prototype-textarea,
.cm-editor,
.json-tree-prototype {
  width: 100%;
  min-height: 550px;
  border: 1px solid #dce8e6;
  border-radius: 8px;
}

.prototype-textarea {
  padding: 14px;
  resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  line-height: 1.55;
  tab-size: 2;
}

.cm-editor {
  min-height: 550px;
  font-size: 13px;
}

.cm-editor .cm-scroller {
  overflow: auto;
}

.json-tree-prototype {
  overflow: auto;
  padding: 12px;
  font-size: 12px;
}

.json-tree-node {
  margin-left: 8px;
}

.json-tree-node summary,
.json-tree-leaf {
  display: flex;
  min-height: 34px;
  align-items: center;
  gap: 8px;
  padding: 3px 6px;
}

.json-tree-node summary {
  cursor: pointer;
}

.json-tree-node summary code,
.json-tree-leaf code {
  color: #648186;
}

.json-tree-node summary button,
.json-tree-child-actions button {
  border: 1px solid #dce8e6;
  border-radius: 5px;
  background: white;
  cursor: pointer;
}

.json-tree-child {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-left: 1px solid #dce8e6;
}

.json-tree-child > details,
.json-tree-child > .json-tree-leaf {
  flex: 1;
}

.json-tree-child-actions {
  display: flex;
  gap: 4px;
}

.json-tree-label {
  min-width: 90px;
  font-weight: 600;
}

.json-tree-leaf input,
.json-tree-leaf select {
  max-width: 200px;
  min-height: 28px;
  padding: 3px 6px;
  border: 1px solid #dce8e6;
  border-radius: 5px;
}

.prototype-preview-card pre {
  overflow: auto;
  max-height: 540px;
  padding: 12px;
  border-radius: 7px;
  background: #f6f9f8;
  font-size: 12px;
  line-height: 1.5;
}

.prototype-parse-error,
.json-tree-invalid {
  padding: 12px;
  color: #9f3f35;
  background: #fff0ed;
}

.prototype-status {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #168a85;
}

.prototype-status.invalid {
  background: #c4564b;
}

.prototype-capabilities {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.prototype-capabilities span {
  padding: 5px 8px;
  border-radius: 5px;
  background: #edf4f3;
  font-size: 10px;
}

@media (max-width: 780px) {
  .prototype-comparison {
    grid-template-columns: minmax(0, 1fr);
  }

  .prototype-header {
    align-items: flex-start;
  }

  .prototype-header a {
    font-size: 12px;
  }
}
</style>
