# Ajax Proxy V3 现状基线

盘点日期：2026-09-24
分支 / 基线：`refactor/v3`，HEAD `d4c4edb`（合并 PR #52；版本标签 `v2.2.10`）

本文件记录代码和仓库中可确认的事实，以及维护者在执行期间确认的 V3 决策。问题按“已复现”与“待验证线索”区分登记，详见 `docs/V3-ISSUES.zh.md`；已复现缺陷仍需修复并补持久化回归覆盖。

目录结构、包边界、构建产物归属和 V3 迁移建议见 `docs/V3-ARCHITECTURE-ASSESSMENT.zh.md`；评估与实际迁移状态分别记录。

## 仓库与包

| 包                        | 当前职责                                   | 主要依赖 / 构建入口                                                                    |
| ------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------- |
| `@proxy/protocol`         | 浏览器无关的消息协议和存储 key             | TypeScript `tsc`；shared-utils 与 proxy-lib 的依赖叶子                                 |
| `@proxy/shared-utils`     | 环境判断、存储、通知及通用操作             | TypeScript `tsc`、Chrome 类型                                                          |
| `@proxy/lib`              | Fetch / XHR 拦截、重定向和函数式响应       | TypeScript + Vite 2；依赖 shared-utils                                                 |
| `@proxy/v2-compatibility` | V2 旧版配置到当前结构的转换                | TypeScript；依赖 proxy-lib                                                             |
| `@proxy/shell-chrome`     | 扩展 content script、service worker 与打包 | Webpack 5；依赖 v2-compatibility、proxy-lib、shared-utils；Manifest V3                 |
| `@proxy/vue-panels`       | 规则面板与存储交互                         | Vue 2.6、Vue CLI 5.0.9、Element UI 2；依赖 v2-compatibility、shared-utils 及两个编辑器 |
| `@proxy/code-editor`      | Vue 代码编辑器组件                         | Vue 2.6、Ace                                                                           |
| `@proxy/json-editor`      | JSON 编辑器组件                            | Vue 2.6、jsoneditor                                                                    |

workspace 使用 pnpm，范围为 `packages/**`。根项目版本为 `2.2.10`。Node 固定为 `24.21.0`（`.nvmrc`、引擎范围 `>=24.21.0 <25`），根项目声明 `pnpm@12.6.0`。原锁文件为 pnpm 7 格式，已迁移到 pnpm 12 的 lockfile v9；冻结安装通过。`esbuild` 与 `@parcel/watcher` 显式允许安装脚本，`core-js`、`cssnano` 和 `fsevents` 显式拒绝安装脚本。

## 工程入口与发布

根脚本提供面板开发、库 / 扩展 watch、分包 build、总 build、拷贝面板产物、zip 和交互式版本更新。`release.js` 仅同步根 `package.json` 与扩展 manifest 的版本号。`.github/workflows/ci.yml` 已配置 PR 及 `master` / `refactor/v3` push 工作流，固定 pnpm 12.6.0，按 `.nvmrc` 安装 Node，并执行冻结安装、workspace 边界检查、全包 lint / 格式基线、五个 TypeScript 包检查、Vitest 单元测试 / 覆盖率、生产构建、生成声明一致性检查、ZIP 打包和体积报告。另有 Chrome Stable / Edge Stable 运行时矩阵、固定最低版本 Chrome 141 / Edge 140 运行时及扩展 E2E。Chrome 141 本机最低版本验证已通过；Edge 140 品牌浏览器步骤已配置 CI，尚未由远端 CI 执行。

