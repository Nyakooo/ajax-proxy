# Vue 3 面板迁移边界与实施顺序

## 当前切片

`packages/vue3-panels` 是独立的 Vue 3 / PrimeVue 候选面板 workspace package。它从已验收的品牌和交互原型演进，页面展示仍使用内存样例；配置 service 可通过扩展消息读取校验后的 V3 快照、保存或清除 V3 配置，但尚未接入真实组件的数据流。它构建到自己的 `packages/vue3-panels/dist/`，可以用 `pnpm build:v3-panels` 单独构建。

现有正式面板仍是 `packages/vue-panels`（Vue 2 + Element UI），根 `pnpm build` 的 `pkg` 步骤仍从 `packages/vue-panels/dist` 复制到 `packages/shell-chrome/build/panels`。service worker 继续打开 `panels/index.html`。本阶段不改变 manifest、正式 shell 路径或 V2 build / pkg 输入。`pnpm check:boundaries` 包含 Vue 3 面板隔离检查，防止误引 Element UI、Vue 2 editor wrapper 或改动正式打包来源。

两套 Vue 运行时以 package 为边界并存，不能把 Vue 2 组件直接挂到 Vue 3 app，也不在同一个 app bundle 中混用。纯数据、协议和验证逻辑优先沿用 framework-free 包；具体 editor 需要 Vue 3 wrapper 后才接入。

Vue 3 候选面板已经接入 `vue-i18n` 11 Composition API，当前 shell 只提供简体中文与英文文案，规则动作使用稳定 ID，避免语言变化影响规则过滤。首次启动默认简体中文；`ajax-proxy-v3-locale` 只用于原型预览的 localStorage 偏好，后续接扩展设置 storage 时需迁移到正式设置适配器。V2 仍在生产运行期间不删除其旧 locale 资源，也不迁移 V2 的语言设置。源码盘点未发现 V2 实际使用的 router 或集中 store；Vue 3 暂不为匹配依赖清单而加入空壳路由 / store，若后续页面导航或共享状态出现实际需求再单独选型。

为保持 Vue 2.6.11 编辑器编译器与运行时匹配，workspace 对 `vue-template-compiler@2.6.11` 声明对应的 Vue 2.6.11 依赖，避免并存的 Vue 3 包导致 compiler 从 workspace 虚拟依赖目录误解析到 Vue 3。

V3 adapter 使用独立的 `GET_SNAPSHOT` / `SAVE_CONFIG` 协议，不复用 content script 到页面主世界的 `V3_CONFIG` 通知。service worker 只接受扩展内 `panels-v3/` 页面发送的请求；读配置时先运行 V3 backup 校验，再清理已知规则的命中计数；保存时同样校验并仅写 `V3_CONFIG`，`null` 只清除该配置键。V2 的配置和 storage 路径不参与此 adapter。Vue 3 客户端在发送前及接收后验证数据结构，并将扩展不可用 / 消息失败映射成稳定错误。

## 迁移切片顺序

1. 建立并独立构建 Vue 3 app shell、主题、路由 / 状态 / i18n 适配；保证生产 package 与 staging preview 的路径边界可检查。
2. 定义 V3 panel 和 service worker 消息 adapter，复用结构化协议，注册与清理 listener；读 storage 之前先完成 snapshot / validation API 的框架隔离。
3. 先迁独立叶子组件，再迁 redirector 规则 CRUD 验证存储与消息闭环；interceptor 列表最后迁，因为它读取命中计数的真实存储并连接 tag、modal 和 editor。
4. 分别替换 Vue 2 code / JSON editor wrapper，确认异步加载、语言、键盘编辑、校验定位与生产体积。
5. 迁移规则创建 / 编辑和全局导入恢复流程。V3 使用独立 schema / 备份格式，不自动迁移 V2 数据；保持计划中已确认的单规则优先级与恢复校验流程。
6. 创建独立 staging extension output，以 `panels-v3/` 验收 Chrome 与 Edge 当前 Stable。通过所有行为检查后，另开切换提交：只让正式 `pkg` 复制 V3 dist 到既有 `panels/` 地址；再删除 V2 build 输入与不再使用的 Vue 2 依赖。

## 不变量

- 在单独批准和验收切换之前，生产 `pkg` 源保持 `packages/vue-panels/dist`，service worker URL 保持 `panels/index.html`。
- staging extension 使用不同输出目录，不清理、覆盖或打包为生产目录。
- 每个可独立验证的迁移切片在 `refactor/v3` 单独提交、推送；正式切换是后续单独提交，不能和功能迁移混在一起。

迁移前现状盘点和 V2 / Vue 3 风险热点见 Codex 执行记录及 `docs/V3-PANEL-IA.zh.md`。V3 消息与配置 adapter 基础已完成；真实组件数据流接入、staging extension 与 Chrome / Edge 加载验证尚未开始。
