# V3 PrimeVue / Vue 3 面板原型

原型 package：`packages/v3-ui-prototype`。它使用独立 Vite 入口和 `dist/` 输出，不被扩展 `pkg` 脚本复制；现有 `packages/vue-panels` Vue 2 app 与 shell manifest 不改动。样例规则和开关均为页面内存状态，不连接浏览器 storage 或运行时代理。

## 原型覆盖

- Vue 3 + PrimeVue 4 styled 模式，按需注册 Button、InputText、Tag、ToggleSwitch；Aura preset 通过 PrimeUIX `definePreset` 覆盖 Ajax Proxy teal 主色。
- 展示新 mark、当前页面、全局启停、拦截 / 重定向并列导航、组合规则摘要、首条优先级提示、规则搜索、命中计数、空结果及桌面 / 窄面板布局。
- 使用 mark 的浅 / 深状态，`浅色 / 深色` 控件验证 PrimeVue selector theme 与产品自有背景 / 前景 token。页面静态样例并不代表最终视觉规范。
- 创建规则、切换工作区、全局 / 单规则启停、搜索和主题切换在当前页面内可交互；语言分段仅验证控件呈现，尚未翻译整页。

## 本地运行

```sh
pnpm install --frozen-lockfile
pnpm -C packages/v3-ui-prototype dev
pnpm -C packages/v3-ui-prototype build
```

## 验证边界

2026-09-25，Chromium Playwright smoke 检查工作区切换、搜索无结果态、清除搜索、创建样例规则、深色切换及浏览器控制台无页面异常；Chrome Stable 154.0.8037.58 和 Edge Stable 153.0.4234.48 检查了 production preview 的 400 px 窄布局、搜索空态与深色主题，document scroll width 等于 viewport width，主按钮前景色达到预期。PrimeVue / Vue 实际解析为 4.5.5 / 3.5.43；Vite production prototype JS 311.91 kB（gzip 78.33 kB）、CSS 9.57 kB（gzip 2.69 kB）。生产 V2 回归由根 `pnpm build` 与 `pnpm extension:smoke` 覆盖。

PrimeVue 安装与 styled theme 配置依照[官方 Vite 安装指南](https://primevue.org/vite/)；主题定制接口依照[官方 Theme Designer / token 说明](https://v4.primevue.org/designer/guide)。当前 package 范围固定 PrimeVue 4 与 Vue 3；此原型不等同最终 PrimeVue / Tailwind 选型，也不完成 Vue 2 面板迁移。
