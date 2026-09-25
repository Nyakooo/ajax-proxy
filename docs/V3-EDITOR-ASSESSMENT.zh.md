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

## V3 JSON 编辑器交互原型

验证日期：2026-09-25。独立原型入口为 `packages/vue3-panels/editor-prototype.html`，运行 `pnpm -C packages/vue3-panels build:editor-prototype` 构建，预览命令为 `pnpm -C packages/vue3-panels preview:editor-prototype`。原型输出到 `packages/vue3-panels/dist-editor-prototype/`，与会被扩展打包的正式 `dist/` 隔离。CodeMirror、JSONEditor 和轻量树按模式异步加载；原型及依赖不属于正式运行依赖。

在 Chrome for Testing 154.0.8037.57 与 Microsoft Edge Stable 153 中，以真实浏览器逐项操作：CodeMirror 键盘选中并替换 JSON、输入中文文本并检查实时预览；轻量树修改字符串字段并新增对象字段；JSONEditor tree-only 模式渲染字段；加载含 1500 项的样例；将无效 JSON 切换到 JSONEditor 后确认原文保留，修复后再切回树形模式。两个浏览器均无页面异常或资源加载失败。浏览器自动化发送了中文文本，但没有连接操作系统 IME，因此这不是对 macOS / Windows 输入法组合态的完整验证。

| 方案 / 构建块                                       |   原始 JS |   gzip JS |   原始 CSS |   gzip CSS | 观察                                                                             |
| --------------------------------------------------- | --------: | --------: | ---------: | ---------: | -------------------------------------------------------------------------------- |
| 原型初始 chunk（含 Vue 与比较框架，不含具体编辑器） |  73.99 kB |  29.80 kB |    3.83 kB |    1.23 kB | 各编辑器内容尚未加载                                                             |
| CodeMirror 6 异步 chunk                             | 310.16 kB | 101.76 kB |    0.24 kB |    0.17 kB | 文本编辑；包含行号、JSON 高亮、键盘映射和撤销历史                                |
| 轻量树形编辑异步 chunk                              |   4.64 kB |   1.80 kB | 在初始 CSS | 在初始 CSS | 体积很小，但功能仅为原型下限                                                     |
| JSONEditor tree-only 异步 chunk                     | 946.28 kB | 262.79 kB |   35.49 kB |    6.32 kB | 构建的 JS 仍包含 npm 包的大部分代码，设置 `modes: ['tree']` 未将源码裁剪到树模式 |

样例的 JSON 文本为 249,826 bytes。Chrome 与 Edge 都成功更新实时预览并显示最后一项。预览每 180 ms 去抖，减少公共 parse / render 对模式切换的影响；本次只验证样例可完成加载和渲染，不将其视为严格的毫秒级性能基准。轻量树在此样例下递归创建全部节点，没有虚拟化，应视为未经优化的自制原型。

| 验收维度       | 原型观察与边界                                                                                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 文本编辑       | CodeMirror 键盘替换及中文文本往返成功；真实 IME 组合输入仍需在 Chrome / Edge 桌面稳定版手动验收。                                                                                 |
| 树形结构操作   | 轻量树可以改叶值、加字段、删字段和移动数组元素；暂不支持自定义字段名、可撤销操作、多行字符串编辑、受控非法数字输入，也未实现虚拟列表。不能以该最小实现推断最终产品可用性。        |
| 无效 JSON      | 两种树形实现均保留无效原文并提示先修复；修正后可正常挂载编辑器，不会静默覆盖成 `null`。                                                                                           |
| 键盘和可访问性 | 模式与样例按钮有可见焦点样式；轻量树控件有 label，CodeMirror contenteditable 有 aria label。该轮未完成逐控件全键盘审计、屏幕阅读器审计或 WCAG 对比度审查。                        |
| 撤销 / 重做    | Chrome 与 Edge 均通过键盘操作验证 CodeMirror Undo / Redo 可恢复与重放完整 JSON 替换；树形编辑器的撤销行为仍待选定生产方案后验收。                                                 |
| 生产体积与隔离 | 上表是独立原型 chunk，不是 V3 最终预算。JSONEditor 体积高；且原型构建输出在生产 `dist/` 外，避免被递归 stage 到 `panels-v3/`。正式 V3 首屏和 ZIP 预算仍需在生产编辑器集成后测量。 |

阶段方向：函数编辑器和 JSON 原始文本模式采用按需 CodeMirror 6；JSON 结构化调整保留独立树形能力。原型数据不支持将 JSONEditor 当前 npm 包直接纳入生产 V3，也不足以确认这份轻量树组件可直接产品化。后续需为生产树编辑方案补齐成熟组件裁剪评估或扩展结构操作、键盘撤销、真实 IME 与无障碍检查，并再次测量生产产物。

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