统一命令包括 `pnpm typecheck`（protocol、shared-utils、proxy-lib、v2-compatibility、shell-chrome）、`pnpm test`、`pnpm test:coverage`、`pnpm lint`、`pnpm lint:migrated`、`pnpm lint:all`、`pnpm format:check`、`pnpm format:strict`、`pnpm build`、`pnpm zip` 和 `pnpm size:report`。全量 lint 已扫描所有包；当前旧业务源码固定为 378 条既有告警上限（零错误），迁移测试 / 脚本严格零告警，格式检查用 50 个未格式化旧文件清单阻止债务扩大，新迁移文件严格检查。声明文件由 TypeScript 生成并随源码提交，CI 构建后校验与源码同步。Vue SFC 专项类型检查尚未覆盖。Vitest 5 + V8 coverage 已配置，测试别名直接指向 workspace 源码；首批 7 个规则匹配 / 静态重定向用例通过，初始覆盖率见 `docs/V3-TESTING.zh.md`。Node 24 下完整生产构建已通过；旧 Webpack 工具链需要在构建命令中设置 `NODE_OPTIONS=--openssl-legacy-provider`，Vue CLI 仍输出 CSS export 警告，详见“阶段 1 执行结果”。

## 当前产品与兼容事实

- README 将产品定位为 Chromium 内核浏览器扩展，并链接 Chrome Web Store 和 Edge Add-ons；Manifest 使用 V3。V3 首发目标为 Chrome 与 Edge 稳定版。初始最低版本锁定为 Chrome 141、Edge 140，每季度复核并提前公告停止支持的版本。Beta / Dev 不在支持范围内；非核心的新 API / CSS 能力应提供降级行为。Chrome / Edge 当前 Stable 的扩展 Fetch / XHR 拦截已手动验证；Chrome 141 本机扩展 smoke 已通过，Edge 140 固定版本验证已加入 CI，等待远端执行。
- Manifest 注入 `<all_urls>`、`document_start`、`all_frames` content script，并将 `document.js` 暴露给 `<all_urls>`。
- 配置包含全局启停、`interceptor` / `redirector` 模式、拦截规则、重定向规则；规则可包含 URL/正则、method、覆盖内容 / 状态码、函数响应、请求头、忽略列表和命中数。
- 面板主流程包含全局开关、模式切换、语言选择、JSON 备份 / 恢复，以及拦截和重定向规则列表编辑；拦截规则支持标签管理。
- `@proxy/v2-compatibility` 存在旧字段 `proxy_routes` / `redirect` 与新字段 `interceptors` / `redirectors` 的转换；函数式响应示例公开在 `README.func.md`。
- V2 当前通过 `@proxy/v2-compatibility` 识别旧字段并转换到 V2 新字段；面板的空数组导入不会覆盖原有列表，结构校验较浅。这些是 V2 基线事实。
- 维护者已确认 V3 不兼容 V2 配置 / 规则 / 备份，不提供自动迁移或转换工具。V3 需设计新 schema、格式版本标识、校验及清楚的不兼容提示；V3 导入器应识别 V2 格式并明确提示不兼容。
- V3 规则模型已定义完整备份快照语义：必需规则字段中的空数组清空现有列表，缺失 / `null` / 错类型拒绝；面板清空需要确认，空规则备份可以导出。schema / importer 实现及测试仍未完成。
- 维护者新增组合式规则方向：一条规则可按需同时定义请求重定向与响应拦截 / 替换；阶段 2 先设计架构、数据模型、执行阶段、能力开关、优先级、冲突统计与失败回退，再决定实现边界。设计稿建议对同一请求采用规则列表中的首条命中规则，规则内的重定向与响应替换分别启用；Fetch / XHR 的实现差异（特别是 XHR 响应替换及同步请求）仍需原型验证。
- V3 面板首选 PrimeVue 4 styled 主题及自定义 token；先验证 Pass Through / unstyled，仅当主题 token 无法满足品牌视觉时再考虑 Tailwind CSS v4，不同时采用 Tailwind 与 UnoCSS。组件按需引入，并用生产构建比较体积、可访问性、交互质量和自定义成本。
- 启用 / 命中反馈方向包括扩展图标或徽章，以及网页视口边缘轻量光晕。页面提示不能遮挡或拦截交互，应避免高频动画，支持 `prefers-reduced-motion` 和关闭动画，并验证多 frame、SPA、滚动和不同尺寸。
- 阶段 1 的初始生产体积基线已记录在 `docs/V3-SIZE-BASELINE.zh.md`，并提供 `pnpm size:report` 重现；这是当前 V2 产物基线，V3 预算待 UI / 编辑器原型后确定。编辑器源码静态导入，Ace / JSONEditor 当前位于面板主 JS chunk，尚未按需加载；首屏 app JS、无独立异步编辑器 chunk、扩展 JS / CSS 与 ZIP 均有生产数据，见 `docs/V3-EDITOR-ASSESSMENT.zh.md`。

