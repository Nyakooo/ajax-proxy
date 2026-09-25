# V3 PrimeVue / Vue 3 面板原型

原型位于候选 Vue 3 面板 package：`packages/vue3-panels`（`@proxy/vue3-panels`）。它使用独立 Vite 入口和 `dist/` 输出，不被扩展 `pkg` 脚本复制；现有 `packages/vue-panels` Vue 2 app 与 shell manifest 不改动。当前样例规则和开关均为页面内存状态，不连接浏览器 storage 或运行时代理。

## 原型覆盖

- Vue 3 + PrimeVue 4 styled 模式，按需注册 Button、InputText、Tag、ToggleSwitch；Aura preset 通过 PrimeUIX `definePreset` 覆盖 Ajax Proxy teal 主色。
- 展示新 mark、当前页面、全局启停、拦截 / 重定向并列导航、组合规则摘要、首条优先级提示、规则搜索、命中计数、空结果及桌面 / 窄面板布局。
- 使用 mark 的浅 / 深状态，`浅色 / 深色` 控件验证 PrimeVue selector theme 与产品自有背景 / 前景 token。页面静态样例并不代表最终视觉规范。
- 创建规则、切换工作区、全局 / 单规则启停、搜索和主题切换在当前页面内可交互；语言分段仅验证控件呈现，尚未翻译整页。
- 通过 `?pt=1` 可在 styled 模式下，将主 CTA 切换为 Pass Through 自定义类，与默认主题 token 样式直接对照。`build:unstyled` 使用 PrimeVue unstyled 与全局 Pass Through 类，并在 `.env.unstyled` 开启。

## 本地运行

```sh
pnpm install --frozen-lockfile
pnpm -C packages/vue3-panels dev
pnpm -C packages/vue3-panels build
pnpm -C packages/vue3-panels build:unstyled
```

`dist/unstyled/` 是独立的本地对照产物，与 styled 产物位于同一忽略目录内，不进入扩展打包或 lint 源码范围。

根目录可用 `pnpm build:v3-panels` 单独构建，或使用 `pnpm preview:v3-panels` 预览 styled 版本。`pnpm check:boundaries` 同时校验 Vue 2 / Vue 3 依赖隔离以及正式扩展的 Vue 2 面板复制路径。

## 验证边界

2026-09-25，Chromium Playwright smoke 检查工作区切换、搜索无结果态、清除搜索、创建样例规则、深色切换及浏览器控制台无页面异常；Chrome Stable 154.0.8037.58 和 Edge Stable 153.0.4234.48 检查了 production preview 的 400 px 窄布局、搜索空态与深色主题，document scroll width 等于 viewport width，主按钮前景色达到预期。PrimeVue / Vue 实际解析为 4.5.5 / 3.5.43。

Pass Through / unstyled 对照结果：在 styled 页面使用 `?pt=1` 只覆盖创建规则 CTA 的根和 label 类；生产 unstyled build 则用全局 Pass Through 类为 Button、InputText、Tag、ToggleSwitch 提供基础样式。Chrome Stable 154.0.8037.58 与 Edge Stable 153.0.4234.48 对 styled、Pass Through CTA、unstyled 三种 production preview 都通过创建、搜索空态 / 清除、ARIA switch 启停、深色切换、键盘焦点可见性检查，且无页面异常。三种模式下主 CTA、搜索框和 ARIA switch 均显示 3 px 品牌焦点环；Chrome / Edge 另确认主 CTA 的浅 / 深主题焦点色正确。unstyled 由产品 CSS 定义，styled / Pass Through 同时覆盖 PrimeVue Aura 默认焦点规则。语义 token 调整后的同一原型源码测得 styled JS 312.24 kB（gzip 78.51 kB）、CSS 13.04 kB（gzip 3.36 kB）；unstyled JS 312.39 kB（gzip 78.53 kB）、CSS 13.04 kB（gzip 3.36 kB）。朴素 unstyled 对照没有减小 bundle，且需自行维护全部交互组件基础样式，因此当前采用 styled + Ajax Proxy tokens，并保留 Pass Through 作为局部视觉扩展点；没有证据要求 Tailwind 接管组件样式。生产 V2 回归由根 `pnpm build` 与 `pnpm extension:smoke` 覆盖。

PrimeVue 安装与 styled theme 配置依照[官方 Vite 安装指南](https://primevue.org/vite/)；主题定制接口依照[官方 Theme Designer / token 说明](https://v4.primevue.org/designer/guide)。当前 package 范围固定 PrimeVue 4 与 Vue 3；此原型不等同最终 PrimeVue / Tailwind 选型，也不完成 Vue 2 面板迁移。
