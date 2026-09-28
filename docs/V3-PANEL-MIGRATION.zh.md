# Vue 3 面板迁移边界与实施顺序

## 当前切片

`packages/vue3-panels` 是正式 V3 Vue 3 / PrimeVue 面板 workspace package。它通过扩展消息读取校验后的 V3 快照、保存或清除 V3 配置，构建到 `packages/vue3-panels/dist/`，也由 `pnpm build` 纳入正式扩展。

正式面板和扩展默认入口为 `panels-v3/`。旧 Vue 2 面板及其 Ace / JSONEditor 组件包已从 workspace 删除；正式构建、CI 和格式债务基线不再包含这些实现。`pnpm check:boundaries` 与生产布局 smoke 确认 V3 扩展只依赖 Vue 3 面板。

V3 面板只使用 Vue 3 runtime。纯数据、协议和验证逻辑优先沿用 framework-free 包；编辑器组件由 V3 面板自身的 CodeMirror 组件实现。

Vue 3 面板接入 `vue-i18n` 11 Composition API，只提供简体中文与英文文案；语言偏好保存在独立的 `ajax-proxy-v3-locale` localStorage key，并由 V3 配置的 language 字段同步。V2 locale 和设置不自动迁移。Vue 3 面板不使用空壳路由或集中 store；跨页面导航或共享状态出现实际需求后再单独选型。

Vue 2.6.11、Vue CLI、Element UI、Ace 和旧版 JSONEditor 面板编译依赖已随旧 workspace 包移除；V3 备份格式保持独立且不转换旧配置。

V3 adapter 使用独立的 `GET_SNAPSHOT` / `SAVE_CONFIG` 协议，不复用 content script 到页面主世界的 `V3_CONFIG` 通知。service worker 只接受扩展内 `panels-v3/` 页面发送的请求；读配置时先运行 V3 backup 校验，再清理已知规则的命中计数；保存时同样校验并仅写 `V3_CONFIG`，`null` 只清除该配置键。V2 的配置和 storage 路径不参与此 adapter。Vue 3 客户端在发送前及接收后验证数据结构，并将扩展不可用 / 消息失败映射成稳定错误。

当前真实数据流程覆盖 V3 重定向 CRUD、字面 URL 排除项、静态重定向请求头、JSON 响应 CRUD、自定义 Fetch 函数响应编辑及 JSON 备份恢复：读取快照后按 action 展示规则；新增、编辑、删除、启停及调整数组顺序都会保存完整 V3 backup，顺序就是首条命中优先级。编辑组合规则会保留另一个 action；响应编辑保留未编辑 headers，删除 action 不会误删同规则内的另一个 action。JSON body 和状态码在保存前校验；语法诊断在浏览器提供解析位置时显示行 / 列，并提供对象、数组、字符串和 null 示例。字符串 / RE2 匹配、method、直接 HTTP(S) 或相对跳转目标及 JSON response body 已支持。V3 backup schema v8 为静态重定向提供可选请求 header map；配置值按大小写不敏感方式覆盖页面同名请求头，空字符串是有效值，跨 origin 后移除 Authorization、Proxy-Authorization、Cookie 和 Cookie2；CORS 和浏览器禁止的请求头仍由浏览器处理，函数重定向不支持此配置。V2 `ignores` 的静态子串排除行为可在 V3 规则中手工重建；V2 文件和字段不会自动迁移。V3 还支持 schema v7 的受限 Fetch-only 函数重定向；这使用新的 V3 格式，不表示旧 V2 函数行为及数据格式兼容。V2 旧版规则中的 substring replacement 目前尚无 V3 同等能力。函数响应与函数重定向均仅作用于 Fetch，XHR 保持原响应或原 URL。备份恢复流程见 [V3 配置备份与恢复](V3-BACKUP-RESTORE.zh.md)。独立网页预览使用明确标注的内存样例；完整扩展包中的 `panels-v3/` 使用真实消息和 storage adapter。

## 迁移切片顺序

迁移顺序记录如下，各项均已落地：

1. 建立并独立构建 Vue 3 app shell、主题、状态和 i18n 适配。
2. 定义 V3 panel 和 service worker 消息 adapter，复用结构化协议，读取 storage 前执行 snapshot / validation。
3. 接入 redirect CRUD、JSON response CRUD、tags、Fetch 函数响应编辑和备份恢复。
4. 使用 CodeMirror 实现 V3 JSON / 函数编辑，不迁移无 V3 消费者的 Vue 2 Ace / JSONEditor wrapper。
5. V3 使用独立 schema / 备份格式，不自动迁移 V2 数据；规则按列表顺序选择首条命中规则。
6. 将正式 extension output 切换到 `panels-v3/`，并删除 workspace 内不再使用的 Vue 2 面板与编辑器源码及依赖。

V3 正式扩展构建只包含 `build/panels-v3/`。V3 extension smoke 从该页面读写真实配置，并验证 Fetch / XHR、V3 hit、备份恢复、popup 和 panel；Chrome Stable、Edge Stable 与固定最低版本浏览器矩阵由 CI 验收。备份恢复 smoke 覆盖导出 envelope、无效 JSON 不写入、函数代码规则计数提示和恢复后保持停用。Playwright 扩展自动化使用配套 Chromium；浏览器品牌 Stable 仍运行独立的运行时兼容性矩阵。

## 不变量

- 正式扩展默认入口为 Vue 3 `panels-v3/index.html`；V2 备份与规则不迁移，导入器必须拒绝不兼容格式且不写入数据。
- 正式构建产物只包含 `panels-v3/`；workspace 不保留 Vue 2 面板或其专用编辑器。
- 每个可独立验证的迁移切片已在 `refactor/v3` 单独提交、推送；正式入口切换已纳入 V3.0.0 发布候选。发布 tag 和商店审核状态见 [V3 发布记录](V3-RELEASE.zh.md)。

迁移前现状盘点和 V2 / Vue 3 风险热点见 `docs/V3-PANEL-IA.zh.md`。V3 消息与配置 adapter、redirect CRUD 与排除项、函数重定向、静态重定向 headers、JSON response CRUD、Fetch 函数响应编辑、备份恢复、标签管理与关联，以及扩展内请求验证已接入。V2 旧版 substring replacement 尚无 V3 同等能力；不兼容的 V2 数据只显示拒绝提示，不做自动转换。