## 源码审查线索与影响分类

下表除已明确标注的 Fetch method 项外，均为静态代码审查线索，尚未用可复现步骤验证；不要当作已确认缺陷。复现状态、步骤及任务跟踪见 `docs/V3-ISSUES.zh.md`。

### 疑似行为缺陷

| 线索                                                                                                                       | 可能影响                                                                           | 需要复现确认                                                      |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **已复现：** Fetch method 只从 `init.method` 读取；Request 自身的 POST 未能命中 POST 规则。函数上下文也从 `init.body` 读取 | `fetch(new Request(...))` 的规则 method 匹配错误，函数上下文可能拿错 method / body | 复现和高优先级修复任务见 `docs/V3-ISSUES.zh.md`、GitHub issue #56 |
| Fetch 重定向构造 `customInit` 时可能只保留新 headers，没有合并原始 Request 的请求选项                                      | credentials、signal、mode、body 等行为可能变化                                     | 对 Request 与 init 多种组合检查重定向前后请求属性                 |
| 拦截循环可能继续覆盖前一结果并逐条通知；重定向在 method 不匹配时会 `break`                                                 | 多条规则的最终响应、优先级和命中数可能与用户预期不符                               | 同时设置两条可区分规则，记录最终结果和通知次数                    |
| 响应替换无条件创建带 body 的 Response 并复用原 headers                                                                     | 无 body 状态码、`Content-Length` 等组合可能产生无效响应                            | 覆盖 204 / 304、正文长度变化及读取失败                            |
| XHR 的 `open()` 被异步函数覆盖                                                                                             | `open(..., false)` 同步请求语义和原生调用时序可能改变                              | 检查同步与异步请求、重复 open、header 和事件顺序                  |

### 技术债与维护风险

| 线索                                  | 风险                                                           |
| ------------------------------------- | -------------------------------------------------------------- |
| 用户函数通过 `window.eval` 执行       | 执行边界、异常、未调用 `next` 和超时策略不明确，需纳入安全审查 |
| 当前编辑器依赖静态进入面板主 JS chunk | 首屏资源较大；已有体积基线证明 Ace / JSONEditor 位于主 chunk   |

### 产品语义待决

- 多条规则的优先级和拦截 / 重定向组合语义：阶段 2 讨论稿建议第一条完整命中规则负责请求全程，见 `docs/V3-RULE-MODEL.zh.md`。
- V2 空规则列表导入沿用既有无操作行为；V3 则按 `docs/V3-RULE-MODEL.zh.md` 的完整快照语义将空数组解释为清空。

## 阶段 1 执行结果

