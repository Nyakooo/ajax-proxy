# Ajax Proxy V3 测试约定

## 当前测试入口

- `pnpm test`：单次运行单元测试，包括 Fetch / XHR 第一条规则优先级、通知规则序号和徽章精确计数。
- `pnpm test:watch`：本地监听运行。
- `pnpm test:coverage`：运行测试并生成终端摘要及 `coverage/lcov.info`。
- `pnpm browser:smoke`：使用 `BROWSER_CHANNEL=chrome` 或 `msedge` 启动对应稳定版，检查核心 Fetch / Request、XHR、CSS 和减少动态效果 API。CI 分别运行 Chrome Stable 与 Edge Stable。
- `pnpm v3:browser:smoke`：临时 bundle V3 组合 Fetch / XHR 原型，在真实品牌浏览器页面验证首条规则的静态重定向、POST body、同规则响应 body / status 替换、XHR `open()` 凭证参数和事件回调代理语义；支持 Chromium、Chrome Stable 和 Edge Stable。CI 覆盖 Chrome / Edge Stable 与固定最低版本 Chrome 141 / Edge 140。该 smoke 不加载扩展，不能代替 extension runtime 集成验收。
- `pnpm extension:smoke`：在已构建产物上用临时持久化浏览器 profile 加载扩展，通过面板创建临时规则，验证 Fetch / XHR 响应拦截及 Fetch Response 元数据 / Content-Length 处理、`fetch(new Request(...))` 重定向的 method / body / headers / cookie、双标签同步、子 frame 拦截，以及关闭并重开浏览器后 service worker 冷启动读取已保存配置。另验证 JSON tree 模式的展开 / 折叠、类型识别、节点增删改、数组重排、撤销 / 重做。CI 在构建后执行该 smoke。
- 2026-09-26 在 macOS Chrome Stable 154.0.8037.58 手动加载本地生产扩展并做真实页面验证：V3 面板临时建立 status `209` 的 JSON 响应规则后，真实 Fetch 和 XHR 均返回配置的 status / body。验证后已删除临时规则并关闭本地测试服务；这项浏览器手工检查不属于 CI，自动扩展 E2E 仍由配套 Chromium 执行。
- 2026-09-26 从 `refactor/v3` 的干净 clone（`9c88d81cba601b4132b999164a41b1e4352c559f`）使用 Node 24.21.0 / pnpm 12.6.0 执行 `pnpm install --frozen-lockfile`、`pnpm clean:build`、`pnpm build`；确认 `packages/shell-chrome/build/manifest.json` 与 `packages/shell-chrome/build/panels-v3/index.html` 已生成。该干净构建之后，`pnpm typecheck`、`pnpm test:coverage`（34 个文件 / 323 项）、`pnpm test:v3-ui`（7 个文件 / 32 项）、`pnpm check:boundaries`、`pnpm check:generated-types`、`pnpm lint` 和 `pnpm format:check` 均通过。Chrome Stable 实际页面 Fetch / XHR 测试另见上一条；两者共同验证当前分支生产源码的构建与运行行为。
- `pnpm editor:smoke`：直接加载生产依赖中的 JSONEditor / Ace，输入非法 JSON 并确认错误行标记，CI 执行该 smoke。
- `pnpm format:check`：Prettier 严格检查计划、文档、根配置、CI workflow、迁移脚本与测试；全包格式基线检查登记了 50 个未格式化旧源码并禁止债务增加。
- `pnpm lint`：ESLint flat config 扫描所有 package 下的 JS、TS、Vue 文件，并严格检查新测试、浏览器 smoke、构建报告脚本和配置。全包当前零 error，最多允许 378 条既有源码 warning；新增迁移范围文件必须零 warning。
- `pnpm lint:all`：扫描所有 package 下 JS、TS 和 Vue 文件，CI 运行此全量扫描并用固定告警预算阻止债务增长。
- TypeScript 包另由 `pnpm typecheck` 检查；Vue SFC 暂未纳入类型检查。
- CI 使用 `pnpm test:coverage`，因此 PR 构建日志会留下可查看的初始覆盖率。

## 工具选择

