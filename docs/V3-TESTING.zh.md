# Ajax Proxy V3 测试约定

## 当前测试入口

- `pnpm test`：单次运行单元测试，包括 Fetch / XHR 第一条规则优先级、通知规则序号和徽章精确计数。
- `pnpm test:watch`：本地监听运行。
- `pnpm test:coverage`：运行测试并生成终端摘要及 `coverage/lcov.info`。
- `pnpm browser:smoke`：使用 `BROWSER_CHANNEL=chrome` 或 `msedge` 启动对应稳定版，检查核心 Fetch / Request、XHR、CSS 和减少动态效果 API。CI 分别运行 Chrome Stable 与 Edge Stable。
- `pnpm extension:smoke`：在已构建产物上用隔离临时浏览器 profile 加载扩展，通过面板创建临时规则，验证 Fetch / XHR 响应拦截及 Fetch Response 元数据 / Content-Length 处理、`fetch(new Request(...))` 重定向的 method / body / headers / cookie，以及 JSON tree 模式的展开 / 折叠、类型识别、节点增删改、数组重排、撤销 / 重做。CI 在构建后执行该 smoke。
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
- 新测试按包归属；coverage 首先用于记录当前风险分布，暂不设会阻塞重构的全局阈值。

## 当前覆盖率基线

记录日期：2026-09-25。执行 `pnpm test:coverage`：8 个测试文件、40 个用例通过；workspace 全部 TypeScript 源码的当前总体覆盖率为：

| 指标       |   基线 |
| ---------- | -----: |
| Statements | 50.36% |
| Branches   | 48.63% |
| Functions  | 45.62% |
| Lines      | 51.53% |

本轮单元测试覆盖注入前页面包装器、扩展启停和模式更新、扩展外层页面包装器保留与同模式重新启用、storage cache 跨上下文事件 / 初始化竞态，以及规则 URL 匹配、Fetch Request / 响应边界、callback / Promise 处理、Fetch 与 XHR 首条命中、重定向 XHR method mismatch、同步 XHR `open()`、XHR 实例复用及函数异常回退、service worker 徽章按规则序号精确计数。proxy-lib 的 createFetch statements 覆盖率为 89.65%，createXHR 为 82.66%，redirectXHR 为 85.52%；storage 为 35.71%，lib 生命周期入口为 65.67%，badge 为 72.34%。Chrome 扩展 smoke 在两个同时打开的标签页验证面板更新后 Fetch / XHR 拦截及 Fetch 重定向均能同步。浏览器 smoke 还覆盖 Request POST 参数、Response 元数据与 Content-Length 清理，以及 JSON 编辑交互，但不计入 Vitest coverage。整体覆盖率低于完整发布标准，后续将分阶段增加各包测试。该基线不代表功能质量已经满足发布标准。
