# 编辑器与生产体积评估

盘点日期：2026-09-25。此评估用于记录现有体验、生产包开销和 V3 原型方向；V2 编辑器没有在本阶段替换。

## 现有交互验证

当前 `@proxy/json-editor` 使用 jsoneditor `9.9.2`。拦截规则编辑页以 code 模式打开 JSON，用户可切换 tree、form、text 和 view 模式。Playwright 扩展 smoke 直接打开生产扩展面板并验证：

- 展开 / 折叠整棵 JSON 树。
- 显示布尔、数字等类型信息。
- 从树形菜单新增字段、修改字段和值，并删除字段。
- 通过 Undo / Redo 撤销和恢复修改。
- 拖动数组元素后，最终规则 JSON 顺序随之改变。
- 在 code 模式输入无效 JSON 时，Ace 在 gutter 标出错误行；独立 smoke 确认错误定位到第 1 行。

以上覆盖规则 UI 实际使用的 JSONEditor 组件和生产打包扩展。回归入口是 `pnpm extension:smoke` 与 `pnpm editor:smoke`，CI 构建后运行。

## CodeMirror 6 可行性

CodeMirror 6 的 JavaScript 和 JSON 支持按包组合，适合构建轻量、按需加载的代码 / JSON 文本编辑器。官方指南描述的是可扩展文本编辑器模块；默认不提供 JSON 树形节点管理交互。因此单独用 CodeMirror 6 替换现有 JSONEditor 会失去本次验证的增删节点、数组拖动排序、类型识别和树形展开能力。该结论是基于官方编辑器能力范围与 Ajax Proxy 已确认需求作出的判断。

V3 UI 阶段的原型方向：函数响应编辑器试用 CodeMirror 6；JSON 配置继续使用树形编辑器或另做树形控件，提供 code / tree 切换。只有完成中文输入、键盘可用性、错误定位、大 JSON 性能和异步 chunk 体积对比后，再决定具体组件。CodeMirror 官方资料：[系统指南](https://codemirror.net/docs/guide/)、[扩展目录](https://codemirror.net/docs/extensions/)。

## 当前首屏与扩展包体积

Node `24.21.0`、pnpm `12.6.0` 下完整 clean build 后，执行 `pnpm zip && pnpm size:report` 得到：

| 测量项               |                                            当前 V2 产物 |
| -------------------- | ------------------------------------------------------: |
| 面板首屏 app JS      |       1,650,157 B 原始（1,611.48 KiB），438.70 KiB gzip |
| 编辑器专用异步 chunk |          无；Ace / JSONEditor 被静态导入并合入 app 首屏 |
| 最终扩展 JS          | 12 个文件，2,117,875 B 原始，574,528 B 单文件 gzip 合计 |
| 最终扩展 CSS         |     2 个文件，674,392 B 原始，86,598 B 单文件 gzip 合计 |
| 扩展 ZIP             |                                  741,380 B（724.0 KiB） |

`app` 大小取自 Vue CLI 生产构建文件报告；扩展 JS / CSS 与 ZIP 由根 `size:report` 脚本从最终打包目录测量。gzip 按文件独立压缩后相加。编辑器弹窗打开前与异步编辑器 chunk 当前无法分开统计，因为尚未实现延迟加载。

基线只用于后续比较，不代表 V3 预算。V3 必须实际拆分并测量首屏 JS、编辑器异步 chunk、最终 ZIP 后再确定预算。
