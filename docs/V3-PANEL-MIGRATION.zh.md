# Vue 3 面板迁移边界与实施顺序

## 当前切片

`packages/vue3-panels` 是独立的 Vue 3 / PrimeVue 候选面板 workspace package。它从已验收的品牌和交互原型演进，配置 service 通过扩展消息读取校验后的 V3 快照、保存或清除 V3 配置。它单独构建到 `packages/vue3-panels/dist/`，可以用 `pnpm build:v3-panels` 构建。

现有正式面板仍是 `packages/vue-panels`（Vue 2 + Element UI），service worker 继续打开 `panels/index.html`。根 `pnpm build` 的 `pkg` 步骤会把 Vue 2 复制到 `packages/shell-chrome/build/panels`，并把 Vue 3 候选版本独立暂存到 `packages/shell-chrome/build/panels-v3`，供显式加载和真实扩展验证使用。扩展默认入口及 V2 构建来源保持不变。`pnpm check:boundaries` 包含隔离检查，确保两个面板的依赖和打包路径仍独立。

两套 Vue 运行时以 package 为边界并存，不能把 Vue 2 组件直接挂到 Vue 3 app，也不在同一个 app bundle 中混用。纯数据、协议和验证逻辑优先沿用 framework-free 包；具体 editor 需要 Vue 3 wrapper 后才接入。

Vue 3 候选面板已经接入 `vue-i18n` 11 Composition API，当前 shell 只提供简体中文与英文文案，规则动作使用稳定 ID，避免语言变化影响规则过滤。首次启动默认简体中文；`ajax-proxy-v3-locale` 只用于原型预览的 localStorage 偏好，后续接扩展设置 storage 时需迁移到正式设置适配器。V2 仍在生产运行期间不删除其旧 locale 资源，也不迁移 V2 的语言设置。源码盘点未发现 V2 实际使用的 router 或集中 store；Vue 3 暂不为匹配依赖清单而加入空壳路由 / store，若后续页面导航或共享状态出现实际需求再单独选型。

为保持 Vue 2.6.11 编辑器编译器与运行时匹配，workspace 对 `vue-template-compiler@2.6.11` 声明对应的 Vue 2.6.11 依赖，避免并存的 Vue 3 包导致 compiler 从 workspace 虚拟依赖目录误解析到 Vue 3。

V3 adapter 使用独立的 `GET_SNAPSHOT` / `SAVE_CONFIG` 协议，不复用 content script 到页面主世界的 `V3_CONFIG` 通知。service worker 只接受扩展内 `panels-v3/` 页面发送的请求；读配置时先运行 V3 backup 校验，再清理已知规则的命中计数；保存时同样校验并仅写 `V3_CONFIG`，`null` 只清除该配置键。V2 的配置和 storage 路径不参与此 adapter。Vue 3 客户端在发送前及接收后验证数据结构，并将扩展不可用 / 消息失败映射成稳定错误。

当前真实数据流程覆盖 V3 重定向 CRUD、JSON 响应 CRUD、自定义 Fetch 函数响应编辑及 JSON 备份恢复：读取快照后按 action 展示规则；新增、编辑、删除、启停及调整数组顺序都会保存完整 V3 backup，顺序就是首条命中优先级。编辑组合规则会保留另一个 action；响应编辑保留未编辑 headers，删除 action 不会误删同规则内的另一个 action。JSON body 和状态码在保存前校验；语法诊断在浏览器提供解析位置时显示行 / 列，并提供对象、数组、字符串和 null 示例。字符串 / RE2 匹配、method、直接 HTTP(S) 或相对跳转目标及 JSON response body 已支持。V2 专有的 substring replacement、headers、ignores 和 redirect function 尚未迁移；函数响应仅支持 Fetch，XHR 保持原响应。备份恢复流程见 [V3 配置备份与恢复](V3-BACKUP-RESTORE.zh.md)。独立网页预览使用明确标注的内存样例；完整扩展包中的 `panels-v3/` 使用真实消息和 storage adapter。

## 迁移切片顺序

1. 建立并独立构建 Vue 3 app shell、主题、路由 / 状态 / i18n 适配；保证生产 package 与 staging preview 的路径边界可检查。
2. 定义 V3 panel 和 service worker 消息 adapter，复用结构化协议，注册与清理 listener；读 storage 之前先完成 snapshot / validation API 的框架隔离。
3. 先迁独立叶子组件，再逐步接入 redirect CRUD 和 JSON response CRUD；tag 管理、详细命中工具和完整 interceptor 工作流作为后续切片。V3 Fetch 函数响应编辑和备份恢复现已接入 staging 面板。
4. 分别替换 Vue 2 code / JSON editor wrapper，确认异步加载、语言、键盘编辑、校验定位与生产体积。
5. 迁移规则创建 / 编辑和全局导入恢复流程。V3 使用独立 schema / 备份格式，不自动迁移 V2 数据；保持计划中已确认的单规则优先级与恢复校验流程。
6. 创建独立 staging extension output，以 `panels-v3/` 验收 Chrome 与 Edge 当前 Stable。通过所有行为检查后，另开切换提交：只让正式 `pkg` 复制 V3 dist 到既有 `panels/` 地址；再删除 V2 build 输入与不再使用的 Vue 2 依赖。

V3 staging 已加入根 `pnpm build`，把 Vue 3 build 复制到 `build/panels-v3/`，仍保留 Vue 2 `build/panels/` 为默认路径。扩展 smoke 会从 `panels-v3/` 真实打开面板，通过 UI 保存规则、重载读回，并验证 Fetch 响应及 V3 hit；Chrome for Testing 154 与 Edge Stable 153 已通过。备份恢复 smoke 覆盖导出 envelope、无效 JSON 不写入、函数代码规则计数提示和恢复后保持停用。品牌 Chrome 137 及更新版本已禁用自动化 `--load-extension` 命令行参数，因此本地自动化使用同主版本的 Chrome for Testing。

## 不变量

- 在单独批准和验收切换之前，默认入口仍为 Vue 2 `panels/index.html`；Vue 3 `panels-v3/index.html` 仅供 staging 验证。
- staging extension 使用不同输出目录，不清理、覆盖或打包为生产目录。
- 每个可独立验证的迁移切片在 `refactor/v3` 单独提交、推送；正式切换是后续单独提交，不能和功能迁移混在一起。

迁移前现状盘点和 V2 / Vue 3 风险热点见 Codex 执行记录及 `docs/V3-PANEL-IA.zh.md`。V3 消息与配置 adapter、redirect CRUD、JSON response CRUD、Fetch 函数响应编辑、备份恢复、标签管理与关联、独立 staging 打包和扩展内请求验证已接入；V2 专有高级 redirect 能力和默认面板切换仍待实施。Chrome Stable 品牌浏览器的扩展验收仍在进行。
