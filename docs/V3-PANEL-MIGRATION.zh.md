# Vue 3 面板迁移边界与实施顺序

## 当前切片

`packages/vue3-panels` 是正式 V3 Vue 3 / PrimeVue 面板 workspace package。它通过扩展消息读取校验后的 V3 快照、保存或清除 V3 配置，构建到 `packages/vue3-panels/dist/`，也由 `pnpm build` 纳入正式扩展。

正式面板和扩展默认入口现为 `panels-v3/`。Vue 2 的 `packages/vue-panels` 已退出正式构建与 CI 浏览器验收；旧面板源码及其编辑器包后续单独清理。`pnpm check:boundaries` 与生产布局 smoke 确认正式构建不依赖或打包 Vue 2 面板。

两套 Vue 运行时以 package 为边界并存，不能把 Vue 2 组件直接挂到 Vue 3 app，也不在同一个 app bundle 中混用。纯数据、协议和验证逻辑优先沿用 framework-free 包；具体 editor 需要 Vue 3 wrapper 后才接入。

Vue 3 候选面板已经接入 `vue-i18n` 11 Composition API，当前 shell 只提供简体中文与英文文案，规则动作使用稳定 ID，避免语言变化影响规则过滤。首次启动默认简体中文；`ajax-proxy-v3-locale` 只用于原型预览的 localStorage 偏好，后续接扩展设置 storage 时需迁移到正式设置适配器。V2 仍在生产运行期间不删除其旧 locale 资源，也不迁移 V2 的语言设置。源码盘点未发现 V2 实际使用的 router 或集中 store；Vue 3 暂不为匹配依赖清单而加入空壳路由 / store，若后续页面导航或共享状态出现实际需求再单独选型。

为保持 Vue 2.6.11 编辑器编译器与运行时匹配，workspace 对 `vue-template-compiler@2.6.11` 声明对应的 Vue 2.6.11 依赖，避免并存的 Vue 3 包导致 compiler 从 workspace 虚拟依赖目录误解析到 Vue 3。

V3 adapter 使用独立的 `GET_SNAPSHOT` / `SAVE_CONFIG` 协议，不复用 content script 到页面主世界的 `V3_CONFIG` 通知。service worker 只接受扩展内 `panels-v3/` 页面发送的请求；读配置时先运行 V3 backup 校验，再清理已知规则的命中计数；保存时同样校验并仅写 `V3_CONFIG`，`null` 只清除该配置键。V2 的配置和 storage 路径不参与此 adapter。Vue 3 客户端在发送前及接收后验证数据结构，并将扩展不可用 / 消息失败映射成稳定错误。

当前真实数据流程覆盖 V3 重定向 CRUD、字面 URL 排除项、静态重定向请求头、JSON 响应 CRUD、自定义 Fetch 函数响应编辑及 JSON 备份恢复：读取快照后按 action 展示规则；新增、编辑、删除、启停及调整数组顺序都会保存完整 V3 backup，顺序就是首条命中优先级。编辑组合规则会保留另一个 action；响应编辑保留未编辑 headers，删除 action 不会误删同规则内的另一个 action。JSON body 和状态码在保存前校验；语法诊断在浏览器提供解析位置时显示行 / 列，并提供对象、数组、字符串和 null 示例。字符串 / RE2 匹配、method、直接 HTTP(S) 或相对跳转目标及 JSON response body 已支持。V3 backup schema v8 为静态重定向提供可选请求 header map；配置值按大小写不敏感方式覆盖页面同名请求头，空字符串是有效值，跨 origin 后移除 Authorization、Proxy-Authorization、Cookie 和 Cookie2；CORS 和浏览器禁止的请求头仍由浏览器处理，函数重定向不支持此配置。V2 `ignores` 的静态子串排除行为可在 V3 规则中手工重建；V2 文件和字段不会自动迁移。V3 还支持 schema v7 的受限 Fetch-only 函数重定向；这使用新的 V3 格式，不表示旧 V2 函数行为及数据格式兼容。V2 旧版规则中的 substring replacement 目前尚无 V3 同等能力。函数响应与函数重定向均仅作用于 Fetch，XHR 保持原响应或原 URL。备份恢复流程见 [V3 配置备份与恢复](V3-BACKUP-RESTORE.zh.md)。独立网页预览使用明确标注的内存样例；完整扩展包中的 `panels-v3/` 使用真实消息和 storage adapter。

## 迁移切片顺序

1. 建立并独立构建 Vue 3 app shell、主题、路由 / 状态 / i18n 适配；保证生产 package 与 staging preview 的路径边界可检查。
2. 定义 V3 panel 和 service worker 消息 adapter，复用结构化协议，注册与清理 listener；读 storage 之前先完成 snapshot / validation API 的框架隔离。
3. 先迁独立叶子组件，再逐步接入 redirect CRUD 和 JSON response CRUD；tag 管理、详细命中工具和完整 interceptor 工作流作为后续切片。V3 Fetch 函数响应编辑和备份恢复现已接入 staging 面板。
4. 分别替换 Vue 2 code / JSON editor wrapper，确认异步加载、语言、键盘编辑、校验定位与生产体积。
5. 迁移规则创建 / 编辑和全局导入恢复流程。V3 使用独立 schema / 备份格式，不自动迁移 V2 数据；保持计划中已确认的单规则优先级与恢复校验流程。
6. 已将正式 extension output 切换到 `panels-v3/`，Chrome / Edge Stable 和最低版本浏览器矩阵继续验收；下一步移除 workspace 内不再使用的 Vue 2 面板与编辑器源码及依赖。

V3 正式扩展构建只包含 `build/panels-v3/`。V3 extension smoke 从该页面读写真实配置，并验证 Fetch / XHR、V3 hit、备份恢复、popup 和 panel；Chrome Stable、Edge Stable 与固定最低版本浏览器矩阵由 CI 验收。备份恢复 smoke 覆盖导出 envelope、无效 JSON 不写入、函数代码规则计数提示和恢复后保持停用。Playwright 扩展自动化使用配套 Chromium；浏览器品牌 Stable 仍运行独立的运行时兼容性矩阵。

## 不变量

- 正式扩展默认入口为 Vue 3 `panels-v3/index.html`；V2 备份与规则不迁移，导入器必须拒绝不兼容格式且不写入数据。
- 正式构建产物不包含 Vue 2 `panels/`；历史源码仅在清理切片期间留在 workspace。
- 每个可独立验证的迁移切片在 `refactor/v3` 单独提交、推送；正式切换是后续单独提交，不能和功能迁移混在一起。

迁移前现状盘点和 V2 / Vue 3 风险热点见 `docs/V3-PANEL-IA.zh.md`。V3 消息与配置 adapter、redirect CRUD 与排除项、函数重定向、静态重定向 headers、JSON response CRUD、Fetch 函数响应编辑、备份恢复、标签管理与关联，以及扩展内请求验证已接入。V2 旧版 substring replacement 尚无 V3 同等能力；不兼容的 V2 数据只显示拒绝提示，不做自动转换。