- 本机 nvm 已安装并切换到 Node `24.21.0`；pnpm 固定为 `12.6.0`，`pnpm install --frozen-lockfile` 成功。
- 原 pnpm 7 锁文件已升级到 lockfile v9；Vue CLI service 和插件升级到 `5.0.9`，编辑器 Vue runtime / template compiler 对齐到 `2.6.11`，TypeScript 升级到 `6.0.3`。
- TypeScript 6 所需的 `moduleResolution: Bundler` 等配置已更新；workspace 全量构建按包依赖顺序生成产物并通过。
- `pnpm clean:build` 会清理编辑器库、代理库、shared-utils、扩展 build 和面板 dist；私有编辑器库仅构建其 package `main` 使用的 CommonJS 格式，避免多格式并行构建争写同名 CSS 文件。空产物 clean build 与扩展 E2E 已通过。
- `pnpm build` 已通过。旧 Webpack / 缓存依赖在 Node 24 默认 OpenSSL 配置下会触发 `ERR_OSSL_EVP_UNSUPPORTED`，因此当前 Vue/Webpack 构建脚本设置 `NODE_OPTIONS=--openssl-legacy-provider`。这是兼容旧构建依赖的临时措施，升级构建器后应移除。Vue CLI 构建仍有 CSS export 警告（json-editor 1 条、vue-panels 约 30 条），虽不阻断构建，仍需归类处理。
- CI 固定 Node / pnpm，执行冻结依赖安装、workspace 包依赖边界检查、全包 lint / 格式基线检查、五个 TypeScript 包类型检查、Vitest 单元测试 / 覆盖率、生产构建、声明文件一致性检查、ZIP 打包和体积报告；另运行 Chrome Stable / Edge Stable smoke、Chrome 141 / Edge 140 最低版本 smoke 及扩展 Fetch / XHR E2E。全包扫描有固定旧 lint 告警预算 378 条及 50 个旧文件格式债务清单；Vue SFC 专项类型检查未覆盖。Chrome 141 本机扩展验证通过，Edge 140 品牌浏览器步骤已配置但待远端 CI 运行。
- Vue Test Utils + jsdom 已选为后续组件测试工具，尚未安装或验证；Playwright 已安装并通过 persistent Chromium context 验证扩展面板规则创建及 Fetch / XHR 拦截。规则匹配与静态重定向首批 7 项单元测试通过；workspace TS 源码整体初始覆盖率为 statements 8.46%、branches 4.69%、functions 5.55%、lines 8.39%，详见 `docs/V3-TESTING.zh.md`。覆盖率暂用于风险分布基线，不设全局阻塞阈值。
- 当前 V2 构建的体积初始基线和可重复报告已完成，见 `docs/V3-SIZE-BASELINE.zh.md`；编辑器打包审查发现 Ace / JSONEditor 在主 chunk，延迟加载目标尚未实施。最终 V3 预算仍待 UI 原型。
- Chrome / Edge 浏览器支持策略和 API 盘点已写入 `docs/V3-BROWSER-COMPATIBILITY.zh.md`，初始最低版本锁定为 Chrome 141 / Edge 140；Stable 手动集成验证完成，Chrome 141 最低版本已本机验证，Edge 140 品牌浏览器 CI 步骤已配置。阶段 0 / 1 的工程验收已完成；季度复核是持续维护任务。

## V3 决策与待完成项

- V3 范围、关键用户流程，以及哪些 Issue 需求必须进入首发。
- 完成 `docs/V3-BROWSER-COMPATIBILITY.zh.md` 中的 Chrome / Edge 扩展 API 盘点，锁定最低版本，并纳入 CI / 发布检查。
- 组合式规则和多规则优先级、冲突及失败回退语义；建议见 `docs/V3-RULE-MODEL.zh.md`，仍待维护者确认并通过 Fetch / XHR 原型验证。
- 保留函数式规则的范围和超时行为。
- Node 官方在盘点日将 24.x 列为 LTS（24.21.0）；参考：[Node.js Releases](https://nodejs.org/en/about/previous-releases)、[Node.js 24.21.0 发布公告](https://nodejs.org/en/blog/release/v24.21.0)。

Node 目标已按计划中的“最新 LTS”原则确定为 `24.21.0`；本机与 package 声明及 CI 已固定。组合式规则、浏览器滚动支持窗口、PrimeVue 主题化、体积预算和启用 / 命中提示是本轮新增的 V3 设计重点。