- **纯逻辑 / TypeScript 单元测试：Vitest 5 + V8 coverage**。当前 Node 24.21.0 符合 Vitest 5 运行要求；项目根单独提供 Vite 6.4.3 作为 Vitest peer，proxy-lib 仍保留自己的 Vite 2 构建环境。参考 [Vitest 安装要求](https://vitest.dev/guide/) 和 [覆盖率配置](https://vitest.dev/config/coverage)。
- **Lint：ESLint 10 flat config + `typescript-eslint` + `eslint-plugin-vue`**。Vue 2 源码盘点使用 Vue 2 推荐规则；新代码先在 CI 阻塞检查，旧业务源码通过 `pnpm lint:all` 报告并逐步迁入。参考 [ESLint flat config](https://eslint.org/docs/latest/use/configure/configuration-files) 与 [eslint-plugin-vue Vue 2 配置](https://eslint.vuejs.org/user-guide/)。
- **Vue 组件测试：Vue Test Utils + jsdom**。当前 Vue 2 面板如需新增组件测试，使用与 Vue 2 匹配的版本；Vue 3 迁移时升级到对应版本，并继续由 Vitest 承载。首批先覆盖不依赖 DOM 的规则逻辑。
- **扩展集成 / E2E：Playwright**。扩展加载与 service worker / content script 测试使用 Playwright 配套 Chromium 的 persistent context。Playwright 文档指出，Chrome 与 Edge 已移除命令行侧载扩展所需的 flags；品牌浏览器 job 验证网页运行时能力，扩展 E2E 在配套 Chromium 验证。参考 [Playwright 扩展测试说明](https://playwright.dev/docs/chrome-extensions) 和 [浏览器通道说明](https://playwright.dev/docs/browsers)。

## 测试文件和隔离

- 纯逻辑测试放在对应 package 的 `test/` 目录，文件名使用 `*.test.ts`；Vitest 配置在根目录 `vitest.config.mjs`。
- 跨包 / 浏览器验证放在根目录 `tests/browser/`，以 `*-smoke.cjs` 命名；每项测试使用临时浏览器上下文，并在 `finally` 中关闭浏览器和本地服务。
- 测试通过模块别名访问 workspace 源码，不依赖先前构建出的旧产物。
- 测浏览器或扩展 API 时，优先注入 mock / adapter；不要让纯逻辑测试直接启动 Chrome API。
- 新测试按包归属；coverage 按风险分布逐步设门槛，不设会被低覆盖历史代码拖累的全局阈值。当前为 V3 backup 校验、规则匹配、Fetch / XHR 请求改写和 response action 文件单独设定 95% 分支覆盖门槛。

V3 核心文件门槛位于 `vitest.config.mjs`，按文件分别检查，旧 V2 代码和其他包不会被纳入这些门槛。截至 2026-09-26，`responseFunctionSandbox.ts` 分支覆盖 87.5%，`runtimeController.ts` 为 89.65%，尚未达 95%；暂不设阻塞门槛，并继续评估可达的高风险边界。全量语句、分支、函数和行覆盖仍通过 CI 报告跟踪。

## 覆盖率范围与质量评估

CI 运行 `pnpm test:coverage`，终端报告保存在构建日志，LCOV 输出到 `coverage/lcov.info`。覆盖率配置目前只统计 `packages/*/src/**/*.ts`；它是 TypeScript 单元测试趋势，不代表全部产品界面的覆盖情况，也不单独上传 LCOV artifact。

| 未计入 LCOV 的内容            | 原因                                                                       | 替代验证 / 跟踪方式                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Vue 单文件组件（`.vue`）      | 根 Vitest coverage 当前只包含 TypeScript 源码，SFC 模板与样式不进入该报告  | Vue 3 交互和关键流程通过 `pnpm test:v3-ui` 单独测试，扩展面板行为由 `pnpm extension:smoke` 端到端验证 |
| JavaScript 源码（`.js`）      | 不在 `coverage.include` 范围内；其中可执行逻辑不会出现在当前 LCOV 百分比中 | 有对应逻辑的服务 / 组件测试及浏览器 smoke 单独运行；不能把未收集覆盖率解释为已覆盖                    |
| 生成的声明文件（`.d.ts`）     | 类型声明没有运行时行为                                                     | `pnpm check:generated-types` 检查生成声明与源码一致                                                   |
| HTML、CSS、图标及其他静态资源 | 静态入口和资源没有适用的逐行执行覆盖率                                     | 由生产构建、编辑器 smoke 和品牌浏览器页面 smoke 检查加载及关键交互                                    |

测试质量以行为断言、边界输入、错误注入和缺陷回归为主。已评估 mutation testing：当前不把 mutation 工具加入每次 CI，因为优先保障高风险行为回归与逐文件分支门槛，避免增加整套 mutation 运行和维护成本；核心模块门槛或行为覆盖停滞时再按包评估。

## 当前覆盖率基线

记录日期：2026-09-25。执行 `pnpm test:coverage`：10 个测试文件、53 个用例通过；workspace 全部 TypeScript 源码的当前总体覆盖率为：

| 指标       |   基线 |
| ---------- | -----: |
| Statements | 56.43% |
| Branches   | 52.13% |
| Functions  | 53.40% |
| Lines      | 58.02% |

本轮单元测试覆盖注入前页面包装器、扩展启停和模式更新、扩展外层页面包装器保留与同模式重新启用、扩展 storage cache 跨上下文事件 / 初始化竞态 / 初始化失败 / 配额写入失败、普通网页 localStorage 初始化 / 读写 / 清空 / 跨标签更新、V3 backup JSON 解析 / 字段路径错误 / V2 格式拒绝 / 含函数代码导入停用、系统通知创建和点击，以及规则 URL 匹配、Fetch Request / 响应边界、callback / Promise 处理、Fetch 与 XHR 首条命中、重定向 XHR method mismatch、同步 XHR `open()`、XHR 实例复用及函数异常回退、service worker 徽章按规则序号精确计数。proxy-lib 的 createFetch statements 覆盖率为 89.65%，createXHR 为 82.66%，redirectXHR 为 85.52%；storage 为 63.97%，V3 domain schema 为 64.56%，service-worker notice 为 52.38%，lib 生命周期入口为 65.67%，badge 为 72.34%。Chrome 扩展 smoke 验证活动标签标题、多标签 / iframe 配置同步和同一持久化 profile 关闭重开后的 service worker 冷启动。浏览器 smoke 还覆盖 Request POST 参数、Response 元数据与 Content-Length 清理，以及 JSON 编辑交互，但不计入 Vitest coverage。整体覆盖率低于完整发布标准，后续将分阶段增加各包测试。该基线不代表功能质量已经满足发布标准。
