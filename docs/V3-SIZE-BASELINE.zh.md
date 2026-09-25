# Ajax Proxy 生产包体积基线

日期：2026-09-25
分支：`refactor/v3`
构建版本：根项目 `2.2.10`，Node `24.21.0`，pnpm `12.6.0`

## 当前构建结果

由仓库现有生产构建和 ZIP 打包脚本生成。数值是 V3 重构前的 V2 产物基线，用作后续方案对比，不代表最终 V3 预算。

| 产物                     | 文件数 |                   原始大小 |       单文件 gzip 合计 |
| ------------------------ | -----: | -------------------------: | ---------------------: |
| JS（扩展脚本及面板脚本） |     12 | 2,117,875 B（2,068.2 KiB） | 574,528 B（561.1 KiB） |
| CSS（面板样式）          |      2 |     674,392 B（658.6 KiB） |   86,598 B（84.6 KiB） |
| 扩展 ZIP                 |      — |     741,380 B（724.0 KiB） |             ZIP 已压缩 |

gzip 数值按每个 JS / CSS 文件独立使用 gzip level 9 计算后相加，是资源传输体积的可重复估算，不等于把所有资源合并后压缩。ZIP 大小由仓库当前发布脚本实际生成，使用 ZIP deflate level 9。

2026-09-25 Node `24.21.0`、pnpm `12.6.0` clean build 后重新打包测量；对应最近一次 clean build 的准确值为上表数据。V3 预算定稿前暂不阻断；CI 每次输出测量值。

## 编辑器打包观察

- 当前 Vue 面板源码从规则弹窗静态导入代码编辑器和 JSON 编辑器，没有按需加载边界。
- 生产 `app` 主 chunk 为 1,650,157 B（Vue CLI 报告 1,611.48 KiB、438.70 KiB gzip），包含 Ace 和 JSONEditor 代码；编辑器依赖目前进入面板初始 JS 下载，没有独立的延迟 chunk。交互验证与 CodeMirror 可行性结论见 `docs/V3-EDITOR-ASSESSMENT.zh.md`。
- 后续重构应在编辑器弹窗打开时才加载编辑器 chunk，并记录首屏 JS 与编辑器 chunk 大小；UI 组件按需引入也纳入同一对比。

## 重现方式

```sh
pnpm build
pnpm zip
pnpm size:report
```

`size:report` 统计 `packages/shell-chrome/build` 下所有 `.js` / `.css` 文件，并读取 `zip/ajax-proxy-<根版本号>.zip`。报告脚本：`scripts/report-bundle-size.cjs`。

## 预算状态

当前记录为基线，尚未设定最终预算上限。待 Vue 3 / PrimeVue 4 主题原型、编辑器按需加载和按需组件构建完成后，根据首屏 JS、编辑器独立 chunk、CSS 与扩展 ZIP 的对比结果设定 V3 上限，并在 CI 中阻止超预算回归。
