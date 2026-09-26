# Ajax Proxy V3 全面重构计划

> 目标：在保持 Ajax Proxy 核心用途的基础上，完成工程现代化、核心问题修复、安全加固、界面重构和功能完善。
> 原则：按可独立审查、测试和交付的阶段推进；每项工作都应有明确验收结果。计划随项目进展持续维护。

阶段交付约定：每完成一个阶段的验收，就汇报该阶段结果与 V3 整体完成度，并将该阶段内容整理为独立 commit，便于逐阶段审阅。未达到验收条件的工作保持进行中，不以 commit 替代阶段验收。

## 1. 重构愿景

V3 是 Ajax Proxy 的一次全面升级，Vue 3 迁移只是其中一部分。计划覆盖：

- 工程与运行环境：采用实施时最新的 Node.js LTS，并更新配套工具链。
- 代码结构：梳理项目目录、包职责、模块边界和依赖关系，建立清晰、完整、易维护的代码架构。
- 核心能力：修复拦截、重定向、规则匹配和状态同步问题，并设计新的 V3 配置模型。
- 安全性：审查扩展权限、脚本执行、消息边界和输入校验。
- 品牌与用户体验：重新设计 Logo 和视觉识别，并升级界面、操作流程和调试反馈。
- 质量保障：建立覆盖核心行为、界面交互和扩展实际运行的自动化测试。
- 可持续发布：完善文档、CI、版本管理和发布检查。

## 2. 阶段总览

| 阶段 | 名称                   | 主要交付物                                             |
| ---- | ---------------------- | ------------------------------------------------------ |
| 0    | 范围与现状基线         | 功能清单、V3 数据格式策略、验收范围                    |
| 1    | 工程基础与测试起步     | 新版 Node / 工具链、统一检查、CI、测试框架和覆盖率基线 |
| 2    | 代码架构与核心问题修复 | 清晰模块边界、组合式规则、可靠请求行为和稳定状态       |
| 3    | 安全与兼容性           | 权限审查、输入校验、注入兼容和扩展冲突诊断             |
| 4    | Vue 3、品牌与界面重构  | Vue 3、新 Logo、新视觉系统和规则管理体验               |
| 5    | 新功能筛选与实施       | 经需求评估并确认纳入 V3 的功能                         |
| 6    | 测试完善与质量验收     | 核心回归、组件、集成、端到端测试及覆盖率目标           |
| 7    | 文档与发布             | V3 文档、迁移说明、发布和回滚流程                      |

## 3. 分阶段待办

### 阶段 0：范围与现状基线

- [x] 盘点 monorepo 中所有包、依赖、构建脚本和发布流程（见 `docs/V3-BASELINE.zh.md`）。
- [x] 专项评估目录结构是否适合 V3：检查包边界、源码与构建产物是否混放、跨包依赖方向、Vue 面板内部按业务域拆分、测试 / fixtures / 文档 / 脚本归属，并给出迁移方案与风险清单（见 `docs/V3-ARCHITECTURE-ASSESSMENT.zh.md`；执行迁移仍是阶段 1 / 2 工作）。
- [x] 梳理 V2 已有功能、用户流程、规则格式和浏览器发布渠道；V3 初始浏览器最低版本为 Chrome 141 / Edge 140（见 `docs/V3-BASELINE.zh.md` 与 `docs/V3-BROWSER-COMPATIBILITY.zh.md`）。
- [x] 建立问题登记并区分已复现缺陷、未验证代码审查线索、技术债和待决语义（Fetch Request method 缺陷已通过临时 Vitest 复现，详见 `docs/V3-ISSUES.zh.md`）；修复和持久化回归测试留在阶段 2。
- [x] 确认 V3 不承诺兼容 V2 配置、规则或备份格式；V3 可采用不兼容的新数据模型。
- [x] 确定目标浏览器及最低版本，并盘点扩展 API / Manifest V3 支持情况（Chrome 与 Edge 稳定版；初始最低主版本分别为 Chrome 141、Edge 140，见 `docs/V3-BROWSER-COMPATIBILITY.zh.md`）。实际浏览器 smoke test 纳入阶段 1 CI。
- [x] 制定浏览器支持窗口和版本淘汰规则：最近 12 个月稳定正式版为窗口，每季度复核并提前公告（见 `docs/V3-BROWSER-COMPATIBILITY.zh.md`）。
- [x] 明确 Node.js 版本策略：实施时选用最新 LTS，并固定本地与 CI 版本（Node 24.21.0；本地 `.nvmrc` 与 CI workflow 均已固定）。
- [x] 为 8 个阶段补充验收标准并建立对应 GitHub 里程碑；高优先级 Fetch method 缺陷已建阶段 2 issue #56。详见本文件执行记录。

**阶段验收**

- 有完整的现状功能和依赖清单。
- V3 范围、浏览器支持窗口、数据格式策略和 Node 版本策略已确认。
- 形成经过依赖图和构建验证的 V3 目录结构方案；明确哪些目录保留、合并、拆分或迁移，以及迁移顺序。
- 高优先级问题能够追踪到独立任务。

### 阶段 1：工程基础与测试起步

- [x] 将项目开发、CI 和发布环境升级到选定的最新 Node.js LTS（Node 24.21.0，`.nvmrc`、engines 与 CI 一致）。
- [x] 更新 pnpm、TypeScript、Vue CLI 构建工具及相关插件；并选定 Vitest / Vue Test Utils / Playwright 测试工具（见 `docs/V3-TESTING.zh.md`）。
- [x] 验证 workspace 全量构建的依赖顺序；各包独立入口仍需后续梳理。
- [x] 为 TypeScript 包、测试和生产构建提供统一命令（`pnpm typecheck`、`pnpm test`、`pnpm test:coverage`、`pnpm build`）；Vue SFC 类型检查尚未覆盖。
- [x] 为 lint 和格式检查提供统一命令：Prettier 3.9.9 `pnpm format:check`、ESLint 10.11.0 `pnpm lint` 已接入 CI 并覆盖全包。现有 Vue / JS 源码零 error，保留 378 条告警预算；50 个历史格式文件登记基线且门禁禁止债务增加，新增脚本 / 测试 / 配置严格零告警并严格格式检查。
- [x] 配置 CI 执行冻结依赖安装、全包 lint / 格式债务门禁、workspace 边界与 TS 检查、单元测试 / 覆盖率、生产构建及声明漂移检查、扩展 ZIP 打包和体积报告；新增 Chrome / Edge Stable 与固定最低版本浏览器矩阵及扩展 Fetch / XHR E2E。Chrome 141 本机最低版本验证通过；Edge 140 CI 首次运行待确认。
- [x] 选择测试工具：Vitest + V8 覆盖率用于纯逻辑；Vue Test Utils + jsdom 用于 Vue 组件；Playwright 用于扩展浏览器集成 / E2E（见 `docs/V3-TESTING.zh.md`）。
- [x] 建立测试目录约定、测试别名、覆盖率报告和本地运行方式（见根 `vitest.config.mjs` 与 `docs/V3-TESTING.zh.md`）。
- [x] 为规则匹配和静态重定向补充首批回归用例并记录总体覆盖率基线；Fetch / XHR 生命周期与组件回归留在相应阶段。
- [x] 建立按包和风险等级逐步提高覆盖率的策略，当前基线不设全局阻塞阈值（见 `docs/V3-TESTING.zh.md`）。
- [x] 明确各包的职责、入口、构建产物和类型声明；旧转换包明确重命名为 `@proxy/v2-compatibility`，无效的 shell 包入口移除，并新增纯协议常量叶子包 `@proxy/protocol`。其余包职责及后续边界见 `docs/V3-ARCHITECTURE-ASSESSMENT.zh.md`。
- [x] 将目录结构调整作为架构任务设计并分步落地：按稳定领域划分包、包内按 feature / domain 组织代码，避免 `common` / `utils` 成为无边界杂物目录。阶段 1 已拆分面板 `common` 聚合目录、区分 app / infrastructure / shared，并把跨包浏览器无关常量提取到 protocol；按业务域的深层拆分与 V3 domain 包留在阶段 2。
- [x] 明确依赖规则：核心请求引擎不依赖 Vue / UI 或 Chrome storage / badge helper；`pnpm check:boundaries` 检查 8 个 workspace 包依赖有向无环、包间依赖有声明、无私有源码深层引用，并由 CI 运行。平台适配和 UI 的后续窄接口迁移记录于架构评估。
- [x] 统一源码、生成声明、构建产物和测试夹具的归属；声明文件采用“生成后随源码提交”，CI 在构建后用 `pnpm check:generated-types` 检查声明漂移；clean build 清理重建全部 package 产物，测试脚本 / fixture 明确归入 `tests/` 与 package test。Node 24.21.0 下冻结安装、空产物 clean build、类型检查、单测与扩展 E2E 均通过。
- [x] 审查当前 `compatibility` 包：确认 shell 启动与面板导入仍使用其转换逻辑；已重命名为 `@proxy/v2-compatibility` 并明确只负责 V2 数据格式转换。
- [x] 统一测试目录约定：单元 / 组件测试与所属源码就近组织，跨包集成和浏览器端到端测试放在明确的顶层测试区域（`tests/browser/`），fixture 命名及生命周期一致。
- [x] 每次迁移目录或包边界时保持构建入口、类型声明、扩展打包和发布脚本同步更新，并以依赖图和 clean build 验证没有隐式路径依赖（本次将兼容包类型导入改为代理库公共入口，边界检查纳入 CI；clean build、类型检查和扩展 Fetch / XHR smoke 通过）。
- [x] 固定 Node / pnpm 并验证冻结安装：Node 24.21.0、pnpm 12.6.0、lockfile v9；全新安装使用 `pnpm install --frozen-lockfile`。
- [x] 配置 CI：PR 和指定分支 push 执行冻结安装、包依赖边界检查、全包 lint / 格式基线、TypeScript 检查、单元测试 / 覆盖率、生产构建、声明漂移检查、ZIP 打包和体积报告；另设 Chrome Stable / Edge Stable 及固定 Chrome 141 / Edge 140 运行时 smoke 矩阵、最低版本品牌浏览器扩展 Fetch / XHR E2E。Chrome 141 本机最低版本扩展验证已过；Edge 140 CI 步骤待远端首次运行。
- [x] 建立生产包体积初始基线：记录扩展 ZIP 大小及 JS / CSS 原始、gzip 后体积，并与本地开发依赖分开统计（见 `docs/V3-SIZE-BASELINE.zh.md`）；最终 V3 预算待 UI / 编辑器原型确定。
- [x] 检查当前编辑器是否完整打包及加载时机：Ace / JSONEditor 均进入面板主 JS chunk，延迟加载目标待 V3 UI 实施（见 `docs/V3-SIZE-BASELINE.zh.md`）。
- [x] 检查编辑器与 UI 依赖的生产打包：确认 Ace / JSONEditor 静态进入面板首屏 JS，无编辑器异步 chunk；评估 CodeMirror 6。它适合函数 / JSON 文本编辑，但自身不覆盖已验证的 JSON 树结构操作，因此将按需加载原型及组件对比放入阶段 4，详见 `docs/V3-EDITOR-ASSESSMENT.zh.md`。
- [x] JSON 编辑已用真实生产扩展 E2E 验证树形浏览、展开 / 折叠、类型识别、新增 / 修改 / 删除节点、数组排序、撤销 / 重做；另验证非法 JSON 错误行定位。入口为 `pnpm extension:smoke`、`pnpm editor:smoke`，留在 V2 的回归行为不会被误作 V3 UI 已实现。
- [x] 记录编辑器打开前首屏 JS、编辑器异步 chunk（当前不存在）和最终 ZIP / JS / CSS 体积，数据取自生产构建，详见 `docs/V3-EDITOR-ASSESSMENT.zh.md` 和 `docs/V3-SIZE-BASELINE.zh.md`；按需拆分与 V3 体积预算留在阶段 4。
- [x] 将 CI 浏览器兼容性测试覆盖最低支持版本与当前稳定版：CI 对 Chrome Stable / Edge Stable 运行真实浏览器 smoke，并对固定 Chrome 141 / Edge 140 执行运行时和实际扩展 Fetch / XHR smoke；Chrome 141 本机扩展验证已过，Edge 140 矩阵待远端 CI 首次运行。

**阶段验收**

- 新开发环境可按文档从零安装并构建。
- CI 能对关键检查提供明确通过 / 失败结果。
- 包和目录职责可从结构中辨认，依赖方向无循环；新开发环境从干净检出即可构建和运行测试。
- 测试可在本地和 CI 运行，并产生可查看的覆盖率基线。
- workspace 包之间的依赖和构建顺序清晰、可重复。

阶段 1 验收记录（2026-09-25）：Node 24.21.0 / pnpm 12.6.0 冻结安装、8 包边界检查、完整 clean build、五个 TS package 类型检查、7 项单元测试、全包 lint / 格式债务门禁、Chrome 141 最低版扩展 smoke、生产 JSON 编辑器交互与错误定位 smoke、ZIP 体积报告均通过。本机无法运行 Microsoft Edge 140 Linux 包；精确版本 runtime + extension smoke 已纳入 CI，首次远端运行待确认。V2 包与现有交互验证作为迁移阶段的基线，不代表 V3 schema、UI 或编辑器按需加载已经实现。

### 阶段 2：代码架构与核心问题修复

- [x] 设计清晰完整的项目目录和包结构，明确各包的职责与边界；`docs/V3-ARCHITECTURE-ASSESSMENT.zh.md` 记录 9 个 workspace 包的当前职责、依赖图、入口、目标边界和渐进迁移约定。
- [ ] 按领域划分核心模块，明确请求处理、规则匹配、状态管理、存储、消息通信和 UI 之间的依赖方向。
- [x] 将 V3 hit 消息类型和不可信页面事件校验集中到浏览器无关的 `@proxy/protocol`；proxy runtime 按共享类型发出事件，扩展宿主复用同一 guard，避免跨层重复定义 V3 消息契约。
- [x] 将 service worker 中 V3 命中复核、串行计数和徽章渲染迁到 `v3Hit.ts`；`badge.ts` 保留 V2 统计和 V2/V3 徽章通道协调，不改变存储或计数语义。
- [x] 将 V3 Fetch / XHR 执行器、单测和 browser smoke entry 收拢到 `proxy-lib/src/v3/` 与 `proxy-lib/test/v3/`，让新增 V3 feature 不与根目录的 V2 runtime 文件混排；不改变运行时 API。
- [x] 将 Fetch / XHR 相同的 host `getRules` / `onMatched` 接口集中为 `V3RuntimeHostOptions`；保留现有 `V3FetchOptions` / `V3XHROptions` 类型名和模块入口，供旧调用代码平滑使用。
- [x] 将 Fetch 响应替换和原始 response metadata 代理集中到 Fetch 专属 `responseAction.ts`；匹配/请求派发仍在 Fetch wrapper，失败时仍返回原响应，不与 XHR 不同的响应时序强行合并。
- [x] 将 V3 backup 状态、校验、Fetch/XHR runtime 创建和 hit event 通知集中到 `v3/runtimeController.ts`；proxy-lib 根入口只将 controller 状态投影到共享标记并协调全局 V2/V3 wrapper 挂载。
- [x] 让 V3 runtime 配置更新返回 schema validation issues，并复用 domain 的路径化错误格式；非法配置仍保留当前活动配置，null 清除和 disabled 配置语义不变。
- [x] 将 V3 backup schema / validation 放到 domain package 的 `backup.ts`，通过 `index.ts` 稳定导出入口；规则 matcher 从 `backup.ts` 单向依赖规则类型，避免 barrel 与匹配器互相导入。
- [x] 将纯 V3 规则模型类型从 backup 校验实现拆到 `rules.ts`；backup validator 与 matcher 直接依赖领域类型，包根入口继续导出原有类型 API。
- [x] 将 V3 命中规则复核、counter sanitize、总计和安全递增等纯领域逻辑放入 `v3-domain/hitCounters.ts`；service worker 只负责串行队列、storage、徽章和 panel notification。
- [ ] 统一模块命名、公共接口、类型定义和错误处理方式，减少重复实现及跨层耦合。
- [x] 绘制并维护项目架构图、包依赖图和关键运行链路说明：`docs/V3-ARCHITECTURE-ASSESSMENT.zh.md` 现覆盖全部 9 个 workspace 包，以及面板→storage→content→MAIN proxy 配置同步、代理命中→content→service worker→badge 两条关键链路，并记录消息信任边界。
- [x] 在修改核心行为前，为 Fetch Request method / URL 缺陷补充可复现回归测试；先确认测试失败，再实现修复并保留测试。
- [x] 设计组合式规则：同一条规则可独立启用请求重定向、响应替换或两者；两项都关闭时规则保持可保存但不参与运行时匹配，适配导入代码默认停用。
- [x] 明确组合规则的执行阶段和数据流：使用原始 URL / method 选择并锁定第一条完整命中规则，请求 action 在网络前运行，response action 在响应后由同一规则运行；重定向目标不重新匹配。
- [x] 明确组合规则中各能力的独立启用方式、执行优先级、冲突规则、命中统计及失败回退行为：规则列表 first-match；一次请求命中只计一次；匹配器故障继续查找，action 故障 fail-open 且不转交后续规则；重定向网络失败不重试。
- [x] 验证组合规则在 Fetch 与 XHR 上的行为一致性；一条规则已覆盖 request redirect 与 response replacement 的扩展端到端路径，XHR 同步请求、受限 responseType / response headers、函数 action 及 MAIN-world 通信边界均有明确降级 / 风险说明。

- [x] 明确规则优先级：拦截与重定向的 Fetch / XHR 均由列表中第一条启用且 URL / method 命中的规则负责；同一请求不叠加应用多条规则。
- [x] 修复拦截器模式下 `fetch(new Request(...))` 的 method / URL 匹配；先添加覆盖 Request method、init 覆盖、默认 GET 和 Request URL 的回归用例，再修复并通过单测及生产扩展 E2E。
- [x] 验证重定向模式下 `fetch(new Request(...))` 的 URL 与 method 识别及原生请求转发语义；生产扩展 E2E 覆盖面板建规则和真实 POST 转发。
- [x] 重定向 Fetch 时保留 method、body、headers、credentials、signal、mode 等请求选项；Vitest 检查请求属性，浏览器 E2E 确认实际到达目标服务的请求。
- [x] 修复异步自定义规则的 Promise / callback 完成语义；两类规则均等待 callback 或 Promise 结果，先完成者生效。
- [x] 为未调用回调、抛出异常和超时定义明确的回退行为；异步等待最多 5 秒，失败时 Fetch 返回原响应、重定向继续原请求。
- [x] 处理响应替换时的无 body 状态、状态码、headers、Content-Length 和 Response 属性；HEAD / 204 / 205 / 304 不构造 body，非法状态码回退原响应，并保留原始 url / redirected / type。
- [x] 让命中通知与最终应用的规则一致，避免重复计数或统计错配；通知携带规则序号，徽章只增加被选中的规则。
- [x] 将 V3 命中诊断与 V2 独立隔离：Fetch / XHR 只发送专用 V3 hit 消息，service worker 校验活动配置、规则、URL 与 method 后串行写入独立计数并更新徽章；浏览器 smoke 确认 Fetch / XHR 各计一次且不改写 V2 计数。页面主世界消息仍可伪造，统计仅用于诊断。
- [x] 修复 XHR 重定向对 `open()` 同步语义及原生调用流程的影响；`open()` 同步调用并保留原参数，静态与同步 callback 规则即时生效，Promise / 延迟 callback 在 XHR 中警告并 fail-open 使用原 URL，Fetch 仍支持异步规则函数。
- [x] 检查 XHR 对象复用、请求头覆盖、`readystatechange` 事件顺序和异常路径；修复拦截 XHR 复用时旧响应覆盖值与命中锁未重置的问题，覆盖重定向 header 不跨请求泄漏及用户回调读取到已处理响应。现将 readystatechange、loadstart、progress、abort、error、load、timeout、loadend 转发到代理 XHR，并保留监听器 `this` / `target`、移除及顺序语义；合成事件的 `isTrusted` 边界见 `docs/V3-ISSUES.zh.md`。
- [x] 验证扩展启停时对网页已有 Fetch / XHR 包装器的兼容策略：注入前已存在的页面实现作为底层并在关闭时恢复原引用；注入后包在扩展外层的页面包装器保持原样，代理根据开关 / 模式透传，同模式重新启用可恢复。若外层包装器隐藏了代理且请求模式已切换，保留页面包装器优先，需页面重载以重新建立当前模式代理。
- [x] 建立跨 content script、service worker 和面板的一致存储更新机制：统一用 `chrome.storage.onChanged` 刷新各上下文的 storage cache；各标签页 content script 将配置快照同步给页面代理；service worker 不再依赖单个当前 tab port 广播规则。
- [x] 处理 Storage 初始化、读写失败、配额错误及数据变化监听：初始化、读取、写入、删除和清空均检查 API 错误；写入成功回调后才更新缓存，失败保持旧值并向面板报告；变化事件同步缓存。
- [x] 修复浏览器扩展环境与普通网页环境下存储行为不一致的问题：两种环境均在初始化时建立缓存，读写 / 删除 / 清空保持缓存同步，普通网页监听跨标签 `storage` 事件并统一报告失败。
- [x] 明确空规则列表的导入、更新和清空语义：V3 备份按完整快照处理，必需规则字段中的空数组表示替换为空；缺失 / `null` / 非数组拒绝；显式清空需确认，空列表备份仍可导出。见 `docs/V3-RULE-MODEL.zh.md`，实现验证留在 schema / importer 阶段。
- [x] 定义 V3 新配置 schema、格式版本标识和校验规则；V3 不负责迁移 V2 配置。新增独立 `@proxy/v3-domain` envelope 与字段路径校验，未知字段 / 格式 / 版本拒绝，识别 V2 并给出不兼容提示；进阶 matcher/action 能力随 Fetch / XHR 审查演进。
- [x] 为导入文件提供结构校验、字段校验和可读错误反馈：`parseV3BackupJson()` 统一处理 JSON 语法、V2 不兼容和 schema 字段错误，返回路径化 issue 及可显示文本；UI 接入留在面板迁移阶段。
- [x] 验证多标签页、多 frame 和 service worker 重启时状态正确：扩展 smoke 覆盖两个标签页及子 frame 规则同步，并在同一持久化 profile 关闭 / 重开浏览器后验证 service worker 冷启动读取配置且重定向规则继续生效。

**阶段验收**

- 代码目录、包职责、模块接口和依赖方向有明确约定及架构文档。
- 请求参数在转发或重定向前后符合定义，且有自动化测试覆盖。
- 规则优先级及命中统计有文档说明并表现一致。
- 一条组合规则可覆盖请求重定向和响应替换的端到端场景，能力可独立启用，Fetch / XHR 行为、优先级与失败回退均有测试和文档说明。
- V3 配置格式有明确版本标识和校验；不支持的 V2 数据会被明确识别，不会被静默改写或丢弃。
- 自定义函数的成功、异常、异步和超时路径都会正常结束。
- XHR 和 Fetch 的关键原生语义有回归测试保护。

### 阶段 3：安全与兼容性

- [x] 审查扩展权限和站点匹配范围，逐项记录功能依据：storage、notifications、tabs 和全站内容脚本权限均有实际功能调用；移除 tabs 的尝试经扩展 E2E 证明会丢失活动页标题，故保留；通知切换到 `chrome.notifications`。见 `docs/V3-PERMISSIONS.zh.md`。
- [x] 明确自定义函数的执行能力、执行环境及用户风险提示：V3 只支持受限 response 计算，按不可信代码放入无扩展权限、无网络能力且可终止 worker 的 sandbox；限制同步 / Promise 结果、5 秒硬超时、fail-open，并规定导入代码不自动执行。见 `docs/V3-USER-FUNCTIONS.zh.md`；sandbox 与 UI 接入留待实现。
- [x] 对带有函数代码的导入配置提供明确提示和适当校验：`parseV3BackupJson()` 返回代码字段路径 warning，并在导入结果中停用对应 response action；UI 呈现警告与单独启用确认留在面板迁移阶段。
- [x] 校验 content script、页面脚本、面板与 service worker 之间的消息来源和结构；扩展运行时消息校验 Chrome `sender`、路由与数据结构，页面世界消息按不可信输入限制用途并记录无法认证同页脚本的边界。见 `docs/V3-MESSAGE-SECURITY.zh.md`。
- [x] 检查 web accessible resources、注入资源和规则数据是否最小化暴露：移除 `web_accessible_resources`，将 `document.js` 改为 manifest 声明的 MAIN 世界静态内容脚本；记录为代理请求必须同步到当前 frame 的页面主世界，规则数据仍对该页面可见。见 `docs/V3-MESSAGE-SECURITY.zh.md`、`docs/V3-PERMISSIONS.zh.md`。
- [x] 校验 URL、正则、状态码和 headers 等输入，处理异常和高开销情况：RE2 语法和线性时间正则匹配，限制规则数量、输入长度、编译缓存、headers、状态码、函数源码及 JSON body；面板保存、完整备份和运行时均校验或安全跳过无效输入。见 `docs/V3-INPUT-VALIDATION.zh.md`。
- [x] 进行依赖安全审查，制定依赖更新和漏洞修复流程：PR 检查生产依赖 moderate+ 公告与 registry 签名；记录全量漏洞基线、生产 Vue 2 低危项、官方 registry 限制及月度 / 发布前审查流程。见 `docs/DEPENDENCY-SECURITY.zh.md`。
- [x] 对新浏览器 API 和 CSS 特性按最低支持版本进行兼容性审查；对非核心增强提供降级行为，避免要求用户必须使用刚发布的浏览器版本。Chrome 141、Edge 140 与当前 Stable 的运行时 smoke 通过；固定最低版本的扩展 Fetch / XHR smoke 通过 CI，非核心 `crypto.randomUUID()` 有 fallback，减少动态效果由系统偏好控制。

**阶段验收**

- 权限和脚本执行风险有清晰说明及可追踪决策。
- 不可信配置不会绕过导入校验或造成不可控崩溃。
- 扩展消息按明确的数据结构和发送方边界处理。

### 阶段 4：Vue 3、品牌与界面重构

- [x] 定义 V3 品牌方向并重新设计 Ajax Proxy Logo；保留浏览器窗口和请求调试识别线索，以双向请求 / 响应路径与中心代理节点简化图形，teal 表示稳定链路，珊瑚色表示命中状态。见 `docs/V3-BRAND-DIRECTION.zh.md`。
- [x] 为 Logo 制定不同场景下的规范和变体，包括扩展图标、面板品牌区、浅色 / 深色背景及所需尺寸；`pnpm brand:icons` 生成扩展 active / inactive 图标、深色面板 mark，并更新浅 / 深色 panel lockup 与多尺寸预览矩阵。见 `docs/V3-BRAND-DIRECTION.zh.md` 和 `docs/brand/v3-icon-matrix.png`。
- [x] 输出可维护的 SVG mark 及由其生成的 48 / 128 px active / grayscale extension icons；`pnpm brand:icons` 可重建资源，并生成 16 / 24 / 48 / 128 px 缩放矩阵供检查。
- [x] 建立与新 Logo 协调的颜色、字体、图标和界面视觉规范：定义浅 / 深主题语义色、对比度基线、系统字体栈、间距 / 圆角 / 控件高度和 SVG 图标使用约定，并同步到 Vue 3 原型 CSS token。见 `docs/V3-VISUAL-SYSTEM.zh.md`。
- [x] 设计新的面板信息架构和关键操作流程，再确定组件实现方案；已映射现有功能与拟议结构，定义组合规则创建、筛选、启停、V3 恢复及错误状态，并把阶段 5 新功能与已确认范围分开。见 `docs/V3-PANEL-IA.zh.md`；具体布局和组件仍待原型验证。
- [ ] 将 Vue 2 迁移到 Vue 3，并更新状态管理、路由、国际化和 UI 组件依赖。
- [x] 建立 Vue 3 面板与 service worker 的独立消息协议及配置 snapshot adapter；读取前校验 V3 配置、清理已知规则命中计数，保存仅写 V3 专属键，并拒绝非 V3 面板页面来源。UI service 校验请求和响应；redirector CRUD 已接入该 adapter。
- [x] 为 V3 `V3Rule[]` 提供不可变的追加 / 插入 / 替换 / 删除 / 启停 / 调序操作；重复 ID、未知 ID 与边界索引行为有测试，规则数组顺序作为首条命中优先级。
- [x] 将 V3 候选面板的重定向列表接入 snapshot 和保存流程，实现创建、编辑、删除重定向行为、启停和调序；中英界面显示匹配条件 / 目标地址，删除组合规则中的 redirect action 会保留 response action。Chrome 与 Edge Stable production preview 交互验证通过；V2 substring replacement 和专有 redirect 字段不作隐式映射。
- [x] 将 V3 拦截列表接入 JSON 响应规则创建、编辑、删除、启停和首条优先级；校验状态码和 JSON，编辑组合规则时保留 request action 与未编辑响应字段，删除响应 action 时保留 redirect。Chrome 与 Edge Stable production preview 验证通过；函数响应编辑和标签关联已接入；V2 配置自动迁移不在范围内。
- [x] 将 Vue 3 候选面板独立暂存到扩展 `panels-v3/`，保留 Vue 2 默认 `panels/`；真实扩展中通过 V3 消息保存并重载读取 JSON 响应规则，验证 Fetch 状态 / body 替换、V3 hit 增长及 V2 storage 不变。Chrome for Testing 154 与 Edge Stable 153 真实扩展 smoke 通过；service worker 鉴权按 extension ID + V3 页面 URL 验证，允许真实扩展标签页携带 `sender.tab`。
- [x] 增强 JSON response 编辑器的语法反馈和示例：解析器能提供准确位置时显示 1-based 行 / 列，不能定位时保留通用错误；支持对象 / 数组 / 字符串 / null 一键插入，输入修正后清除过期语法错误。Chrome for Testing 154 与 Edge Stable 153 的真实扩展 smoke 验证行列、示例、保存和请求响应闭环。
- [x] 以 PrimeVue 4 作为首选组件层，先试用其主题化（styled）模式和自定义设计 token，利用成熟交互组件，同时建立 Ajax Proxy 自己的品牌视觉；独立 Vue 3 / Vite 原型使用 PrimeVue 4.5.5 Aura 派生 token，并通过 Chrome Stable 与 Edge Stable 检查桌面 / 窄布局、搜索空态和浅 / 深主题。实现仍未替换 V2 面板。见 `docs/V3-UI-PROTOTYPE.zh.md`。
- [x] 原型验证 PrimeVue 4 的 Pass Through / unstyled 能力；styled + tokens 已满足当前视觉目标，Pass Through 可局部扩展；对照构建没有显示 unstyled 的体积收益且增加组件基础样式维护，不采用 Tailwind CSS v4 全面接管。Chrome Stable 与 Edge Stable 对 production preview 的 styled、Pass Through CTA、unstyled 三种模式验证交互、键盘焦点和深色主题。见 `docs/V3-UI-PROTOTYPE.zh.md`。
- [x] Tailwind CSS 与 UnoCSS 都是构建期样式工具，不提供完整的表格、表单、弹层等交互组件；不同时采用二者。当前 PrimeVue styled + Ajax Proxy tokens 已满足组件和布局需求，因此暂不引入 utility-first 工具；若需求变化，再优先评估 Tailwind CSS v4 的 Vite 集成和团队可维护性。对照构建和交互证据见 `docs/V3-UI-PROTOTYPE.zh.md`。
- [x] 对所选 UI 方案执行按需组件引入，并比较生产环境 JS / CSS 体积、交互质量、键盘焦点 / ARIA 控件及样式定制成本；原型验证结果与可访问性检查边界见 `docs/V3-UI-PROTOTYPE.zh.md`。
- [ ] 重新设计整体视觉规范，包括布局、颜色、字体、间距、图标和主题。
- [ ] 重做拦截规则、重定向规则的列表、创建、编辑和详情界面。
- [x] 为 V3 JSON response body 接入按需加载的 CodeMirror 6 JSON 编辑器；打开拦截规则编辑器时才加载独立 chunk，保留格式化、校验、错误定位、示例按钮及保存流程。Chrome for Testing 154 与 Edge Stable 153 真实扩展 smoke 验证按需加载、无效 JSON 阻止保存、示例编辑与持久化；生产初始 JS 405.29 kB gzip 109.05 kB，CodeMirror 异步 JS gzip 101.78 kB。
- [x] 为 V3 JavaScript response function 接入按需 CodeMirror 6，并与受限 sandbox 执行能力连接；函数代码导入后不自动执行，启用前明确确认；运行错误与 timeout 在 V3 面板显示安全类别、规则条件和原响应回退状态。Chrome for Testing 154.0.8037.57、Edge Stable 153.0.4234.48 验证隔离 sandbox、四 worker 并发上限和网络阻断；Chrome / Edge 函数 runtime smoke 验证动态替换、无效结果及死循环诊断、fail-open 和 sandbox 重建；Chrome 扩展 smoke 覆盖面板保存和 service worker 重启。备份恢复的函数规则数量提示已接入恢复 UI 并由扩展 smoke 验证。
- [x] 完成 V3 函数响应纵向集成切片：Fetch 快照、JSON 结果校验、timeout fail-open 和 sandbox 重建；XHR 保持原响应。同步修复函数编辑器初始化与长表单可用性。
- [x] 制作 JSON 调整交互原型，比较 CodeMirror 6 文本编辑、JSONEditor tree-only 和轻量树形编辑器；Chrome for Testing 154 与 Edge Stable 153 验证中文文本往返、结构操作、无效 JSON 保留及 1500 项样例。记录 chunk 体积、性能观察、原型局限和待验收项，见 `docs/V3-EDITOR-ASSESSMENT.zh.md`。
- [x] 确认编辑器方向：函数编辑和 JSON 原始文本模式采用按需 CodeMirror 6；JSON 结构化编辑保留独立树形能力。JSONEditor 现有构建 chunk 为 262.79 kB gzip，不直接作为 V3 生产依赖；轻量树原型尚不具备生产所需的全部操作、撤销及大数据优化，需在生产实现阶段完善或另选方案。
- [x] V3 面板展示跨标签页最近一次已验证规则命中，包括原始请求 method / URL、规则匹配条件和“已匹配”状态；不将早期命中事件描述为请求改写或响应成功。
- [ ] 统一 Fetch / XHR 生命周期后，再展示最终请求改写结果和失败原因。
- [x] 启用状态由 V3 面板全局开关和扩展图标显示；不增加独立的持续页面活动指示器。
- [x] 评估规则命中时的轻量视觉提示；页面边缘光晕不纳入 V3，避免增加跨 frame / SPA、可访问性和性能验收范围。
- [x] 扩展图标 / 面板已提示全局启用状态；由于本期不实现页面光晕，无需为该效果增加降级提示。
- [x] 减少动态效果、动画频率和页面边缘命中提示的评估已完成；该视觉反馈不纳入 V3。
- [ ] 优化备份恢复、标签、搜索、筛选、排序和批量操作流程。
- [ ] 国际化范围限定为简体中文与英文；清理繁体中文、日语、法语、韩语、俄语、爱尔兰语等非目标语言资源，以及 UI / JSON 编辑器相关的多余 locale 映射。
- [x] 将语言切换从下拉框改为始终可见的双选分段控件，明确显示“简体中文”和“English”；当前语言有清晰选中态，点击后立即切换并持久化，不需要额外确认。Vue 3 候选面板已通过 `vue-i18n` Composition API 实现，偏好保存在隔离的原型 localStorage 键中。
- [ ] 统一应用文案、组件库、日期 / 数字格式和 JSON 编辑器语言为当前选择；检查中英文键值完整、术语一致、布局无截断，首次启动语言默认策略明确。
- [ ] 检查键盘操作、焦点顺序、可读性和不同窗口尺寸下的布局。

**阶段验收**

- 主要功能在新界面可完成，V3 重构未遗漏 V2 的关键能力。
- 新 Logo 及其变体已覆盖扩展图标和面板等主要使用场景，视觉规范与界面一致。
- 关键页面的设计稿或交互方案经过确认。
- 面板在目标窗口尺寸和支持语言下显示完整、交互正常。
- 界面只提供简体中文与英文；语言选择无需打开菜单即可看见并直接切换，刷新 / 重开面板后保留选择。
- 扩展启用状态在面板全局开关和扩展图标上清晰可见；本期不要求页面命中动画。
- PrimeVue 的默认视觉已通过 Ajax Proxy 自有设计 token 和组件样式形成明确品牌识别；UI 与 CSS 方案经原型和生产构建体积对比后确定。
- 编辑器依赖按需加载，最终扩展包大小有可重复的基线和预算。
- JSON 用户可以通过清晰的结构化操作完成常见调整，并能方便地切换或查看原始 JSON、发现语法 / 数据错误；交互与中文输入经过验证。

### 阶段 5：新功能筛选与实施

以下方向先纳入需求评估与设计；依据用户价值、复杂度、风险和 V3 时间范围确定是否实施：

- [x] 规则搜索按 URL、method、ID、跳转目标和动作文本查找；配置了但停用的 action 仍可搜索、查看和编辑。
- [x] 按规则启用状态和普通 / 正则匹配类型筛选列表；可清除筛选，应用筛选时禁用调序按钮以避免改变隐藏规则的相对位置。
- [x] 使用列表上移 / 下移调整首条匹配优先级；搜索或筛选期间暂禁调序。
- [x] V3 规则支持可选多标签关联；备份 / 保存校验关联必须引用现有唯一标签，缺省关联兼容既有 V3 规则。
- [x] 面板支持创建 / 改名 / 删除标签、规则多标签关联、列表展示和与搜索 / 状态 / 匹配类型组合筛选；删除标签前确认并清理引用。
- [x] 复制单条规则，副本默认停用并生成新 ID；插在来源规则之后，保留 action 与标签关联，不复制命中计数。
- [x] 批量启用、停用所选规则：按当前列表选择范围，只修改规则级 enabled，保存成功后清空选择。
- [x] 批量导入、导出规则并校验冲突与覆盖范围：所选规则单独导出；按 ID 跳过冲突、合并引用标签且仅追加到末尾，不修改既有规则或设置。
- [x] 面板内存保留最近 10 次规则命中，跨标签页显示；面板关闭或刷新后清空，不记录请求 body / headers。
- [x] 按当前 V3 完整规则顺序离线试算 URL / method，逐条说明首条匹配、优先级遮蔽、禁用状态、method / URL 不匹配及无效正则；不发请求、不保存输入或改动运行状态。
- [x] 评估实际请求的未命中原因与 action 最终结果诊断：不得把模拟结果或“匹配”通知当作执行结果；只在用户主动开启临时诊断时记录，不持久化、不采集 body / headers。
- [x] 增加临时真实请求诊断：默认关闭，由用户主动开启；当前会话内最多保留 10 条真实未命中原因，不记录 URL / query、body 或 headers，面板关闭 / 刷新后清空。
- [x] 记录 Fetch 请求 / 响应 action 的实际执行结果与安全失败分类；用临时关联 ID 关联阶段，不改变请求回退策略或命中计数。
- [x] 记录异步 XHR action 的实际结果；在响应值可确认的时点报告成功 / native fallback / unsupported，不把 `open()` 时的匹配误报成结果。
- [x] 提供离线规则匹配试算：按当前 V3 完整规则顺序复用 domain matcher，逐条说明首条匹配、优先级遮蔽、停用状态、method / URL 不匹配及无效正则；不发请求、不保存输入或改动运行状态。
- [x] 评估快捷创建规则：限定从面板内存的最近命中记录发起，预填实际 URL / method，用户编辑审核；默认停用、不复制响应数据或函数代码。
- [x] 从最近命中记录打开预填规则编辑器，用户确认保存并显式启用后才参与请求处理。
- [x] 评估更灵活的请求匹配条件及响应配置：先实施完整 URL 精确匹配；暂不扩展请求 header 条件或 V2 忽略列表。静态响应 header 编辑单独评估 Fetch / XHR 能力差异后再定范围。
- [x] 为 URL matcher 增加精确相等模式，保留现有 normal 子串与 regex 行为，并让列表、规则编辑器、离线试算和 Fetch / XHR 共用同一语义。
- [x] 评估静态响应 header 编辑能力及其 Fetch / XHR 差异；由于 XHR 无法忠实替换响应头，本期暂缓增加配置入口，待接受明确的能力降级方案后再决定是否实施。
- [x] 规则分组沿用现有多标签关联，标签可组合筛选；暂不增加嵌套分组或组级启停 / 优先级语义。
- [x] 提供活动页面的精确 origin 站点开关：按协议、主机名和端口独立启停当前 frame 的 V3 规则，默认启用；不改规则自身启用状态或顺序，全局关闭优先。完整备份升至 v5，旧 v3 / v4 导入时升级并补空站点列表。
- [x] 评估配置预设范围：内置规则模板已覆盖常见场景；用户命名的多套完整配置 profile 会引入活动配置切换、命中统计归属和 profile 间导入 / 覆盖语义，本阶段先不做，待明确需求后单独设计。
- [x] 面向常见场景的规则模板及示例：提供静态 JSON 响应与 HTTP 重定向两个离线模板；模板仅使用 `.invalid` 占位域名、默认停用、追加到列表末尾、每次创建重建 ID，不带函数代码。添加前可预览，取消不修改配置；保存失败时在模板弹窗内显示错误。
- [x] 按用户反馈和维护成本评估其余功能请求，并明确不纳入 V3 的项目；结论同步到第 8 节与后续版本候选。

**其余用户反馈筛选结果（2026-09-26）**

- V3 聚焦规则管理、可预测的 Fetch / XHR 拦截与重定向、V3 专属备份、精确 origin 开关及用户主动开启的临时诊断；保留“首条启用且完整匹配规则负责请求”的优先级，不做隐式链式叠加。
- 暂不纳入通用请求 / 响应 Headers 读取或改写（issues #55、#48）：#55 原需求描述有歧义；受限头、CORS、覆盖合并规则、Fetch / XHR 可观察差异和备份语义会扩大验证及维护面。静态响应头入口已单独评估并暂缓；收到具体高频场景后再设计。
- 暂不纳入请求体改写（issue #44）：Request 流消耗与重放、duplex、FormData / 二进制、Content-Type 一致性、体积上限和 XHR 差异需要单独定义，错误可能改变实际网络请求。
- 暂不纳入跨面板持久化草稿 / 自动恢复（issue #37）：需引入草稿 schema、过期和冲突处理；持久化函数源码会扩大敏感数据留存。V3 当前只在用户确认时保存配置；关闭确认可在后续作为轻量 UX 提案评估。
- 暂不纳入自动识别或协调其他请求拦截扩展（issue #46）：页面包装顺序不可可靠枚举或控制。保留稳定版浏览器回归和人工排障说明，不承诺自动化解冲突。
- 暂不纳入页面命中光晕及动画（阶段 4）：需覆盖 frame、SPA、滚动、窄视口、减少动态效果、键盘 / 屏幕阅读器和性能；V3 先保留扩展图标 / 面板状态与可选的临时诊断作为反馈。
- 用户命名的多套完整配置 profile、V2 规则 / 备份迁移、嵌套组与链式规则也不纳入本期；分别会增加配置切换 / 统计归属、转换正确性或优先级语义复杂度，现有模板和标签已覆盖当前场景。
- #53 源码文档属于低成本支持工作，不作为新功能；现有 README 与 V3 文档提供下载 / 解压加载和构建命令，完整开发环境步骤作为阶段 7 文档验收，不阻塞阶段 5 功能范围。
- #49 组合式规则、#34 URL 匹配、#40 函数重定向、#30 函数响应、#27 最近命中快捷创建、#25 JSON 中文输入方向和 #22 静态重定向请求头已纳入既有实现 / 回归记录；#56 Fetch `Request.method` 缺陷已修复并保留在阶段 2 缺陷跟踪中。

**阶段验收**

- 每项纳入功能均有目标用户、使用场景、验收标准和对应测试。
- 功能范围经过确认，避免在重构过程中无边界扩张。

### 阶段 6：测试完善与质量验收

- [ ] 为全部重要生产模块提供与职责相匹配的测试用例，包括核心逻辑、UI、扩展 API 交互和错误路径。
- [x] 为 URL / 正则匹配、V2 规则忽略、method 匹配和规则优先级编写单元测试；V3 规则不包含 V2 ignore 列表。
- [x] 为 Fetch 拦截与重定向覆盖 Request、init、body、headers、状态码和异常情况。
- [x] 为 XHR 生命周期、事件、方法匹配、请求头和对象复用编写测试。
- [x] 为自定义函数覆盖同步、异步、异常、未回调和超时场景。
- [x] 为 shared-utils Chrome storage 与网页 localStorage 缓存操作（初始化、读取、写入、删除、清空）覆盖成功和失败回归；删除 / 清空失败须拒绝、保留缓存并派发错误事件。
- [x] 为 V3 XHR 响应完成时序增加回归：`readystatechange` 到 readyState 4 及 `load` 回调 / 监听器读取响应时，替换后的 body 与 status 已就绪。
- [x] 为 V3 XHR 网络失败增加回归：网络错误下的 `status=0` 不得被响应替换伪装成成功状态，`readystatechange` 与 `error` 处理器读取到原生失败结果。
- [x] 将 V3 XHR 原生失败保留断言扩展至 `abort` 与 `timeout` 终态。
- [x] 为 service worker 启动期 V3 面板消息入口覆盖发送方与 envelope 拒绝路径；错误扩展 ID、非 V3 面板 URL 和畸形消息均不得访问 storage 或调用响应回调。
- [x] 为 V3 XHR `on*` 属性处理器覆盖重复赋值及设为 `null` 的移除语义，避免旧回调跨事件 / 请求残留。
- [x] 为 V3 面板启动期 GET 快照覆盖 storage 初始化失败分支；返回稳定 `storage-read-failed`，且初始化失败时不访问 storage。
- [x] 为 V3 response function executor 覆盖 iframe `ready` / `result` 可信往返；错误 source 不得触发执行，正确 source 与 opaque origin 才能完成结果。
- [x] 为 V3 response function executor 覆盖 sandbox 合法失败响应；协议校验通过的错误结果应 reject Promise 并保留错误信息。
- [x] 为 V3 response function executor 覆盖硬超时与取消：5 秒后拒绝并发送 cancel，宽限期后移除 sandbox iframe。
- [x] 为 V3 response function executor 覆盖源码长度保护；空白和超过 65,536 字符的代码须在 iframe 查找前被拒绝。
- [x] 为 V3 response function executor 覆盖并发上限；四个活动执行保留并可完成，第五个在排队前稳定拒绝。
- [x] 为 V3 response function executor 覆盖 iframe scheme 与 sandbox 路径校验，拒绝普通网页 URL 和扩展内非 sandbox 资源。
- [x] 为 V3 response function executor 覆盖握手消息的 origin、source 和严格字段校验；不可信 / 畸形 `ready` 不得启用执行。
- [x] 为 V3 response function executor 覆盖未知 / 迟到 execution ID；其他请求的结果不得完成当前待处理调用。
- [x] 为 V3 response function executor 覆盖 timeout 后宽限期内迟到的结果；调用保持 rejected，并立即移除隔离 iframe。
- [x] 为 V3 response function executor 覆盖 iframe `postMessage` 同步失败；pending 调用稳定 reject 并清理执行计时器。
- [x] 为 Vue 3 站点开关对话框建立组件测试并覆盖打开焦点、origin 规范化和启用 / 停用事件。
- [x] 为 Vue 3 站点开关对话框覆盖非法 scheme 与重复停用 origin 的表单拒绝路径。
- [x] 为 Vue 3 站点开关对话框覆盖 Tab / Shift+Tab 焦点回绕及 Escape 关闭。
- [x] 为 Vue 3 响应规则编辑器覆盖匹配 URL 边缘空格和非法 HTTP 状态码拒绝保存。
- [x] 为 Vue 3 响应规则编辑器覆盖函数响应保存确认；取消不保存，确认后草稿规则仍默认停用。
- [x] 为 Vue 3 响应规则编辑器覆盖有效 JSON 响应与标签选择的保存序列化。
- [x] 为 Vue 3 RedirectRuleEditor 覆盖必填 / 首尾空格校验及 regex、method、target、tag IDs 保存 payload。
- [x] 为 Vue 3 BackupRestoreDialog 覆盖函数规则恢复确认及编辑 source 后使旧预览失效。
- [x] 为 Vue 3 RuleTagsDialog 覆盖创建后清空输入及重命名空值 / 相同值禁用和新值事件。
- [x] 为 Vue 3 RuleTemplatesDialog 覆盖模板选择、保存中禁用、可访问属性、焦点和关闭交互。
- [x] 修复函数响应启用确认取消时 checkbox 视觉状态未回滚，并以组件回归锁定。
- [x] 为 Vue 3 响应 body 编辑覆盖无效 JSON 行列反馈及修正后的错误清除 / 成功保存。
- [x] 为 Vue 3 响应规则编辑器覆盖关闭后切换规则并重开时重置 URL、status、body 和错误状态。
- [x] 为 V3 domain 正则匹配器覆盖缓存复用、LRU 上限淘汰和淘汰后重新编译。
- [x] 为 V3 domain 运行时 matcher 覆盖非法匹配类型、超长正则和异常 matcher 对象；匹配异常应继续检查后续规则。
- [x] 为 V3 no-match Service Worker 队列覆盖 storage 读取异常；失败不得消耗一次性诊断开关或污染后续排队事件。
- [x] 为 V3 backup 校验覆盖 regex 数量、header 数量 / UTF-8 总字节数和 disabled origin 数量上限。
- [x] 为 V3 response function 覆盖超出 512 KiB 快照上限后的 fail-open；不执行函数，保留完整原响应并记录固定错误类别。
- [x] 为 V3 XHR 覆盖 `EventListenerObject.handleEvent` 的 `this` 绑定，以及事件 target / currentTarget 的代理语义。
- [x] 为 V3 backup 严格校验补结构畸形回归，覆盖非对象 settings / rule、非对象 action / payload / headers，以及缺少 action 的规则。
- [x] 为 V3 backup / response result validator 补未知规则字段、原型读取抛错和空结果边界回归。
- [x] 为 V3 backup 校验覆盖非法 rule ID / enabled、空白 matcher URL 和 request / response enabled 字段。
- [x] 为 V3 backup 校验覆盖重复 tag ID、空白 tag 名称及非法 used 标记。
- [x] 为 V3 backup 校验覆盖非法 globalEnabled、mode 和 language 值及字段路径。
- [x] 为 V3 backup 校验覆盖非对象 tag 和空 tag ID。
- [x] 为 V3 backup JSON body 校验覆盖 `NaN` 与正无穷输入；按精确 issue path 断言非有限数值被拒绝。
- [x] 为 V3 XHR 覆盖布尔型及对象型 capture 参数映射到不同原生包装监听器，以及按 capture 移除对应包装器。
- [x] 为 response function 缺少 sandbox executor 覆盖 fail-open 和固定 `sandbox-unavailable` 诊断。
- [x] 为 V3 response function 覆盖标记为文本的非法 UTF-8 响应；不执行函数，保留原始字节及固定 unsupported 诊断。
- [x] 为 V3 response function 覆盖响应 snapshot 超过 100 个 header 时 fail-open；不调用 executor，保留原响应并分类为 snapshot-too-large。
- [x] 为 V3 response function 覆盖 response header UTF-8 总字节数超过 32 KiB 时 fail-open 并保留网络响应。
- [x] 为 V3 response function 覆盖 sandbox 加载握手期间 iframe 被替换时拒绝执行且不向新旧 frame 发消息。
- [x] 为 V3 response function 覆盖 sandbox ready 后 run 消息发送失败时清理 pending 并拒绝执行。
- [x] 为 V3 runtime controller 覆盖 no-match 诊断超过 100 条时截断规则列表并设置 truncated 标记。
- [x] 为 V3 Fetch 响应仅修改 headers 时覆盖原始 response body 的克隆保留路径。
- [x] 为 V3 Fetch 覆盖 response executor 抛出 sandbox unavailable 时的错误分类与 fail-open 诊断。
- [x] 为 V3 Fetch 覆盖仅改 headers 且原响应 body 为 null 的保留路径。
- [x] 为 V3 Fetch response function 覆盖无 request / response body 时传入空响应快照。
- [x] 为 V3 Fetch 覆盖函数错误诊断 callback 抛错时仍保留原响应的保护路径。
- [x] 为 V3 Fetch 响应替换覆盖 HEAD 请求及 204 / 205 / 304 状态的无 body 语义。
- [x] 为 Fetch outcome Service Worker 覆盖仅启用 response action 的规则收到 request 网络失败时仍能转发诊断。
- [x] 为 Fetch outcome Service Worker 覆盖重定向构造失败、unsupported response 和 globalEnabled=false 时不读取一次性诊断 arm 的分支。
- [x] 为 Fetch outcome Service Worker 覆盖无效 V3 storage config 时拒绝读取一次性 arm / 转发诊断。
- [x] 为 V3 badge 覆盖配置无效或全局关闭时清除旧徽章并跳过 hit-counter 读取。
- [x] 为 V3 function error Service Worker 覆盖活动函数规则转发及全局关闭、规则 / 匹配 / action 停用过滤。
- [x] 为 V3 function error Service Worker 覆盖 V3 config storage reject 时拒绝转发通知。
- [x] 为 V3 function error Service Worker 覆盖额外私有字段 envelope 在 storage 读取前被拒绝。
- [x] 为 Service Worker 消息入口覆盖 V3 function error 通知 Promise reject 后继续处理后续消息。
- [x] 为 V3 XHR outcome Service Worker 覆盖配置和诊断开关读取失败时不转发通知。
- [x] 为 V3 panel storage 覆盖 hit-counter 二次读取失败及显式清空写入失败。
- [x] 为 V3 XHR 覆盖异步 `open()` 中规则读取 / 匹配异常时按原参数 fail-open。
- [x] 为 V3 XHR 覆盖配置 response function code 时按原生响应 fail-open 并报告 unsupported。
- [x] 为 V3 XHR 覆盖 `responseType=json` 时 `responseText` 保留原生 InvalidStateError。
- [x] 为 V3 XHR 覆盖 dispatch 后 currentTarget 恢复原生状态及空 listener 注册 / 移除。
- [x] 为 V3 XHR 覆盖非法原始 URL 及非法 redirect URL 的原参数 fail-open。
- [x] 为 V3 XHR 覆盖相对请求 URL 以页面 location 为基址解析。
- [x] 为 V3 XHR 覆盖 enabled 但没有 body/status override 的空替换不改变响应且不发 applied outcome。
- [x] 为 V3 XHR 覆盖文本响应替换及替换 body 序列化抛错时 fail-open。
- [x] 为 V3 XHR 覆盖无效替换 status 时保留原响应并报告 failed outcome。
- [x] 为 V3 XHR 覆盖 outcome callback 抛错时不影响原生 send 与请求 body。
- [x] 为 V3 XHR 覆盖未发生重定向的规则遇到同步 send 错误时不误报 redirect outcome。
- [x] 为 V3 Fetch 覆盖运行时非法 status 导致 Response 构造失败时保留原始网络响应并报告 fallback。
- [x] 为 legacy V2 `redirectFetch` 覆盖 per-rule ignore 命中时继续透传原 Request / init 到 native fetch，不执行该重定向。
- [x] 为 V3 Fetch 覆盖 `Request` 输入被 `init` 的 method / body 覆盖后，以有效 method 匹配规则并将 body 保留到 redirect Request。
- [x] 为 V3 XHR 覆盖同 URL 但 method 不匹配时原样发出 native 请求 / 响应且不报告命中。
- [x] 为 legacy V2 interceptor 函数覆盖 Promise reject 后返回配置 fallback、设置 fail-open 标记并记录拒绝错误。
- [x] 为 V3 扩展 E2E 覆盖通过 await 完成的异步函数响应，并验证实际 Fetch 替换 status / body。
- [ ] 完善 Service Worker 消息协议、V3 配置校验及导入 / 导出的边界与错误路径测试。
- [x] V3 hit / hit notice 只从精确的 own data property 描述符读取字段；拒绝 getter、symbol 和隐藏扩展字段，并验证校验不会触发 getter 或 proxy get trap。
- [x] 为 V3 response function result validator 覆盖字段 getter 抛错时的安全、稳定错误结果。
- [x] 为 Service Worker no-match 转发覆盖 100 条规则截断边界、truncated 标志和前 100 条规则顺序 / ID 校验。
- [x] response function sandbox 在 `crypto.randomUUID()` 抛错时使用 fallback execution ID 并完成有效消息往返。
- [ ] 为 Vue 组件和关键用户流程编写组件 / 集成测试。
- [x] BackupRestoreDialog 在规则引用的标签 ID 与当前同 ID 标签名称冲突时禁用追加导入并显示原因；名称一致后可恢复导入。
- [x] ResponseRuleEditor 函数响应保存必须经过明确安全确认；取消时不保存，确认后 payload 默认保持函数响应停用。
- [x] RedirectRuleEditor 在编辑同一对话框切换规则时重新加载 match / redirect URL / method / tags，清除旧校验错误，并保存新的规范 payload。
- [x] 建立扩展端到端测试，覆盖安装、启停、规则编辑和真实页面请求行为。
- [x] 扩展 E2E 覆盖快速创建的精确响应规则被停用并重新加载页面后，原通用规则继续处理匹配请求。
- [x] 在 CI 中运行测试并生成覆盖率报告。
- [ ] 按包和风险级别设定覆盖率目标；核心规则匹配、请求改写和配置校验模块以分支覆盖率至少 95% 为目标，并持续向 100% 提升。
- [x] 先对已达到 95% 的 V3 backup、规则匹配、Fetch、response action 和 XHR 文件启用逐文件分支门槛；未达标的 responseFunctionSandbox 与 runtimeController 已记录，暂不阻塞。
- [x] 报告语句、分支、函数和行覆盖率，关注趋势及关键未覆盖路径，不以整体单一百分比替代风险评估。
- [x] 对无法合理测试的生成代码、静态资源入口等内容，记录原因并在覆盖率报告中可追踪。
- [x] 通过行为断言、边界值、错误注入和回归用例衡量测试质量；视维护成本评估 mutation testing。
- [x] 对浏览器 API 使用隔离的 mock 或浏览器自动化环境，避免测试结果依赖个人机器。

**阶段验收**

- 重要生产模块有对应测试策略，核心请求、状态同步、配置校验和主要面板流程有自动化回归保护。
- 核心高风险模块达到至少 95% 分支覆盖率目标，并持续向 100% 提升；未达目标的部分有明确记录和后续安排。
- CI 检查测试通过并生成覆盖率报告；覆盖率回退门槛按包逐步启用，排除项可查看、可审查。
- 关键缺陷有对应回归用例，防止再次出现。

### 阶段 7：文档与发布

- [ ] 更新中英文 README、安装、使用、规则配置和 FAQ。
- [ ] 说明自定义函数能力与风险，补充可复制的示例。
- [x] 说明 V2 与 V3 配置 / 备份不兼容，并提供 V3 备份、恢复和重新配置指南；详见 `docs/V3-BACKUP-RESTORE.zh.md`。
- [ ] 维护版本号策略、变更日志格式和发布检查表。
- [ ] 从干净环境执行完整构建，并在目标浏览器加载验证扩展产物。
- [ ] 完成权限、兼容性、核心请求和配置导入导出回归检查。
- [ ] 规划 V3 发布说明、问题反馈渠道及必要的回滚方案。
- [ ] 通过阶段性 PR 和版本发布展示进展，确保每次变更便于审查。

**阶段验收**

- 新用户能按文档安装并完成核心操作。
- 旧用户有清晰的升级和数据保护指引。
- 发布包经过构建、加载和关键场景检查。

## 4. 建议的 PR / 提交粒度

尽量以一个可独立审查的主题组织 PR，例如：

- `build: upgrade Node and toolchain`
- `fix: preserve Fetch request options during redirect`
- `test: cover redirect rule priority`
- `feat: add rule diagnostics`
- `ui: redesign interceptor editor`

每个 PR 建议包含：

- [ ] 清晰说明解决的问题和用户可见变化。
- [ ] 限定在一个主要主题内，避免混入无关格式化或重命名。
- [ ] 附上测试方式、测试结果及尚未覆盖的情况。
- [ ] 涉及配置格式时说明兼容和迁移影响。
- [ ] 涉及界面时附截图或动图，便于审查。

## 5. 计划维护与新增需求

重构期间持续收集新想法、用户反馈和技术发现。新增事项先登记，再评估是否纳入当前阶段或安排到后续版本，避免遗漏想法，也避免 V3 范围无序扩大。

每项新增事项记录：

- [ ] 需求描述及提出来源。
- [ ] 要解决的问题、目标用户和预期收益。
- [ ] 实现成本、技术依赖、安全 / 兼容性风险及维护成本。
- [ ] 对当前阶段、发布时间、测试范围和数据兼容的影响。
- [ ] 建议优先级：`Must`（V3 发布必需）、`Should`（V3 重要）、`Could`（有余力时纳入）或 `Later`（后续版本）。
- [ ] 可验证的验收标准及对应测试。

评估后更新相应阶段的待办和验收标准，并记录决策理由。若新增事项导致 V3 范围或阶段顺序变化，同步更新阶段总览和发布范围；暂不纳入的事项保留在后续版本列表中。

### 后续版本候选

- [ ] 在开发过程中持续补充尚未纳入 V3 的想法和需求。
- 通用请求 / 响应 Headers 读取与改写（issues #55、#48）。
- 请求体改写，待定义流、FormData、二进制与体积边界（issue #44）。
- 跨面板持久化规则草稿与自动恢复（issue #37）；可先单独评估关闭确认。
- 自动识别或协调其他 Fetch / XHR 修改扩展（issue #46）；V3 只保留人工排障说明。
- 页面规则命中光晕及动画，需先完成无障碍与性能方案。
- 命名配置 profiles、多规则链式叠加、嵌套规则组及 V2 备份转换。

## 6. 产品与技术决策

- [x] V3 最低支持哪些浏览器及版本？Chrome 稳定版 141+ 与 Edge 稳定版 140+（2026-09-24 初始策略；按季度复核）。
- [x] 浏览器版本策略：以最近 12 个月发布的稳定正式版作为兼容窗口，每季度复核并提前公告停止支持的版本。
- [x] 不要求 Beta / Dev 等预览版兼容；优先使用经过稳定发布的扩展 API、JavaScript 和 CSS 能力，非核心的新能力提供降级行为。
- [x] 编译目标与 CI 浏览器矩阵覆盖最低支持版本和当前稳定版；低于最低版本的浏览器不作为发布阻塞项。CI 覆盖 Chrome 141 / Edge 140 最低版及两者当前 Stable。
- [x] 是否要求兼容 V2 规则和备份？不要求；V3 使用新的配置格式，不提供自动迁移。
- [x] 组合规则与多规则场景采用首条命中、按优先级叠加，还是显式链式执行？采用列表中首条启用且 URL / method 命中的规则负责整次请求，不叠加或链式应用后续规则。
- [x] 重定向目标计算失败、网络响应失败或响应解析失败时，组合规则如何回退？请求构造 / 目标解析在派发前失败时 fail-open 使用原请求；重定向请求已派发后网络错误沿用原生失败且不重试；响应替换 / 解析失败回退到原响应。
- [x] V3 遇到 V2 格式备份时明确提示格式不兼容；不提供自动迁移或转换工具。
- [x] 编辑器选型原则：轻量是约束之一，JSON 的直观结构化调整是明确需求；CodeMirror 6 可作为函数编辑和 JSON 文本模式的候选，但不得默认替代树形交互。允许按需组合代码编辑器和专用 JSON 树编辑器，以原型的真实交互和生产体积数据决定。
- [ ] 自定义函数是否保留；若保留，如何呈现执行风险和超时策略？
- [ ] V3 首发必须包含哪些新增功能，哪些放入后续版本？
- [ ] 界面是否需要暗色模式、窄屏适配及特定设计风格？
- [ ] 是否有目标发布日期或分阶段公开预览计划？
- [x] V3 国际化语言范围：只维护简体中文和英文；切换控件采用直接可见的双选分段按钮，不使用下拉菜单。
- [ ] V3 最终采用怎样的 monorepo 包边界和包内目录约定？阶段 0 完成依赖图及迁移提案，阶段 2 按小步重构落实。

## 7. 已识别的问题清单

以下问题在现有代码审查中识别，纳入重构期间的复现、修复和回归验证：

- [ ] Fetch 重定向可能丢失 `Request` 或 `init` 中的请求选项。
- [ ] 拦截与重定向规则的命中优先级及后续处理不一致。
- [ ] 自定义异步函数可能不生效、挂起或缺少回退。
- [ ] Fetch 使用 `Request` 对象时 method 识别可能不正确。
- [ ] 替换响应时对无 body 状态和旧 headers 的处理需要验证。
- [ ] XHR 重定向包装可能改变 `open()` 的原生语义。
- [ ] 扩展上下文间的存储缓存可能不同步。
- [ ] 空规则导入和清空行为可能无法覆盖旧数据。
- [ ] 页面脚本注入及初始化状态同步依赖加载时序。
- [ ] `eval` 执行用户函数的能力、边界和提示需要审查。
- [ ] 启停时恢复原始 Fetch / XHR 可能覆盖页面其他脚本的包装。
- [ ] 自动化测试和 CI 保障不足；部分开发依赖较旧。
- [ ] 非扩展环境下 localStorage 的初始化与缓存读取行为需要核查。

## 8. GitHub Issues 需求回顾

已将仓库中开放和已关闭的 Issues 作为需求输入。Issue 的关闭状态只代表当时的处理结果，不直接等价于 V3 已满足；相关方向需结合现有实现复核，并通过回归测试确认。

### 纳入 V3 需求评估

- [x] **请求与响应 Headers 能力评估**：本期不增加通用读取 / 改写入口；保留已实现的静态重定向请求头能力，静态响应头因 XHR 不等价暂缓（issues #55、#48、#22）。
- [x] **即时命中反馈**：跨标签页显示最近一次规则命中及原始请求与匹配条件；当前事件不代表改写成功。
- [x] **命中诊断**：已提供用户主动开启的临时未命中、Fetch outcome 和异步 XHR outcome 诊断；限制记录数与字段，不写入持久化存储。
- [x] **启用与命中视觉提示评估**：扩展图标 / 面板显示启用状态；页面命中光晕与动画不纳入 V3，因跨 frame / SPA、无障碍、减少动态效果及性能面需独立验收。
- [x] **编辑防丢失评估**：不引入跨面板持久化草稿；函数源码敏感留存、过期与冲突处理成本超过本期价值，关闭确认留作轻量后续提案。
- [x] **请求体修改评估**：不纳入 V3；流式 / FormData / 二进制处理、重放与大小限制需要单独设计和完整跨浏览器验证。
- [x] **组合式规则**：已在阶段 2 完成；单规则可组合重定向与响应 action，按 Fetch / XHR 能力边界执行。
- [x] **规则创建效率**：已完成从最近命中记录打开预填编辑器；草稿默认停用，用户确认保存后仍需显式启用。
- [x] **同类扩展冲突评估**：不做自动识别 / 协调；页面脚本包装顺序不可可靠控制。人工排障说明列入阶段 7 文档验收。
- [x] **源码构建文档评估**：已有 README 源码加载说明及 V3 构建 / 测试命令；完整开发环境步骤作为阶段 7 文档任务，不扩展 V3 功能范围。

### 纳入兼容性与回归测试

- [ ] 测试面板关闭 / 重开、多标签切换和 storage 更新时规则与标签数据不会丢失。
- [ ] 测试页面使用 import map 等脚本功能时，扩展注入不破坏页面原有加载行为。
- [ ] 测试快速或重复触发请求时不会因包装器引入请求循环、重复发送或递归拦截。
- [x] 评估命中视觉提示的跨 frame / SPA、滚动、视口、动画及可访问性测试成本；由于页面光晕不纳入 V3，相关视觉效果测试留待后续版本设计时制定。
- [ ] 测试与网页自身及其他扩展修改 Fetch / XHR 时的冲突表现，并提供可理解的限制说明。
- [ ] 将函数式重定向、正则匹配、状态码自定义和函数式响应纳入回归测试与文档示例，避免已有能力在重构中退化。

### Issue 来源

- 开放：[#55 希望增加 header 返回](https://github.com/Nyakooo/ajax-proxy/issues/55)。
- 已关闭：[#54 指定接口 mock 不稳定](https://github.com/Nyakooo/ajax-proxy/issues/54)、[#53 源码生成插件文档](https://github.com/Nyakooo/ajax-proxy/issues/53)、[#51 命中规则但数据未生效](https://github.com/Nyakooo/ajax-proxy/issues/51)、[#49 拦截与重定向能否同时使用](https://github.com/Nyakooo/ajax-proxy/issues/49)、[#48 获取请求 Header](https://github.com/Nyakooo/ajax-proxy/issues/48)、[#47 重开面板后数据丢失](https://github.com/Nyakooo/ajax-proxy/issues/47)、[#46 与同类扩展冲突](https://github.com/Nyakooo/ajax-proxy/issues/46)、[#44 修改请求体](https://github.com/Nyakooo/ajax-proxy/issues/44)、[#42 拦截后请求重复发送](https://github.com/Nyakooo/ajax-proxy/issues/42)、[#40 函数式重定向与原 URL 使用](https://github.com/Nyakooo/ajax-proxy/issues/40)、[#39 import map 兼容](https://github.com/Nyakooo/ajax-proxy/issues/39)、[#37 编辑时误关闭造成数据丢失](https://github.com/Nyakooo/ajax-proxy/issues/37)、[#34 URL 匹配方式](https://github.com/Nyakooo/ajax-proxy/issues/34)、[#30 函数式修改响应体](https://github.com/Nyakooo/ajax-proxy/issues/30)、[#27 自动添加规则](https://github.com/Nyakooo/ajax-proxy/issues/27)、[#25 JSON 编辑器中文输入问题](https://github.com/Nyakooo/ajax-proxy/issues/25)、[#22 重定向自定义请求头被移除](https://github.com/Nyakooo/ajax-proxy/issues/22)。

---

阶段任务应进一步拆分为可独立交付的 issue 和 PR，并在实施过程中维护完成状态、验收记录及相关文档。

## 9. 执行记录

- 2026-09-24：开始阶段 0；完成 monorepo 包、主要依赖、脚本、扩展 manifest、发布脚本、当前主要功能和配置结构的初步清点。基线见 `docs/V3-BASELINE.zh.md`。浏览器范围为 Chrome / Edge 稳定版，初始最低版本锁定为 Chrome 141 / Edge 140；按季度复核最近 12 个月稳定版窗口。按“最新 LTS”原则，Node 目标为 24.21.0。已确认不提供 V2 配置自动迁移。阶段 0 还需依赖图与目标结构构建验证。
- 2026-09-24：阶段 1 工具链基线已落地：Node 24.21.0、pnpm 12.6.0、lockfile v9、TypeScript 6.0.3、Vue CLI 5.0.9；更新 TS6 配置并修复 Vue CLI / Webpack 在 Node 24 下的构建问题。完整 `pnpm build`、冻结安装及 `pnpm typecheck` 通过；四个 TypeScript 包已纳入统一检查，shell-chrome 补齐 TypeScript 6 直接依赖。CI 执行迁移范围 lint / 格式检查、类型检查、单元测试 / 覆盖率、生产构建、ZIP 和体积报告；旧 Webpack 暂以 `--openssl-legacy-provider` 兼容，CSS export 警告仍待归类。基线见 `docs/V3-BASELINE.zh.md`。
- 2026-09-24：纳入最新补充：阶段 1 增加 ZIP / JS / CSS 大小基线和编辑器按需加载目标；阶段 3 增加最低浏览器版本 API / CSS 兼容审查及非核心降级；阶段 4 以 PrimeVue 4 styled + 自定义 token 为首选，按需验证 Pass Through / unstyled，必要时才评估 Tailwind CSS v4；加入启用状态、命中边缘光晕、减少动态效果和多 frame / SPA / 滚动验证。组合规则建议记录于 `docs/V3-RULE-MODEL.zh.md`，仍待实现阶段原型验证。
- 2026-09-24：生成扩展 ZIP 并记录 V2 产物体积，新增 `pnpm size:report` 可重复报告；当时 ZIP 为 746,700 B，JS 2,139,164 B（gzip 估算 579,666 B），CSS 678,629 B（gzip 估算 86,779 B）。确认 Ace / JSONEditor 都在面板主 JS chunk，按需加载与 V3 预算仍待实施。浏览器 API 盘点记录于 `docs/V3-BROWSER-COMPATIBILITY.zh.md`；当前最低支持版本锁定为 Chrome 141 / Edge 140，真实浏览器 smoke test 和 CI 矩阵待阶段 1 完成。
- 2026-09-24：补充编辑器评估原则：JSON 的结构化、直观调整是产品需求，不能为减少依赖而退化成纯文本编辑。阶段 4 将比较 CodeMirror 6、裁剪 JSONEditor 及轻量树形方案，并支持两种编辑器按需组合；以交互原型和最终生产包数据决定。
- 2026-09-25：新增 V3 目录结构专项评估与迁移任务。现有顶层包大致按运行职责拆分，但 Vue 面板内部仍有 `common` 聚合目录、编辑器独立包、旧版 `compatibility` 包及分散测试 / fixture；需结合新的组合规则模型、Vue 3 UI、测试分层和 V2 不兼容策略重新核实边界，暂不预设必须整体推倒重排。
- 2026-09-25：按维护者补充，将 V3 国际化范围限定为简体中文和英文；语言切换改为始终可见、点击即生效的双选分段控件，并纳入非目标语言资源清理、中英文文案完整性、选择持久化和编辑器语言同步验收。
- 2026-09-25：阶段 1 增加 Vitest 5 + V8 覆盖率工具、根级测试命令、源码 alias、CI 覆盖率步骤及 `docs/V3-TESTING.zh.md`；首批 7 项规则匹配 / 静态重定向回归用例已通过。记录 workspace TS 源码初始覆盖率（statements 8.46%、branches 4.69%、functions 5.55%、lines 8.39%），详见测试基线文档。Vue Test Utils + jsdom 与 Playwright 定为后续工具，尚未安装 / 验证；CI 实际浏览器矩阵、lint / 格式检查、包边界与目录职责仍未完成，本阶段暂不验收或提交。
- 2026-09-25：阶段 0 问题登记补充到 `docs/V3-ISSUES.zh.md`。通过临时 Vitest 调用实际 Fetch 拦截包装器复现：以 `Request` 传入 POST 而省略 `init` 时，POST 规则未生效，因为 method 只从 `init.method` 读取；临时用例已删除，持久化修复与回归测试安排在阶段 2。其余静态审查线索仍标为待复现。
- 2026-09-25：完成首轮 V3 目录结构、跨包依赖、声明 / 构建产物、编辑器加载和测试夹具归属评估，迁移建议、clean-build 风险及验收标准见 `docs/V3-ARCHITECTURE-ASSESSMENT.zh.md`。这是方案交付，不代表已执行包迁移；V3 schema / core 分层和 `compatibility` 去留需在阶段 1 / 2 分步处理。
- 2026-09-25：加入 Prettier 3.9.9 精确版本、根格式规则、忽略构建产物配置和 `pnpm format:check`，首批覆盖计划 / 文档 / 根配置 / workflow / Vitest 配置和测试，并接入 CI。旧业务源码尚未统一格式，需随迁移逐步扩大范围；ESLint 尚未选型和接入。
- 2026-09-25：在 Prettier 依赖新增后重新通过完整生产构建、ZIP 与体积报告。Prettier / ESLint 安装后的 clean build 及其连续复跑结果一致：ZIP 746,704 B，JS 原始 2,139,164 B / gzip 合计 579,671 B，CSS 原始 678,629 B / gzip 合计 86,779 B；最新复测值已补记于 `docs/V3-SIZE-BASELINE.zh.md`。
- 2026-09-25：为阶段 0 至阶段 7 建立 GitHub milestones（#1 至 #8）；Fetch Request.method 已复现缺陷建 issue #56 并归入阶段 2。阶段 0 的“阶段验收标准及跟踪目标”项完成；架构方案尚未经过目标结构 clean build，阶段 0 总体验收仍未完成。
- 2026-09-25：加入 ESLint 10.11.0、Vue 2 flat config 与 TypeScript lint 配置，新增 `pnpm lint` 和全源码盘点命令 `pnpm lint:all`。CI 阻塞检查先覆盖迁移范围的新配置 / 脚本 / 测试；对现有 package 全量盘点发现 97 个错误和 231 个警告，旧业务源码需逐步清理，不能一次性格式化或静默忽略。
- 2026-09-25：执行 `pnpm clean:build` 后完成 workspace 全量构建、四包类型检查、7 项测试、迁移范围 lint / 格式检查、ZIP 和体积报告；连续构建体积一致。当前构建顺序可恢复现有包产物，但目标 V3 边界还未实现，不能据此关闭目录迁移或阶段 0 验收。
- 2026-09-25：将仍由 shell 启动和面板导入路径调用的旧 `compatibility` workspace 包迁至 `packages/v2-compatibility`，改名为 `@proxy/v2-compatibility`，同步更新 workspace 依赖、导入、脚本、README 与基线文档；V2 原行为保留，V3 不兼容旧格式的策略不变。冻结安装、四包类型检查、7 项测试、迁移范围 lint / 格式检查及 clean workspace 构建均通过；全源码 lint 遗留问题、包边界与目录职责、浏览器矩阵等仍未完成。计划核对项为 29 / 175（约 16.6%），阶段 1 尚未验收，因此暂不提交。
- 2026-09-25：新增 Playwright 1.63.0 稳定版 Chrome / Edge CI 矩阵及网页运行时 smoke 脚本，验证 Request + Fetch POST、XHR GET 往返、CSS Grid 和 reduced-motion 媒体查询；配套 Chromium 本地运行通过。Playwright 不支持通过启动参数在品牌 Chrome / Edge 中侧载扩展，因此矩阵验证运行时 Web API，扩展 E2E 仍需配套 Chromium；Chrome 141 / Edge 140 最低版本扩展集成和 JS / CSS 静态兼容扫描仍未完成。当前计划核对数仍为 29 / 175（约 16.6%），阶段 1 未验收，暂不提交。
- 2026-09-25：在本机安装 Google 官方签名的 Chrome Stable，并在 Chrome Stable 与 Edge Stable 中加载扩展 2.2.10，使用临时 `/api/echo` 规则实际验证 Fetch 和 XHR 均返回拦截响应。两浏览器的临时规则均已删除、全局拦截已关闭；浏览器保留扩展供后续验证。记录于 `docs/V3-BROWSER-COMPATIBILITY.zh.md`。此项仅验证当前 Stable，Chrome 141 / Edge 140 最低版本扩展集成与 JS / CSS 静态兼容扫描仍未完成；阶段 1 仍未验收，暂不提交。
- 2026-09-25：将 Vue 面板 Babel / PostCSS 目标明确设为 Chrome 141+ / Edge 140+，TypeScript 与 Vite 的语法输出目标设为 ES2022。编辑器库保留更保守的 Babel 目标；把最低版本直接应用到 JSONEditor 的独立库构建会产生无效 CSS，因此将目标限定在最终面板，同时由面板的 Babel / PostCSS 处理输出。使用 Node 24.21.0 执行 clean build、全量构建、类型检查、7 项单元测试、格式检查和迁移范围 lint 均通过；既有 Vue CSS export 警告仍在。Web API / CSS 特性静态兼容扫描和 Chrome 141 / Edge 140 最低版本扩展集成矩阵仍待完成，阶段 1 未验收，暂不提交。
- 2026-09-25：新增 `tests/browser/extension-smoke.cjs`，使用一次性 persistent context 加载实际构建扩展，通过面板 UI 创建临时 `/api/echo` 规则并确认 Fetch / XHR 返回覆盖响应；CI 在生产构建后运行 `pnpm extension:smoke`。将两个浏览器 smoke 归入 `tests/browser/`，扩展测试会自动销毁临时 profile 和本地服务。阶段 1 测试目录约定和浏览器兼容 CI 项完成，计划核对数为 31 / 175（约 17.7%）；最低版本品牌浏览器扩展验证、全源码 lint、包边界等仍未完成，阶段 1 暂不提交。
- 2026-09-25：扩展 `clean:build` 以覆盖编辑器库和 Vue 面板生成目录；发现 Vue CLI 为私有编辑器包并行构建 UMD / CommonJS 时会竞争写同一个 `index.css`，导致 CSS 非确定性损坏。两个编辑器包已限制为构建其实际入口 `main` 所用的 CommonJS 格式。Node 24.21.0 下删除构建产物后完整 `pnpm build` 通过，随后 `pnpm extension:smoke` 再次通过；稳定复现与修复记录补入架构评估。当前总进度仍为 31 / 175，阶段 1 未验收，暂不提交。
- 2026-09-25：修复 `@proxy/v2-compatibility` 对 `@proxy/lib/types/types` 私有路径的依赖；`@proxy/lib` 根入口现导出兼容模块使用的类型。新增 `pnpm check:boundaries`，检查 7 个 workspace 包依赖图无环、跨包依赖有 manifest 声明且不导入深层源码路径（仅允许 JSON 编辑器 CSS 资源入口），并加入 CI。Node 24.21.0 clean build、四包 typecheck、7 项单测、边界检查、lint、格式检查与扩展 Fetch / XHR smoke 均通过。全源码 lint、声明文件生成策略、核心与 shared-utils 的职责边界以及浏览器最低版本品牌浏览器扩展验证仍未完成。当前核对项 33 / 178（18.5%），阶段 1 未验收，不提交。
- 2026-09-25：完成阶段 1 工程基础验收。将纯消息 / storage key 常量提取到 `@proxy/protocol`，解除核心请求引擎对 Chrome storage / badge 工具包的依赖；拆分 Vue 面板 `common` 目录，校准 shell 包入口及兼容包公共类型。全包 lint / 格式债务门禁、声明漂移检查、8 包依赖边界 CI 和 Edge 140 固定版本浏览器矩阵完成；clean build、冻结安装、typecheck、7 项单测、lint / format、Chrome 141 最低版扩展 smoke、JSON 树形编辑全交互及错误定位 smoke、生产 ZIP / JS / CSS 体积测量通过。CodeMirror 6 评估说明了仅做文本编辑无法替代已验证的 JSON 树操作；异步拆分原型留在阶段 4。阶段 0 与阶段 1 验收完成，Edge 140 的远端 CI 首次结果仍待获取。
- 2026-09-25：按阶段完成要求汇总并更新清单：41 / 178 项完成（23.0%）；阶段 0 与阶段 1 验收完成，已提交为独立工程基础检查点。Edge 140 固定版本 CI job 已配置，远端执行结果待 CI 提供。
- 2026-09-25：阶段 2 修复已复现的拦截器 Fetch Request method / URL 缺陷。先添加并确认 3 项回归测试可复现旧问题，再修复 method 优先级（`init.method` > `Request.method` > 默认 GET）及 Request URL 匹配，并将相同 method / URL 用于通知与函数响应上下文；单测 10 项通过，Chrome 141 生产扩展 Fetch / XHR E2E 通过。重定向模式的 Request 输入仍待单独验证。当前完成 43 / 179 项（24.0%），此阶段子项准备独立提交。
- 2026-09-25：阶段 2 完成重定向模式 `fetch(new Request(...))` 的 URL / method 匹配及请求属性转发。新增 3 项 Vitest 回归用例，验证 Request 与 init 覆盖、method 不匹配后继续查找以及 method、body、headers、credentials、mode、cache、redirect、referrerPolicy、signal 保留；扩展面板真实配置 POST 规则后，由目标服务确认 URL、body、原始与新增 header、cookie 均正确。`pnpm test` 共 13 项通过，覆盖率为 statements 13.40%、branches 13.24%、functions 9.79%、lines 13.51%；Chrome for Testing 扩展 E2E 通过。阶段 2 累计完成 45 / 179 项（25.1%），此阶段子项可独立提交。
- 2026-09-25：阶段 2 统一自定义函数执行语义，兼容原有 callback 和 Promise 返回值，移除依赖源码中出现 `next(` 的检查；函数抛错、Promise 拒绝、返回值无效或异步回调超时（5 秒）均 fail-open。响应拦截回退原响应且不发命中通知，重定向回退原始请求。新增函数执行及 Fetch / redirectFetch 集成回归；`pnpm test` 共 19 项通过，覆盖率为 statements 21.61%、branches 18.03%、functions 21.56%、lines 22.32%。阶段 2 累计完成 47 / 179 项（26.3%），本检查点可独立提交。
- 2026-09-25：阶段 2 修复 Fetch 响应替换的空 body、状态码、实体 headers 与 Response 元数据。HEAD 和 204 / 205 / 304 返回 null body；删除可能失真的 Content-Length、Content-Encoding、Content-Range 和 Transfer-Encoding；非法响应码回退原始响应；替换响应保留原始 url、redirected、type。5 项新回归用例先在旧实现上复现失败，修复后 `pnpm test` 共 24 项通过；覆盖率为 statements 21.82%、branches 19.96%、functions 21.05%、lines 22.44%。Chrome 扩展 E2E 核对真实 Fetch 的 Response 元数据与 Content-Length 清理。阶段 2 累计完成 48 / 179 项（26.8%），本检查点可独立提交。
- 2026-09-25：阶段 2 统一规则优先级与命中通知。Fetch / XHR 拦截均选择第一条启用且 URL / method 匹配的规则；重定向 XHR 跳过 method 不匹配的规则，并按首条完整命中改写。命中事件增加规则序号，service worker 仅递增该规则，即使多个规则的 URL / method 相同也不会一起计数。新增 Fetch / XHR 首条命中、规则序号、徽章精确计数及重定向 XHR method mismatch 回归；29 项 Vitest 通过。阶段 2 累计完成 50 / 179 项（27.9%），本检查点可独立提交。
- 2026-09-25：修复 XHR 重定向把原生 `open()` 包装成 async 函数的问题。`open()` 现在同步完成并原样转发 method、async、username、password；静态和同步 callback 规则立即应用，Promise / 延迟 callback 规则因原生 API 无法等待而警告并使用原 URL，避免破坏紧随其后的 header / send 调用。验证覆盖同步 callback、Promise fail-open、同步 `open(false)`、参数保留和自定义 header；全量 build、32 项 Vitest、coverage、typecheck、lint、format、边界、生成声明和 editor smoke 通过。阶段 2 累计完成 51 / 179 项（28.5%），本检查点可独立提交。
- 2026-09-25：检查 XHR 实例复用、header、`readystatechange` 顺序和异常回退。复现拦截 XHR 复用时旧 responseText/status 覆盖值残留、重复请求命中通知锁未重置；每次 `open()` 现清空请求 body、旧响应缓存和命中锁。回归覆盖重定向 header 包装在新请求恢复、响应替换先于 `readystatechange` 回调可见、函数抛错时保留原响应且不计命中、同步重定向函数抛错时使用原 URL。通用 `addEventListener` 注册与移除的转发行为登记为待确认；36 项 Vitest、coverage、全量 build、typecheck、lint、format、边界检查、生成声明校验、Chrome 扩展 smoke 与 editor smoke 均通过。阶段 2 累计完成 52 / 179 项（29.1%），本检查点可独立提交。
- 2026-09-25：定义并验证网页 Fetch / XHR 包装器共存策略。注入前的页面实现会作为底层并在禁用时恢复原引用；如果页面后来在扩展外层增加包装器，状态更新不覆盖页面当前引用，内层代理按当前开关 / 模式透传，同模式再次启用可恢复。页面外层包装器隐藏代理且切换了代理模式时，安全保留包装链并要求重载页面以安装新模式。7 个测试文件、38 项测试通过；coverage 为 statements 47.24%、branches 45.51%、functions 41.13%、lines 48.30%。阶段 2 累计完成 53 / 179 项（29.6%），本检查点可独立提交。
- 2026-09-25：建立跨 content script、service worker 和面板的配置同步。共享 storage cache 订阅 `chrome.storage.onChanged` 并处理初始化期间到达的变更；各标签页 content script 将完整配置快照同步给页面代理；service worker 停止只向最近连接的单个标签页转发规则。扩展 smoke 同时打开两个页面，在面板切换拦截 / 重定向并创建规则后，两页 Fetch / XHR 拦截及 Fetch 重定向均通过；storage cache 变更和初始化竞态单测通过。全量 build、typecheck、40 项 Vitest、coverage、lint、format、扩展 smoke 和 editor smoke 均通过。阶段 2 累计完成 54 / 179 项（30.2%），本检查点可独立提交。
- 2026-09-25：Storage API 初始化、读取、写入、删除和清空错误现在会拒绝 Promise 并发出统一错误事件；面板显示初始化与保存错误；配额失败不会污染本地缓存，数据变化监听及初始化竞态已覆盖。`pnpm test` 8 个文件、43 项通过；coverage 为 statements 50.22%、branches 48.35%、functions 46.51%、lines 51.02%。typecheck、lint、format、包边界、完整 build、Chrome 扩展 smoke、editor smoke 通过；构建写回生成声明属于本次 API 返回类型变化。阶段 2 累计完成 55 / 179 项（30.7%），此检查点可独立提交。
- 2026-09-25：普通网页 localStorage 现在于 `initStorage()` 初始化缓存，并与扩展存储采用相同的缓存读写语义；set / remove / clear 更新缓存，跨标签 `storage` 事件同步，受限存储初始化错误返回拒绝的 Promise 并统一记录。新增普通网页初始化、读写 / 删除 / 清空、跨标签更新和初始化错误测试；8 个测试文件、46 项通过，coverage 为 statements 54.08%、branches 50.16%、functions 50.00%、lines 55.55%，storage statements 63.97%。typecheck、lint、format、边界、完整 build、Chrome 扩展 smoke、editor smoke、生成声明检查通过。阶段 2 累计完成 56 / 179 项（31.3%），此检查点可独立提交。
- 2026-09-25：确定 V3 空规则列表语义：备份采用完整快照，必需规则字段的空数组导入会清空旧列表；缺失、`null`、非数组均拒绝；更新按列表整体替换；清空非空规则需确认，空列表仍可导出。V2 空数组忽略行为只作为历史事实，不作为 V3 合同。规则模型文档补入实现验收用例；阶段 2 累计完成 57 / 179 项（31.8%），该语义设计检查点可独立提交，schema / importer 实现与测试仍待后续计划项。
- 2026-09-25：新增无浏览器依赖的 `@proxy/v3-domain`，定义 `ajax-proxy-backup` 格式版本 3 的完整备份 envelope、设置 / 标签 / 规则基础结构和路径化校验；未知字段、错误版本、重复 ID、非法状态码或非 JSON body 拒绝，空 rules 合法且 V2 文件明确拒绝。4 项 schema 单测通过，并纳入 workspace build、typecheck、clean build 和包边界检查。阶段 2 累计完成 58 / 179 项（32.4%），规则 action 能力细节继续随平台审查演进。
- 2026-09-25：补齐纯 JSON 文件解析入口，`parseV3BackupJson()` 统一返回语法及字段错误路径，识别 V2 格式并提供明确拒绝原因，支持 BOM 输入；`formatV3ValidationIssues()` 提供可展示文本。5 项 domain 测试通过，workspace 9 个文件、51 项测试通过；coverage 为 statements 54.86%、branches 51.77%、functions 52.38%、lines 56.36%。阶段 2 累计完成 59 / 179 项（33.0%），UI 接入仍待面板迁移。
- 2026-09-25：扩展 E2E 增加 all-frames 子 frame 的 Fetch 拦截验证；同一持久化 profile 完整关闭并重启浏览器后，确认扩展 service worker 重新启动、local storage 配置仍在且 Fetch 重定向继续生效。扩展 smoke 通过；阶段 2 累计完成 60 / 179 项（33.5%），该验证检查点可独立提交。
- 2026-09-25：审查 manifest 权限与调用点，确认 storage、通知阈值提醒、活动页标题 / URL 和 `<all_urls>` 主世界脚本的功能依据；尝试移除 `tabs` 后，扩展 E2E 观察到 `chrome.tabs.query()` 不再返回活动页 title，故恢复该权限并将该限制写入审查记录。通知切换到 `chrome.notifications`，在 service worker 顶层注册点击事件；52 项 Vitest 通过，coverage 为 statements 55.91%、branches 51.63%、functions 53.15%、lines 57.60%，typecheck、lint、包边界、manifest 构建和扩展 smoke 通过。见 `docs/V3-PERMISSIONS.zh.md`。阶段 3 累计完成 61 / 179 项（34.1%），可独立提交。
- 2026-09-25：明确 V3 自定义函数只用于受限的 response 计算；函数接收校验过的数据副本，在无扩展 API、无网络能力且可硬终止的 sandbox worker 中运行，最长 5 秒，异常 / 超时 fail-open。含代码导入不自动执行且规则保持停用；中英文风险提示和隔离验收项已写入 `docs/V3-USER-FUNCTIONS.zh.md`。V2 `window.eval` 主世界风险与同步死循环无法由现有计时器中断的限制已明确登记。阶段 3 累计完成 62 / 179 项（34.6%），执行器和 UI 警示仍待实施。
- 2026-09-25：V3 backup JSON 含 response `code` 时，解析器现返回字段路径风险 warning，并在导入数据中停用对应 response action，不修改输入对象；用户确认文案和测试覆盖已添加。53 项 Vitest 通过，coverage 为 statements 56.43%、branches 52.13%、functions 53.40%、lines 58.02%；domain statements 覆盖率 64.56%。阶段 3 累计完成 63 / 179 项（35.2%），UI 警示呈现与单独启用动作待面板接入。
- 2026-09-25：加固 content script、页面代理、面板和 service worker 的消息边界。`@proxy/lib` 新增完整状态、拦截规则和重定向规则的结构校验，并提供具名规则更新入口保留空数组语义；页面代理拒绝跨 frame / origin、未知路由及格式错误的快照，service worker 校验扩展 ID、tab / extension page sender、标题、徽章和规则消息，面板与 service worker 长连接也校验实际发送方。页面主世界可伪造同页 `postMessage` / 自定义事件，故该通道按不可信数据处理，仅允许影响本页代理和命中统计，明确不用于扩展权限、存储或授权决策。新增 validator、命中数据和长连接来源测试；13 个测试文件、61 项通过，完整构建、typecheck、format、包边界、编辑器 smoke、扩展 smoke 均通过；全源码 lint 345 个既有 warning、0 error。Playwright Chromium smoke 覆盖 Fetch、XHR、iframe、redirect 和 service worker 重启；Chrome Stable 154.0.8037.58、Edge Stable 153.0.4234.48 均重载解压扩展并成功打开面板，Edge service worker 在空闲时正常休眠。阶段 3 累计完成 64 / 179 项（35.8%），此检查点可提交。
- 2026-09-25：移除面向所有匹配网站的 `document.js` 可访问资源声明，改为 manifest MAIN 世界静态内容脚本；isolated-world `content.js` 仍负责扩展存储和转发，global on 时仅向当前 frame 同步代理所需规则。确认构建 manifest 不含 `web_accessible_resources`，注入脚本和规则可见边界写入权限与消息安全说明；全量构建、typecheck、61 项单测、扩展 smoke（Fetch / XHR / iframe / redirect / service worker restart）通过，Chrome Stable 154.0.8037.58 与 Edge Stable 153.0.4234.48 均重载并打开面板。阶段 3 累计完成 65 / 179 项（36.3%），可提交。
- 2026-09-25：V3 backup schema 增加 5 MiB UTF-8 文件、规则 / 标签数、matcher / redirect / method / header / function 字段长度、header 字符集、HTTP(S) redirect scheme、200–599 status、JSON body 深度和节点数限制；JSON body 用迭代方式检查，导入阶段拒绝无效 regex 语法。新增说明和资源边界测试；完整 build、typecheck、13 个测试文件 / 63 项单测、format、包边界和生成声明检查通过。阶段 3 整体仍为 65 / 179 项（36.3%）；原生 RegExp 仍可能灾难性回溯，需继续处理运行时 matcher 后再完成该计划项。
- 2026-09-25：阶段 3 完成输入校验与运行时匹配器加固：`@proxy/protocol` 和 `@proxy/lib` 使用 `re2js@2.8.6` 校验 / 执行 RE2 正则，原生回溯语法（如 lookahead、backreference）拒绝；最多 1,000 条规则、100 条正则、65,536 字符请求 URL、256 项 LRU 编译缓存，并限制 header、函数源码、状态码和 JSON body；无效或超长运行时输入 fail-open。面板保存前和 V3 导入均校验；生产 bundle 记录于 `docs/V3-INPUT-VALIDATION.zh.md`。14 个测试文件、70 项测试、全量 build、typecheck、包边界、格式检查、扩展 smoke、editor smoke 通过；全源码 lint 343 个 warning、0 error。Playwright Chromium smoke 覆盖 Fetch、XHR、iframe、redirect 和 service worker 重启；Chrome Stable 154.0.8037.58、Edge Stable 153.0.4234.48 重载扩展并打开面板。RE2 在品牌浏览器的独立页面请求端到端验证仍未覆盖。阶段 3 累计完成 66 / 179 项（36.9%），此检查点可独立提交。
- 2026-09-25：完成阶段 3 依赖审查并建立更新 / 漏洞处理流程。npm 官方 registry 全量扫描得 50 个公告（20 高、26 中、4 低），其中 49 个为开发依赖；生产依赖有一个 Vue 2 低危公告，暂无 Vue 2 修复版本，已检查当前项目未调用动态模板编译，跟踪至 Vue 3 迁移。`re2js@2.8.6` 为 MIT、registry SHA-512 与 lockfile 一致、无已知公告；1,276 个已安装包的 registry 签名全部验证通过。新增 PR 生产依赖 moderate+ 审计和签名检查，以及月度 / 发布前全量复核、分级 SLA 和例外记录规范。`pnpm security:audit` 通过（保留并显示现有 Vue 低危项）；阶段 3 累计完成 67 / 179 项（37.4%），此检查点可独立提交。
- 2026-09-25：继续最低浏览器兼容审查；Vue 面板 Babel / PostCSS 输出目标、核心 Fetch / XHR / Headers / TextEncoder 用法及 `crypto.randomUUID()` fallback 均已核对。Chrome for Testing 141.0.7390.122 当前构建的运行时 smoke 与扩展 smoke 通过；本机 Chrome Stable 154.0.8037.58、Edge Stable 153.0.4234.48 已打开当前扩展面板。Edge 140 固定版本矩阵已在 CI 配置，但没有远端执行结果；项目 Edge 140 下载器只支持 Linux x64，而当前主机是 macOS arm64。兼容审查项暂不勾选，待 PR CI 返回 Edge 140 运行结果；全局仍为 67 / 179（37.4%）。
- 2026-09-25：阶段 3 最低浏览器兼容性验收完成。CI run [36106005756](https://github.com/Nyakooo/ajax-proxy/actions/runs/36106005756) 中 Chrome Stable、Edge Stable、Chrome 141 和 Edge 140 的运行时检查均通过，Chrome 141 与 Edge 140 的扩展 Fetch / XHR smoke 通过，build job 全部通过。更新兼容矩阵并确认最低主版本 Chrome 141 / Edge 140；阶段 3 的兼容性检查项勾选完成，全局完成 68 / 179 项（38.0%）。当前后续从阶段 2 未完成项继续。
- 2026-09-25：补齐阶段 2 已登记的 XHR 通用事件转发审查线索。原生 XHR 的 readystatechange、loadstart、progress、abort、error、load、timeout、loadend 现转发为代理 XHR 上的合成事件；响应处理先于最终 readyState 事件，`this` / `target` 指向代理对象，原生 EventTarget 处理移除、once 和回调顺序。新增 Vitest 与真实扩展 smoke 验证，71 项单测、proxy-lib 类型检查、lint 和 Chromium extension smoke 通过。由于对应 XHR 生命周期计划项之前已计为完成，总体仍为 68 / 179（38.0%）；合成事件 `isTrusted=false` 及 upload 直通边界已记入问题文档。
- 2026-09-25：补齐阶段 2 架构文档待办。更新当前 package manifest 依赖图（包括新建的 `@proxy/v3-domain`），并新增面板配置同步和请求命中上报两条时序图，标明 MAIN world 页面消息的不可信边界。`pnpm check:boundaries` 核实 9 个 workspace 包依赖无环；整体完成 69 / 179 项（38.5%）。
- 2026-09-25：完成组合规则的 schema / 执行语义设计检查点。规则在原始 URL / method 上按列表顺序选择首条完整命中项并锁定到响应阶段；request 与 response action 独立启用，两者均停用的规则可保留但不参与匹配；命中只计一次，匹配异常继续查找、action 异常 fail-open 且不尝试后续规则，重定向网络错误不重试。method 规则为不区分大小写的精确比较，缺省 / `ANY` 为任意 method；`normal` URL 为区分大小写子串、`regex` 使用 RE2。Fetch / XHR 行为验证仍未完成，因此只勾选设计项、不提前勾选运行时验收项。更新 `docs/V3-RULE-MODEL.zh.md`；整体完成 72 / 179 项（40.2%）。
- 2026-09-25：为组合规则建立纯选择器原型 `selectV3Rule()`：输入原始 URL / method 与规则列表，忽略停用规则、无启用 action 的规则和无效 matcher，返回第一条命中规则、序号及锁定的原请求快照；URL / method、ANY、RE2 大小写、超长 URL 与错误正则均有单测。全量 76 项 Vitest、六包 typecheck、9 包依赖边界与格式检查通过。该选择器尚未接入 Fetch / XHR，因此组合运行时计划项保持未完成，整体仍为 72 / 179 项（40.2%）。
- 2026-09-25：组合 Fetch 原型开始形成独立于 V2 mode 包装器的运行路径：以首条命中规则锁定请求与响应 action，静态重定向时保留 Request 属性 / body，静态响应替换保留 Response 元数据；重定向目标错误 fail-open，重定向网络错误不重试，命中通知只触发一次。新增 6 项 Fetch 单测；全量 82 项 Vitest、typecheck、全包 build、依赖边界、lint（341 条历史 warning、0 error）和格式检查通过。该原型尚未挂接 extension runtime，Fetch / XHR 组合端到端验收未完成，整体仍为 72 / 179 项（40.2%）。
- 2026-09-25：补充独立 XHR 组合原型，异步 `open()` 按原 URL / method 选择并锁定首条规则，保留 `open()` 参数及原生 header / body 流程；支持静态 HTTP(S) 重定向和空 / `text` / `json` responseType 的静态 body / status 替换。同步 XHR、函数 code、其他 responseType 和要求 response-header 覆盖的动作 fail-open，原生事件和响应头不伪装为已替换。新增 6 项 FakeXHR 回归测试；浏览器原生响应属性、事件时序和扩展 runtime 集成仍待真实浏览器验证，组合运行时计划项继续未完成，整体仍为 72 / 179 项（40.2%）。
- 2026-09-25：增加独立真实浏览器 smoke，把 V3 Fetch / XHR 原型 bundle 后在页面内运行；Chrome Stable 154.0.8037.58、Edge Stable 153.0.4234.48 均验证静态 redirect、POST body、text / json responseType 下的响应 body / status、JSON responseText 原生 InvalidStateError、一次命中和 XHR 事件的 `this` / `target` / `currentTarget` 代理语义通过。测试期间发现并修复 XHR handler 的 `this` / event target 指向底层对象问题；代理现包装原生事件回调，使事件读取可见已处理响应。新增 CI Chrome / Edge Stable 与最低 Chrome 141 / Edge 140 smoke job。最低版本远端结果待本次 push 后确认，extension runtime 仍未接入，相关计划项暂不勾选；整体仍为 72 / 179 项（40.2%）。
- 2026-09-25：CI 首次验证组合 runtime 后暴露两处 clean checkout 依赖问题：Vitest 会解析尚未生成的 V3 domain 包入口，浏览器 smoke bundle 会解析尚未构建的 protocol 包。为 Vitest 增加 V3 domain 源码 alias，并让 `v3:browser:smoke` 显式按 protocol → v3-domain 构建；本地 clean coverage 89/89、V3 smoke、全量 build / typecheck / boundary / lint / format 通过。修复提交 `8f008c3` 后，CI run [36111180412](https://github.com/Nyakooo/ajax-proxy/actions/runs/36111180412) 的 5/5 jobs 全部通过，涵盖 Chrome / Edge Stable、Chrome 141 / Edge 140 runtime smoke、最低版本扩展 Fetch/XHR E2E 和生产构建。V3 runtime 仍未接入 extension，整体完成度保持 72 / 179 项（40.2%）。
- 2026-09-25：组合规则通过独立 storage key 进入 content → MAIN-world → `@proxy/lib` runtime；有效 V3 backup 经严格 schema 校验后同时挂载 Fetch / XHR，启停按 `globalEnabled` 生效，清除配置回到当前 V2 状态，无效更新不替换活动配置。V3 状态期间已捕获的 V2 wrapper 停止应用旧规则；页面外层 wrapper 仍按既有策略保留。跨 origin redirect 会剥离 Authorization / Proxy-Authorization / Cookie / Cookie2；V3 命中暂不误用 V2 badge 通道，消息可伪造和页面可见边界已记录。全量 93/93 Vitest、本地 extension smoke、build、typecheck、boundary、lint / format 通过；CI run [36113587880](https://github.com/Nyakooo/ajax-proxy/actions/runs/36113587880) 5/5 jobs 通过，包含 Chrome / Edge Stable 和最低版本扩展组合 Fetch/XHR E2E。阶段 2 组合规则 runtime 验收项完成，整体完成 73 / 179 项（40.8%）；V3 UI 与面向用户的 hit diagnostics 仍待实施。
- 2026-09-25：V3 命中统计接入独立 `V3_HIT` 消息与 `V3_HITS` 存储，Fetch / XHR 携带首条完整命中规则及原始 URL / method；service worker 对 active V3 backup、启用 action、规则 ID / URL / method 做二次校验，串行读改写计数，仅在 V3 配置中显示独立徽章总数，不修改 V2 `INTERCEPT_LIST` 或 V3 backup。覆盖 storage 写入失败恢复、并发递增、无效规则过滤；全量 Vitest 98/98、coverage、typecheck、包边界、lint、format、全量 build 与 Chrome Stable 扩展 smoke 通过。Smoke 实际验证 Fetch + XHR 命中后计数为 2、徽章为 `+2`、V2 统计不变。CI run [36115401043](https://github.com/Nyakooo/ajax-proxy/actions/runs/36115401043) 5/5 jobs 全部通过，覆盖 Chrome / Edge Stable、Chrome 141 / Edge 140 最低版 runtime 与扩展 smoke。完成 74 / 180 项（41.1%）；面板规则行级诊断和可视化仍待阶段 4/5 UI。
- 2026-09-25：收敛阶段 2 顶层包职责和目录边界设计，架构文档区分当前 9 包实现、稳定依赖方向与分阶段目标，并校正 V3 domain、Fetch/XHR runtime、Chrome config/hit adapter 已接入的实际状态。只完成包 / 职责设计项；领域层 ports/adapters 与 runtime 内部 feature 拆分仍待实现和验证，未提前勾选。文档格式与 workspace boundary 检查通过。完成 75 / 180 项（41.7%）。
- 2026-09-25：将 V3 Fetch / XHR 实现、Vitest 用例和真实浏览器 smoke entry 分别移入 `proxy-lib/src/v3/`、`proxy-lib/test/v3/`，V2 runtime 文件与接口保持不变。全量 98/98 Vitest、typecheck、lint、format、package boundary、V3 Chrome runtime smoke、生产 build 与扩展 smoke 均通过；声明文件随源码移动，提交后检查生成声明一致性。完成 76 / 181 项（42.0%）。
- 2026-09-25：将 `@proxy/v3-domain` backup schema / validation 实现拆至 `backup.ts`，`index.ts` 仅保留稳定 public barrel，`ruleMatching.ts` 直接依赖 domain types。既有包根调用保持兼容，未改 backup 格式或规则行为。全量 98/98 Vitest、typecheck、package boundary、lint、format、全量 build 与 Chromium V3 Fetch/XHR browser smoke 通过；生成声明随源码拆分，提交后执行声明一致性检查。完成 77 / 182 项（42.3%）。
- 2026-09-25：将 V3 hit event 类型与严格数据 guard 集中到 `@proxy/protocol`，proxy-lib、content script 和 service worker 共用消息契约；shell 显式声明 protocol 依赖，legacy badge event 保持原样。全量 98/98 Vitest、typecheck、package boundary、lint、format、生产 build、声明一致性检查和 Chrome Stable 扩展 Fetch/XHR smoke 通过。阶段 2 领域边界仍未整体结项。完成 78 / 183 项（42.6%）。
- 2026-09-25：将 `JsonValue`、`V3Tag` 和 `V3Rule` 移到 `@proxy/v3-domain/rules.ts`，backup validator 和纯 matcher 改为直接依赖类型模块；package root API 与 backup 字段、规则行为保持不变。全量 98/98 Vitest、typecheck、package boundary、lint、format、domain build 与声明一致性检查通过。完成 79 / 184 项（42.9%）。
- 2026-09-25：将 V3 Fetch / XHR runtime 共用的 host callbacks 抽为 `V3RuntimeHostOptions`，保留原有 `V3FetchOptions` / `V3XHROptions` 类型入口并从 proxy-lib 根公开稳定类型。全量 98/98 Vitest、typecheck、package boundary、lint、format、domain / proxy-lib build、声明一致性检查和 Chromium V3 Fetch/XHR runtime smoke 通过。完成 80 / 185 项（43.2%）。
- 2026-09-25：将 service worker V3 active backup 复核、独立 counters 串行更新和 V3 badge 渲染移至 `v3Hit.ts`；V2 统计及徽章通道协调留在 `badge.ts`。定向 shell tests（7/7）、typecheck、package boundary、lint、format、完整 build 与 Chrome Stable 扩展 smoke 通过。完成 81 / 186 项（43.5%）。
- 2026-09-25：将 V3 backup 唯一状态、配置校验、Fetch/XHR wrapper 创建及 hit event 发射封装到 `runtimeController.ts`；根入口保留全局 wrapper 协调并投影 `v3_active`，V2 runtime 保持原实现。隔离 controller 与既有 index 集成测试共 99 项通过，typecheck、boundary、lint、format、proxy-lib build、V3 runtime smoke、扩展 smoke、全量 build 与声明一致性检查均通过。完成 82 / 187 项（43.9%）。
- 2026-09-25：将 V3 hit 与活动规则的匹配复核、未知 / 非安全 counter 清理、计数汇总及 `MAX_SAFE_INTEGER` 安全递增放入 `@proxy/v3-domain/hitCounters.ts`；Chrome adapter 继续独占队列和平台副作用。全量 103/103 测试、typecheck、boundary、lint、format、build、V3 browser smoke、extension smoke 和声明一致性检查通过。完成 83 / 188 项（44.1%）。
- 2026-09-25：`runtimeController.update()` 现在保留 `validateV3Backup()` 结构化 issues；proxy-lib `updateV3()` 对外返回辨识结果并输出路径化校验细节。无效配置继续保留活动 backup，合法 disabled 配置及 null 清除语义不变。全量 103/103 测试、typecheck、boundary、lint、format、proxy-lib build、V3 browser smoke、extension smoke、完整 build 和声明一致性检查通过。完成 84 / 189 项（44.4%）。
- 2026-09-25：将 Fetch response body/header/status 处理与 metadata proxy 拆到 `responseAction.ts`，Fetch wrapper 仅在首条命中规则的网络阶段后调用该 helper；既有 Fetch 回退和 no-body 语义不变，未强制抽象不同的 XHR response 行为。全量 103/103 Vitest、typecheck、boundary、lint、format、proxy-lib build、Chromium V3 Fetch/XHR smoke 和声明一致性检查通过。完成 85 / 190 项（44.7%）。
- 2026-09-25：按用户补充确认更新决策记录：首条完整命中规则负责整次请求；派发前重定向准备失败使用原请求，派发后网络错误不重试，响应替换失败保留原响应；CI 以 Chrome / Edge 当前稳定版和最低受支持版验收。对应选择和实现均已纳入阶段记录。完成 88 / 190 项（46.3%）。
- 2026-09-25：建立 Ajax Proxy V3 品牌方向，沿用深青色和浏览器窗口识别资产，将请求 / 响应路径与代理节点形成新 SVG mark；新增可重复图标生成器，输出 48 / 128 px 启用彩色与停用灰阶 PNG，并生成 16 / 24 / 48 / 128 px 预览矩阵。SVG 渲染、尺寸断言和预览已检查。面板横向 lockup 的浅 / 深背景变体与完整 design tokens 后续再单独结项。完成 90 / 190 项（47.4%）。
- 2026-09-25：完成 Logo 多场景规范：SVG 增加深色面板状态，`pnpm brand:icons` 重复生成 128 px 深色 mark，并在同一预览矩阵检查扩展图标多尺寸、停用状态以及浅 / 深背景 panel lockup；修正预览资源路径并重新目视检查。Prettier 检查通过。完整 UI design tokens 尚未结项。完成 91 / 190 项（47.9%）。
- 2026-09-25：根据现有 V2 面板源码建立阶段 4 IA 与关键流程设计，映射顶栏、拦截 / 重定向规则 CRUD、标签 / 搜索、组合规则 editor、备份恢复及错误 / 空态；明确 V2 数据不迁移，阶段 5 的排序 / 批量操作 / 历史诊断仍只是提案。信息架构覆盖启停、规则保存、筛选和恢复的成功 / 失败路径；PrimeVue 页面布局和组件选择仍待原型验证。文档 Prettier 检查通过。完成 92 / 190 项（48.4%）。
- 2026-09-25：新增与 `vue-panels` / 扩展生产入口隔离的 `@proxy/v3-ui-prototype`，使用 Vue 3.5.43、PrimeVue 4.5.5 styled Aura 主题和 Ajax Proxy teal token，按需引入 Button / InputText / Tag / ToggleSwitch；不依赖 PrimeIcons 字体。Chrome Stable 154.0.8037.58、Edge Stable 153.0.4234.48 均通过 production preview 400 px 窄布局、搜索空态、深色主题 smoke；Playwright Chromium 另验证工作区切换、创建和清除搜索。全仓 lint（341 条历史 warning、0 error）、格式检查、依赖边界检查、全包构建与扩展 smoke 通过；原型产物 311.91 kB JS / 9.57 kB CSS（gzip 78.33 / 2.69 kB）。Vue 2 生产面板未改动。通过 PrimeVue styled 原型项，Pass Through / unstyled 对比、生产包纳入和最终 UI 迁移继续保留。完成 93 / 190 项（48.9%）。
- 2026-09-25：完成 Pass Through / unstyled 与 UI 原型生产特性对照：主 CTA 可单点 Pass Through 样式覆盖；独立 unstyled build 对 Button / InputText / Tag / ToggleSwitch 全部补充自定义类和基础样式。Chrome Stable 154.0.8037.58、Edge Stable 153.0.4234.48 在 styled、styled Pass Through CTA、unstyled 三种 production preview 验证规则创建、搜索空态、清除、ARIA 开关、主题切换、键盘焦点可见和无运行时异常。当前包含实验 CSS 的产物 styled 为 312.15 kB JS / 11.47 kB CSS（gzip 78.46 / 3.08 kB），unstyled 为 312.30 kB JS / 11.47 kB CSS（gzip 78.48 / 3.08 kB），没有观察到 unstyled 体积优势；继续采用 styled + 自定义 token，保留 Pass Through 作为局部样式扩展。完成按需组件引入、交互 / 键盘与 ARIA 基础检查、体积及定制维护成本对比（不代表完整 WCAG 审计）。阶段完成度 95 / 190（50.0%）。
- 2026-09-25：完成品牌衔接的界面视觉基线：增加浅 / 深语义色、系统字体栈、4 px 间距刻度、圆角 / 控件尺寸、状态表达和 SVG 图标约定；原型统一 code font token，把浅色次要文字更新为至少 4.5:1 的基线，并同步定义深色文字与焦点色。Chrome Stable / Edge Stable 对 styled、Pass Through CTA 和 unstyled 三种 production preview 验证创建 / 搜索 / 启停、浅深主题 3 px 键盘焦点环；主题文字色计算范围为 4.71:1 至 13.29:1。仅作为 token 原型基线，不宣称完整 WCAG 验收。审查同时发现原型示例仍使用 Unicode 导航图标、存在紧凑字号与散落尺寸，列入后续 UI 阶段继续处理。完成度 96 / 190（50.5%）。
- 2026-09-25：启动 Vue 3 面板迁移：把经验证的独立 UI package 演进为 `@proxy/vue3-panels` 候选面板 workspace，提供显式构建 / 预览入口、独立产物清理及隔离静态检查；同步更新 pnpm lock importer。整仓 `pnpm build` 仍将 Vue 2 dist 复制到既有 `panels/` 路径，扩展 smoke、边界门禁、格式检查和全仓 lint 通过（保留 341 条历史 warning、0 error）。实际领域组件与扩展消息 / storage 接线尚未迁移；全局阶段完成项 96 / 190（50.5%）。
- 2026-09-25：完成 Vue 3 候选面板中英切换切片：以 `vue-i18n@11` Composition API 翻译当前 shell 的静态文案、空态、动态规则动作 / 备注和无障碍标签；稳定 action ID 保持筛选不依赖文案，首次默认简体中文，切换后同步 `<html lang>` 并持久化到独立原型键。Chrome 与 Edge Stable 验证中英文视图、创建规则、搜索空态、重定向视图、停用提示与刷新后语言记忆。遇到并修复 Vue 2 compiler 的 workspace Vue 版本解析歧义（把 Vue 2.6.11 作为 `vue-template-compiler` 依赖固定），整仓 build、extension smoke、边界、格式、全仓 lint（341 条历史 warning、0 error）及 Vue 3 styled / unstyled 构建通过；V2 locale 清理、真实设置 storage、路由 / 状态架构和 JSON editor locale 仍待迁移阶段。完成度 97 / 190（51.1%）。
- 2026-09-25：完成 Vue 3 面板配置消息 adapter：新增严格的 GET snapshot / SAVE config 协议、service worker sender 与 `panels-v3/` 路径校验、V3 backup 读写校验和命中计数清理，以及 Vue 3 客户端响应校验。单元测试、全量生产构建（正式 `pkg` 仍复制 Vue 2 面板）、Vue 3 styled / unstyled 构建、TypeScript、生成类型、消息边界、扩展 Fetch / XHR / iframe / redirect / worker restart smoke、改动文件 lint / format 均通过。组件数据流与 staging extension 仍未接入，因此不宣称端到端 V3 面板完成。adapter 协议先行提交 `7dc3284`，本次集成切片提交后推送至 `refactor/v3`。整体完成度 98 / 191（51.3%）。
- 2026-09-25：完成 V3 规则集合不可变 CRUD helper：新增追加 / 插入、按 id 替换和删除、启停及调序接口，明确重复 id / 未知 id 为 no-op、索引安全夹取，保持输入数组不变。domain 测试 24 项、构建、TypeScript、生成声明、lint 和格式通过；提交 `7436802` 已推送到 `refactor/v3`。整体完成度 99 / 192（51.6%）。
- 2026-09-25：完成 Vue 3 V3 redirector 首个真实 UI 切片：候选面板读取 V3 snapshot，并通过 config service 保存新增 / 编辑 / 删除、启停、调序、全局启用及语言设置；删除组合规则的 redirect 时保留其 response action。表单覆盖 URL / RE2、method、目标 URL 和规则启用状态；V2 substring replacement、headers、ignores、redirect function 不作静默兼容。Chrome Stable 154.0.8037.58 与 Edge Stable 153.0.4234.48 production preview 验证 CRUD、中英视图、优先级和页面无异常；Edge 与 Chrome 均使用模拟 extension runtime 验证 GET / SAVE、保存回读与无页面异常，真实扩展 `panels-v3/` 加载留到 staging 阶段。全量 132 项 Vitest、整仓 build、扩展 Fetch / XHR smoke、Vue 3 styled / unstyled build、边界、lint、format 均通过。V3 主 UI chunk 为 392.54 kB（gzip 105.68 kB），按需加载 backup 校验 chunk 为 151.78 kB（gzip 45.90 kB）。整体完成度 100 / 193（51.8%）。
- 2026-09-25：完成 Vue 3 V3 JSON 响应规则切片：新增拦截响应规则编辑器，可创建、编辑、删除 JSON response-only / 组合规则并复用通用启停和调序；JSON 语法与 200–599 状态码校验失败时不保存。编辑复合规则时保留 redirect 和未编辑响应 headers，移除响应动作时保留 redirect；自定义函数响应编辑仍禁用并明确提示。Chrome Stable 154.0.8037.58 与 Edge Stable 153.0.4234.48 对 production preview 验证创建、无效 JSON 阻止保存、编辑回读和复合规则删除响应后保留重定向，页面无异常。新增 15 项纯逻辑测试；全量 147 项测试、TypeScript 检查、V3 面板 production build、受影响文件零告警 lint 均通过。该 preview 使用内存样例数据，真实扩展 `panels-v3/` 与响应 runtime E2E 留待 staging / 阶段 6。整体完成度 101 / 194（52.1%）。
- 2026-09-25：完成 V3 extension staging 与真实面板请求闭环：`pnpm build` 继续把 Vue 2 面板放在默认 `panels/`，另将 Vue 3 独立复制到 `panels-v3/`；修正 service worker 对真实 extension tab sender 的鉴权，保留 extension ID + `panels-v3/` URL 限定。扩展 smoke 从 V3 UI 创建 response 规则，确认只写 `V3_CONFIG`、reload snapshot、真实 Fetch 状态码 / body 和 `V3_HITS` 增长；V2 `INTERCEPT_LIST` 不变。Chrome for Testing 154.0.8037.57 headed 与 Edge Stable 153.0.4234.48 headed / headless 均通过；品牌 Chrome 154.0.8037.58 会拒绝 `--load-extension`，这是 Chrome 137 起正式版移除此开关后的限制。全 workspace build（含既有 Vue 2 警告）、TypeScript、全量 147 项 Vitest、panel boundary / isolation、staging 扩展 smoke 和改动文件零告警 lint 通过。整体完成度 102 / 195（52.3%）。
- 2026-09-25：完成 JSON 编辑器诊断切片：JSON 解析失败从受支持浏览器错误信息提取可靠的 1-based 行 / 列（无法提取时不猜测，显示通用错误）；对象、数组、字符串与 null 示例一键填入，修复 JSON 后错误提示自动清除。Chrome for Testing 154.0.8037.57 与 Edge Stable 153.0.4234.48 真实扩展 smoke 均验证多行语法错误位置、对象示例、V3 保存回读和 Fetch 响应。149 项 Vitest、workspace build / staging、TypeScript、边界、format、受影响文件 lint 均通过。整体完成度 103 / 196（52.6%）。
- 2026-09-25：完成 V3 JSON 编辑器选型原型阶段：单独比较原生文本框、按需 CodeMirror 6、JSONEditor tree-only 与轻量树形编辑。Chrome for Testing 154.0.8037.57、Edge Stable 153 通过键盘 JSON 编辑、中文文本往返、CodeMirror 撤销 / 重做、轻量树字段修改 / 新增、1500 项（249,826 bytes）样例预览，以及无效 JSON 保留 / 恢复检查；本轮未连接操作系统 IME，树形方案全键盘及屏幕阅读器验收保留。记录体积后确定函数 / JSON 文本模式方向为异步 CodeMirror、结构化 JSON 继续保留独立树形能力；JSONEditor 262.79 kB gzip 不纳入 V3 生产依赖，轻量树仍是未优化原型。修复原型构建落入生产 dist 的 staging 风险，加入隔离检查并确认打包后的 V2 `panels/` 与 V3 `panels-v3/` 均无原型资产。生产 V3 build、prototype build、149 项 Vitest、TypeScript、边界检查、受影响源码零告警 lint 和 Prettier 检查通过。整体完成度 105 / 196（53.6%）。
- 2026-09-25：完成 CodeMirror 6 接入 V3 JSON response body：复用独立编辑器组件，增加行号、JSON 高亮、撤销 / 重做和 accessible name；CodeMirror 作为 V3 构建依赖，仅在打开响应规则编辑器时加载 310.22 kB（101.78 kB gzip）独立 chunk。扩展 smoke 验证打开前无 chunk 请求、打开后异步加载、无效 JSON 阻止保存、示例 / 修复 / V3 配置持久化闭环。Chrome for Testing 154 与 Edge Stable 153 的完整扩展 Fetch / XHR / service worker smoke 通过；149 项 Vitest、TypeScript、全 workspace build、包边界、改动文件 lint / Prettier 通过。V2 默认 `panels/` 未切换。整体完成度 106 / 197（53.8%）。
- 2026-09-25：完成 V3 面板实时命中反馈切片：service worker 将经过校验的命中计数、规则条件和原始请求 method / URL 通知所有已打开面板；面板过滤严格扩展消息、未知规则与旧计数，并显示中英双语的跨标签页最近命中提示和逐规则实时计数。明确该早期事件只表示“已匹配”，不代表请求改写成功；最终 Fetch / XHR 结果与未命中原因留待统一生命周期诊断。全量 151 项 Vitest、整仓 build、TypeScript、包边界与 isolation、Chrome for Testing 154 / Edge Stable 153 扩展 smoke、受影响文件零告警 ESLint 与 Prettier 均通过。整体完成度 107 / 198（54.0%）。
- 2026-09-25：基于 PrimeVue styled / Pass Through / unstyled 对照结果完成 utility-first 样式工具选型：当前无需引入 Tailwind CSS 或 UnoCSS；PrimeVue 提供交互组件，Ajax Proxy tokens 负责产品样式。若布局需求变化，再优先评估 Tailwind CSS v4。完成度 108 / 198（54.5%）。
- 2026-09-25：完成 V3 函数响应纵向集成检查点：使用隔离 worker 执行、验证 JSON 输入输出与体积、限制 4 路并发，超时终止 worker、移除并重建 sandbox；面板已可编辑、显式启用和保存函数响应，XHR 保持原生响应。修复 Vue I18n 示例花括号导致编辑器初始化失败，以及长表单保存按钮被视口裁切；增加同步死循环 fail-open / sandbox 重建浏览器回归。Chrome for Testing 154.0.8037.57、Edge Stable 153.0.4234.48 隔离与函数 runtime smoke、Chrome 扩展 UI smoke 通过；全量 161 项 Vitest、TypeScript、相关 production build、ESLint 与 Prettier 检查通过。逐次运行错误诊断 UI、备份恢复警告计数仍留在后续面板集成项。本次完成度 109 / 199（54.8%）。
- 2026-09-25：完成 V3 函数响应诊断：跨 content / service worker / 面板实时上报最近 10 次函数失败，只传规则元数据和固定错误类别，不传原始 URL、异常文本或请求响应体；面板说明失败类型与继续使用原始响应。Chrome for Testing 154 与 Edge Stable 153 验证无效返回、同步死循环 timeout、fail-open 和诊断 UI；Chrome extension smoke、165 项 Vitest、TypeScript、build、边界检查、改动文件零告警 ESLint、Prettier 通过。备份恢复的代码规则数量提示仍未接入。整体完成度 110 / 199（55.3%）。
- 2026-09-26：V3 面板接入 JSON 备份导出、文件 / 文本导入预览、schema 错误显示和确认恢复；导入函数代码时显示规则数量及不可信提示，领域解析器确保对应响应行为保持停用。恢复成功后同步面板语言、清除过期诊断，不导入备份中不存在的命中计数。扩展 smoke 验证导出 envelope、无效 JSON 不写入配置、函数规则计数与禁用恢复后 Fetch 原始响应；Edge Stable 153.0.4234.48 与 Playwright Chromium 扩展 smoke、165 项 Vitest、Vue 3 面板 / Chrome 扩展构建、typecheck、package boundary、生成声明、改动文件 ESLint 与 Prettier 通过。Chrome Stable 154.0.8037.58 在独立 Playwright profile 下未观察到扩展 service worker；改用现有 Chrome 用户 profile 重载本地扩展后，真实 `panels-v3/` 页面可打开，函数代码备份预览和无效 JSON 错误态通过，配置保持 0 条规则。完成 111 / 199 项（55.8%）。
- 2026-09-26：新增 `docs/V3-BACKUP-RESTORE.zh.md`，说明 staging 面板加载、完整快照导出 / 恢复、校验失败不写入、V2 不兼容和函数代码默认停用；同步修正 baseline、issues、panel migration 和 functions 文档中的过时实现状态并加入交叉链接。核对 UI 文案、domain importer 与真实扩展 smoke 的配置语义，`git diff --check` 和 Prettier 检查通过。完成 112 / 199 项（56.3%）。
- 2026-09-26：完成 V3 规则列表基础筛选切片：按规则启用状态及普通 / 正则匹配类型过滤；搜索仍覆盖 ID、URL、method、跳转目标和 action，并让导入后停用的函数 response action 可见、可编辑。分类按 action 配置存在性统计；移除一个 action 时保留同规则中的另一个（即使其停用），搜索 / 筛选时禁用调序。Playwright 扩展 smoke 验证导入函数规则仍显示、打开编辑器后函数响应保持未启用、删除 action 保留同规则的请求 action、状态筛选、匹配类型空态、清除筛选、搜索和调序限制；Playwright Chromium 与 Edge Stable 153.0.4234.48 扩展 smoke、165 项 Vitest、Vue 3 面板构建 / staging 打包、typecheck、包边界、改动文件 ESLint / Prettier 通过。Chrome Stable 154.0.8037.58 真实本地扩展面板验证筛选弹层、无结果态和清除筛选；当前 profile 规则仍为空。将原“搜索、筛选、排序、标签”综合项拆为独立进度项。完成 115 / 202 项（56.9%）。
- 2026-09-26：完成 V3 规则列表基础筛选切片：按规则启用状态及普通 / 正则匹配类型过滤；搜索仍覆盖 ID、URL、method、跳转目标和 action，并让导入后停用的函数 response action 可见、可编辑。分类按 action 配置存在性统计；移除一个 action 时保留同规则中的另一个（即使其停用），搜索 / 筛选时禁用调序。Playwright 扩展 smoke 验证导入函数规则仍显示、打开编辑器后函数响应保持未启用、删除 action 保留同规则的请求 action、状态筛选、匹配类型空态、清除筛选、搜索和调序限制；Playwright Chromium 与 Edge Stable 153.0.4234.48 扩展 smoke、165 项 Vitest、Vue 3 面板构建 / staging 打包、typecheck、包边界、改动文件 ESLint / Prettier 通过。Chrome Stable 154.0.8037.58 真实本地扩展面板验证筛选弹层、无结果态和清除筛选；当前 profile 规则仍为空。将原“搜索、筛选、排序、标签”综合项拆为独立进度项。完成 115 / 202 项（56.9%）。
- 2026-09-26：V3 标签数据契约支持可选多标签 `rule.tagIds`；严格校验非空、唯一 ID 且每个引用必须对应备份内已定义标签，缺省字段继续接受既有 V3 配置。新增 domain 校验回归用例，定向 18 项测试、domain 构建、ESLint、Prettier 通过。面板标签管理、关联与筛选交互仍待完成。完成 116 / 203 项（57.1%）。
- 2026-09-26：完成 V3 标签管理与关联切片：工具栏可创建、改名、删除标签；拦截与重定向编辑器均支持多标签；列表显示标签并将标签名纳入搜索；单标签筛选可与启用状态、普通 / 正则条件组合。删除标签先确认，再从所有相关规则解除该引用。扩展 smoke 验证两个 editor 各保存两个标签、重载后显示、筛选与清空、删除单个关联时保留其他标签并最终清除关联；Chromium 与 Edge Stable 153.0.4234.48 扩展 smoke、167 项 Vitest、Vue 3 / Chrome extension build 与 staging packaging、typecheck、包边界、生成声明、ESLint、Prettier 通过。标签数据契约与面板阶段分别提交。完成 117 / 203 项（57.6%）。
- 2026-09-26：规则行新增复制操作：深拷贝完整组合规则、生成新 ID、插在原规则之后并将规则级 enabled 设为 false；保留 action 配置和 tagIds，命中计数按新 ID 从 0 开始。扩展 smoke 验证标签规则副本保留两个标签及 response 内容、紧邻原规则且默认停用，命中计数不复制；Chromium 与 Edge Stable 153.0.4234.48 smoke、167 项 Vitest、Vue 3 面板构建 / staging 打包、typecheck、包边界、生成声明、ESLint、Prettier 均通过。计划项“规则复制、批量启停、批量导入导出”拆为独立工作项。完成 118 / 205 项（57.6%）。
- 2026-09-26：完成规则列表批量启用 / 停用：可选择单条或当前显示项，批量动作只修改规则级 enabled 并在保存成功后清空选择；筛选、搜索或切换拦截 / 重定向列表后，隐藏规则会从选择中移除。扩展 smoke 验证两条规则批量启用 / 停用、未选规则状态不变、request / response action 状态不变，以及操作后清空选择。Chromium 与 Edge Stable 153.0.4234.48 扩展 smoke、167 项 Vitest、Vue 3 面板构建 / staging 打包、typecheck、包边界、生成声明、ESLint、Prettier 均通过。完成 119 / 205 项（58.0%）。
- 2026-09-26：完成规则批量导出与追加导入：选择规则导出为只包含所选规则及其引用标签的 V3 文件；预览后按规则 ID 跳过冲突并将新规则追加到列表末尾，现有配置与设置不变；同名标签复用，标签 ID 相同但名称不同则阻止写入。扩展 smoke 验证单规则含多标签导出、相同 URL 不同 ID 可导入、重复 ID 跳过、追加顺序、设置和既有规则保持不变、标签 ID 冲突阻止导入。Chromium 与 Edge Stable 153.0.4234.48 扩展 smoke、167 项 Vitest、Vue 3 面板构建 / staging 打包、typecheck、包边界、生成声明、ESLint、Prettier 均通过；追加导入说明补入备份文档。完成 120 / 205 项（58.5%）。
- 2026-09-26：面板最近匹配区升级为内存中的最多 10 条命中记录，显示跨标签页收到的 method、URL、匹配条件和本地时间；明确不记录未命中，面板关闭 / 刷新即清空，未增加存储字段或请求内容采集。扩展 smoke 覆盖多次命中保留上限及重载清空；Chromium 与 Edge Stable 153.0.4234.48 扩展 smoke、167 项 Vitest、V3 面板构建 / staging 打包、typecheck、包边界、生成声明、ESLint、Prettier 均通过。将“命中历史 / 未命中诊断”拆成两个可验收项；未命中原因与 action 最终结果仍待设计。完成 121 / 206 项（58.7%）。
- 2026-09-26：增加离线规则匹配试算，复用 domain 的实际规则匹配器，显示逐条未命中原因、全局 / 规则 / action 停用、第一条命中和后续优先级遮蔽；输入不发请求、不保存，也不影响命中计数。Vitest 新增分类与优先级用例；扩展 smoke 在当前规则上分别验证首条匹配、method mismatch 和 no-match，并确认配置 / 计数不变。Chromium 与 Edge Stable 153.0.4234.48 扩展 smoke、169 项 Vitest、domain / V3 面板构建、typecheck、包边界、生成声明、ESLint、Prettier 通过。将计划进一步拆为离线试算和真实运行时诊断两项。完成 122 / 207 项（58.9%）。
- 2026-09-26：评估快捷建规则来源，决定只从已有最近命中通知创建，不采集任意页面请求；将预填实际 URL / method、普通匹配、默认停用、空标签和 JSON `{}` 响应作为人工审核草稿，不复制原响应正文、重定向目标或函数代码。完整请求 URL 可能含敏感 query 参数，编辑器须保持可见可改；关闭不得写配置，保存后仍须显式启用。将评估项与实现项拆分。完成 123 / 208 项（59.1%）。
- 2026-09-26：完成从最近命中记录快捷创建响应 / 重定向规则。编辑器预填原始 URL（含 query）和 method、普通匹配；响应草稿默认 JSON 200 `{}`，重定向目标留空；两类规则均默认停用且无标签，不复制请求或响应内容。取消不写配置；保存响应草稿保留停用状态。169 项 Vitest、类型检查与生成声明、包边界 / V3 隔离、格式检查、受影响文件 ESLint，以及 Chrome for Testing / Edge Stable 扩展 smoke 均通过。完成 124 / 208 项（59.6%）。
- 2026-09-26：增加离线规则匹配试算，复用 domain 的实际规则匹配器，显示逐条未命中原因、全局 / 规则 / action 停用、第一条命中和后续优先级遮蔽；输入不发请求、不保存，也不影响命中计数。Vitest 新增分类与优先级用例；扩展 smoke 在当前规则上分别验证首条匹配、method mismatch 和 no-match，并确认配置 / 计数不变。Chromium 与 Edge Stable 153.0.4234.48 扩展 smoke、169 项 Vitest、domain / V3 面板构建、typecheck、包边界、生成声明、ESLint、Prettier 通过。将计划进一步拆为离线试算和真实运行时诊断两项。完成 122 / 207 项（58.9%）。
- 2026-09-26：只读审计下一项宽泛需求后，将“更灵活的请求匹配条件及响应配置”拆为 URL 精确匹配实现、静态响应 header 能力评估。当前 V3 已有 normal 子串与 regex 匹配；请求 header 条件和 V2 忽略列表会扩大 schema、运行时及浏览器兼容范围，暂不纳入精确匹配切片。静态响应 headers 虽已进入 schema，但编辑器没有配置入口，Fetch 与 XHR 执行能力不同，需独立确定降级策略。完成 125 / 210 项（59.5%）。
- 2026-09-26：完成 V3 URL 精确匹配：`exact` 对完整原始 URL 做区分大小写字符串相等比较；缺省 / `normal` 子串、`regex` RE2 语义不变。规则列表、拦截 / 重定向编辑器、匹配类型筛选、离线试算和 Fetch / XHR runtime 共用该 matcher。备份升至格式 4；仍读取只允许旧 matcher 的格式 3，用户保存 `exact` 时自动升级。171 项 Vitest、domain / proxy-lib / Vue 3 / Chrome 构建、类型检查、包边界 / 面板隔离、Chrome / Edge 扩展 smoke、ESLint / Prettier 通过。完成 126 / 210 项（60.0%）。
- 2026-09-26：评估静态响应 header 编辑能力。Fetch 可以应用 header 覆盖；XHR 无法忠实重写网络响应头，当前策略会让配置了响应 header 的 XHR action 整体 fail-open。为避免新增一个在 XHR 上不生效且易被误解的编辑入口，本期暂缓该 UI，待确认可接受的能力降级后再决定。完成 127 / 210 项（60.5%）。
- 2026-09-26：并行审计实际运行时诊断的 Fetch / XHR 生命周期、消息边界和隐私风险后，将宽泛诊断项拆分：用户主动开启、默认关闭的临时未命中原因；Fetch action outcome；异步 XHR action outcome。诊断仅保存在面板内存、不写 storage，不携带 URL / query、body、headers 或函数代码；真实事件按 best-effort 提示处理，不作为安全证据。命中通知仍只代表规则选择，必须等动作确认点再报告 outcome。完成 128 / 213 项（60.1%）。
- 2026-09-26：完成用户主动开启的一次性真实未命中诊断：Fetch 与异步 XHR 共用 domain matcher 生成逐规则原因；事件只含 method、rule ID、reason 和截断标志，面板内存最多保留 10 条，取消 / 捕获后消费 arm，关闭 / 刷新清空，不写诊断事件或请求数据到 storage，也不改变 V2 / V3 命中计数。Service Worker 串行消费全局一次性标志，并校验当前配置、完整规则 ID 顺序和截断状态；真实页面主世界事件仍按 best-effort 提示处理。单测、全量 184 项 Vitest、workspace typecheck、包边界 / isolation、format、改动文件零告警 ESLint、Chrome 扩展 Fetch/XHR 与未命中隐私 smoke、Edge Stable 同一扩展 smoke 均通过。完成 129 / 213 项（60.6%）。
- 2026-09-26：完成 opt-in Fetch 请求 / 响应 action outcome 诊断。固定分类区分重定向应用、构造失败后回退、网络失败、响应替换成功 / 回退 / 不支持；同一请求两阶段共用随机运行时片段 + 序号关联 ID，不改变 Fetch 回退及命中计数。只有开启临时捕获后才生成 / 转发诊断，Service Worker 校验活动 V3 配置、规则、动作与结果类型；面板只保留最近 10 条内存记录，关闭后清除开关，不持久化请求 / 响应内容。扩展 smoke 在 Chromium 与 Edge Stable 通过；全量 198 项 Vitest、typecheck、包边界 / isolation、格式和改动文件 ESLint 通过。完成 130 / 213 项（61.0%）。
- 2026-09-26：完成 opt-in 异步 XHR action outcome 诊断，并复用临时 action outcome 开关与面板。独立 `v3-xhr-outcome` 协议区分 redirect 应用 / open fallback / 不支持、send 同步失败，以及 response replacement 成功 / 失败 / 不支持；redirect 等 `send()` 成功返回后才报告，响应成功等完成响应的替换属性实际读取后才报告；同步 XHR、未配置动作及未 opt-in 时不产生事件。诊断仅含 rule ID、关联 ID、阶段和固定分类；SW 校验配置与动作，面板内存最多保留 10 条。异步网络 error / timeout / abort 暂不单独报告。全量 208 项 Vitest、typecheck、协议 / 面板 / 扩展构建、包边界 / isolation、格式、改动文件 ESLint 和生成声明检查通过；Chromium 与 Edge Stable 扩展 smoke 均通过，确认双阶段关联、隐私过滤、关闭 gate 与命中计数。Chrome Stable 在 Playwright 隔离启动配置下未能启动扩展 Service Worker（30 秒超时）；品牌 Chrome 自动化限制仍待用交互式浏览器方式补验。完成 131 / 213 项（61.5%）。
- 2026-09-26：完成规则模板切片：新增静态 JSON 响应、HTTP 重定向两个内置离线模板，仅使用 `.invalid` 占位 URL；模板默认停用、重建规则 ID、追加到末尾、不含函数代码，弹窗展示用途 / 动作预览，取消不改活动配置，保存失败可在弹窗内查看原因。全量 212 项 Vitest、类型检查、包边界 / Vue 3 面板隔离、生成声明、格式与改动文件 ESLint 通过；Vue 3 / Chrome 扩展生产构建和 staging 打包通过；Chromium 与 Edge Stable 扩展 smoke 通过，验证取消、重复创建 ID 唯一、停用状态和静态规则内容。Chrome Stable 的 Playwright Service Worker 启动限制仍待交互式方式补验。完成 132 / 213 项（62.0%）。
- 2026-09-26：完成规则分组与站点级开关范围：规则继续使用既有多标签关联分组，不增加嵌套目录或改变首条命中优先级；新增按当前 frame 的精确 HTTP(S) origin（协议、主机名、端口）开关。站点关闭时 Fetch / XHR 走原生路径，不改变规则启停或顺序，也不产生误导性的未命中诊断；全局开关优先。备份升为 v5，规范化读入 v3 / v4 并迁移为空 `disabledOrigins`；v5 严格验证规范 origin。完成 219 项 Vitest、全量 build、typecheck、边界 / isolation、生成声明、格式和受影响文件零告警 ESLint；Chromium 与 Edge Stable 扩展 smoke 通过，覆盖 Fetch / XHR 原生回退、配置持久化和 service worker 重启。Chrome Stable 真实 `panels-v3/` 页面完成停用、回读和重新启用验证；手动复验发现并修复 MV3 冷启动时消息监听器延迟注册，新增启动期消息回归用例。用户命名的多套完整配置 profile 经评估暂缓，内置规则模板用于常见场景。阶段 5 剩余 GitHub 反馈已按维护成本完成评估：通用头改写、请求体改写、持久草稿、跨扩展自动协调与命中动画明确列入后续版本；请求诊断、组合规则和快捷创建等已交付功能同步标记。完成 145 / 215 项（67.4%）。
- 2026-09-26：完成剩余用户反馈和维护成本审查：依据 GitHub open issues 核对 #55 / #56 及 #54 至 #22 历史反馈；已交付项同步关联到 V3 实现与回归记录。明确不纳入本期的功能为通用请求 / 响应头变换、请求体改写、持久化草稿、跨扩展自动协调、页面命中动画、多配置 profiles、嵌套规则组、链式规则和 V2 配置转换；README / V3 源码说明继续由阶段 7 完善。同步调整阶段 4 验收，移除页面光晕要求，保留面板与扩展图标的启用状态。阶段 5 其余功能评估项完成。完成 149 / 215 项（69.3%）。
- 2026-09-26：阶段 6 首个测试切片补齐 shared-utils 的 Chrome storage 删除 / 清空成功及失败路径；失败时断言 Promise reject、原缓存保留和错误事件 detail。单测文件 12 项、全量 223 项 Vitest、受影响测试文件零告警 ESLint 和 `git diff --check` 通过。完成 150 / 216 项（69.4%）。
- 2026-09-26：阶段 6 补齐 V3 XHR 完成时序回归：模拟 readyState 2 / 3 / 4 与 progress、load、loadend，断言 `readystatechange`（属性处理器和监听器）及 `load`（属性处理器和监听器）观察到的均为已替换响应 body 与 status。XHR 定向 13 项、全量 224 项 Vitest、workspace typecheck、受影响文件零告警 ESLint、Prettier 通过。完成 151 / 217 项（69.6%）。
- 2026-09-26：阶段 6 的 XHR 失败路径回归先复现问题：网络 `error` 时 readyState 4、status 0 仍会被 configured response 替换为成功 status / body。V3 XHR 现将 status 0 视为没有可替换的 HTTP response；`readystatechange` 与 `error` 均保留原生失败结果。XHR 定向 14 项、全量 225 项 Vitest、workspace typecheck、受影响文件零告警 ESLint、Prettier 通过。完成 152 / 218 项（69.7%）。
- 2026-09-26：阶段 6 为 MV3 启动期 V3 面板消息入口添加信任边界回归：不匹配的扩展 ID、V2 面板 URL、畸形 envelope 均同步拒绝，且不触发 storage 读写或 sendResponse。定向 15 项测试和改动文件 ESLint / Prettier 通过。完成 153 / 219 项（69.9%）。
- 2026-09-26：阶段 6 补齐 V3 XHR `onload` 属性处理器生命周期：重复赋值时只触发最新回调，设为 `null` 后后续请求不会调用已移除回调。XHR 定向 15 项、全量 229 项 Vitest、workspace typecheck、受影响文件零告警 ESLint 和 Prettier 通过。完成 154 / 220 项（70.0%）。
- 2026-09-26：阶段 6 补齐 V3 启动期 GET snapshot 的 storage 初始化失败分支：回传稳定 `storage-read-failed`，不触碰尚未就绪的 storage。定向 16 项、全量 230 项 Vitest、workspace typecheck、改动文件零告警 ESLint 和 Prettier 通过。完成 155 / 221 项（70.1%）。
- 2026-09-26：阶段 6 为 response function executor 增加可信 iframe 往返回归：忽略错误 source 的 `ready` / `result`，只接受 `origin='null'` 且 source 为已登记 sandbox iframe 的握手和匹配 ID 结果；验证 run 投递携带原始 code 与 request / response snapshot。全量 231 项 Vitest、workspace typecheck、改动文件零告警 ESLint 和 Prettier 通过。完成 156 / 222 项（70.3%）。
- 2026-09-26：阶段 6 补齐 sandbox 合法错误结果路径：匹配 iframe / execution ID 的 `ok:false` 消息使 executor Promise 以经过校验的错误信息 reject。定向和全量测试、workspace typecheck、改动文件 ESLint / Prettier 通过。完成 157 / 223 项（70.4%）。
- 2026-09-26：阶段 6 补齐 sandbox 硬超时与取消回归：执行达到 5 秒时 Promise reject 且向 sandbox 发送 cancel；100 ms 宽限期后移除 iframe，作为 worker 阻止取消时的终止后备。定向测试和全量验证通过。完成 158 / 224 项（70.5%）。
- 2026-09-26：阶段 6 补齐 sandbox 源码长度边界：空白源码及 65,537 字符源码均以稳定错误拒绝，且不会查找或创建 iframe。定向与全量测试、workspace typecheck、改动文件 ESLint / Prettier 通过。完成 159 / 225 项（70.7%）。
- 2026-09-26：阶段 6 补齐 sandbox 最大并发回归：四个等待执行的调用均能完成，第五个调用在投递前被稳定拒绝，不影响已接受请求。定向与全量测试、workspace typecheck、改动文件 ESLint / Prettier 通过。完成 160 / 226 项（70.8%）。
- 2026-09-26：阶段 6 将 XHR `status=0` 保留回归扩展到网络 `error`、`abort` 和 `timeout`，确认 readyState 4 与各终止事件的监听器读取到原生失败响应，不应用 configured success replacement。全量 237 项 Vitest、workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 161 / 227 项（71.0%）。
- 2026-09-26：阶段 6 为 sandbox iframe 验证补回归：拒绝普通网站 URL 与扩展内错误路径，防止 executor 向非 sandbox 页面投递函数代码和快照。全量 239 项 Vitest、workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 162 / 228 项（71.1%）。
- 2026-09-26：阶段 6 补齐 sandbox `ready` 握手校验：错误 origin、错误 source 和含额外字段的消息都不会启动执行；无效握手最终以加载超时稳定失败。全量 240 项 Vitest、workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 163 / 229 项（71.2%）。
- 2026-09-26：阶段 6 补齐 sandbox 迟到 / 未知 execution ID 路径：正确 iframe 上旧请求的合法形状结果不能抢先 resolve 当前调用，只有当前 ID 对应结果生效。全量 240 项 Vitest、workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 164 / 230 项（71.3%）。
- 2026-09-26：阶段 6 补齐 sandbox timeout 后宽限期内的迟到结果路径：Promise 保持 timeout rejection，不接收迟到结果，并立即移除执行 iframe、清除后备 timer。全量 241 项 Vitest、workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 165 / 231 项（71.4%）。
- 2026-09-26：阶段 6 补齐 sandbox 消息发送异常路径：frame `postMessage` 同步抛错时 executor 清理 pending timer 并以原错误 reject，调用者可按 fail-open 处理。全量 242 项 Vitest、workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 166 / 232 项（71.6%）。
- 2026-09-26：阶段 6 建立 Vue 3 组件测试环境（复用 vue3-panels 的 Vite / Vue 插件，独立 Vitest + jsdom 配置及 `test:v3-ui` 命令），首个 `SiteSwitchesDialog` 回归覆盖打开焦点、完整 URL 规范化为精确 origin、停用与重新启用事件；CI 增加独立组件测试步骤。冻结 lockfile 安装、1 项组件测试、242 项全量 Vitest、workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 167 / 233 项（71.7%）。
- 2026-09-26：阶段 6 补齐站点开关表单拒绝回归：拒绝 FTP URL 和已停用 origin，显示明确错误且不发出 disable 事件。Vue 3 组件测试增至 2 项；组件 / 全量 Vitest、workspace typecheck、改动文件 ESLint / Prettier 通过。完成 168 / 234 项（71.8%）。
- 2026-09-26：阶段 6 补齐站点开关键盘交互：从焦点序列首项 Shift+Tab 回绕到末项，末项 Tab 回到首项，Escape 发出关闭事件；同时确认打开时输入框获得焦点。Vue 3 组件测试增至 3 项，组件 / 全量 Vitest、workspace typecheck、改动文件 ESLint / Prettier 通过。完成 169 / 235 项（71.9%）。
- 2026-09-26：阶段 6 为响应规则编辑器增加组件回归：匹配 URL 首尾空格及小于 HTTP 最低范围的状态码均显示校验错误，不发出保存事件。Vue 3 组件测试增至 4 项；组件 / 全量 Vitest、workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 170 / 236 项（72.0%）。
- 2026-09-26：阶段 6 为函数响应编辑添加 UI 安全确认回归：用户取消 `window.confirm` 时不发出 save；确认后发出函数 mode 数据，函数响应仍默认关闭，避免刚保存即执行。Vue 3 组件测试增至 5 项；组件 / 全量 Vitest、workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 171 / 237 项（72.2%）。
- 2026-09-26：阶段 6 组件测试发现并修复函数响应启用确认取消时 checkbox 仍保持视觉勾选的问题。现同步 DOM checked 属性与确认结果；取消保持关闭，确认才开启，安全提示可见。Vue 3 组件测试增至 7 项；组件 / 全量 Vitest、V3 面板 build、workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 173 / 239 项（72.4%）。
- 2026-09-26：阶段 6 为 JSON body 编辑回归补齐错误和恢复闭环：语法错误显示准确行列且阻止保存；输入修正后清除过期错误，保存解析后的 JSON body。Vue 3 组件测试增至 8 项；组件 / 全量 Vitest、workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 174 / 240 项（72.5%）。
- 2026-09-26：阶段 6 补齐响应编辑器切换规则的重置回归：关闭后切换到另一规则再打开，URL、状态码和 JSON body 都从新 rule 初始化，先前验证错误清空。Vue 3 组件测试增至 9 项；组件 / 全量 Vitest、workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 175 / 241 项（72.6%）。
- 2026-09-26：阶段 6 为 V3 domain 正则匹配器覆盖缓存复用及 256 项 LRU 上限：连续匹配 257 个唯一规则后再次请求最早模式，验证缓存淘汰后会重新编译且匹配结果仍正确。全量 243 项 Vitest、workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 176 / 242 项（72.7%）。
- 2026-09-26：阶段 6 补齐 V3 domain 运行时 matcher 防御边界：畸形匹配类型、超过 4096 字符的正则和抛错 matcher 对象分别产生稳定诊断，选择器跳过异常规则并继续命中下一条有效规则。全量 244 项 Vitest、9 项 Vue 3 组件测试、workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 177 / 243 项（72.8%）。
- 2026-09-26：阶段 6 为 V3 no-match Service Worker 队列补 storage 读取失败回归：读取异常向调用者 reject，不消耗诊断 arm、不转发事件；队列恢复后下一条有效事件正常完成。全量 245 项 Vitest、workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 178 / 244 项（73.0%）。
- 2026-09-26：阶段 6 执行全量覆盖率报告（32 个测试文件、245 项）：总体语句 75.41%、分支 71.86%、函数 77.41%、行 77.22%；V3 matcher 分支 96.07%，达到 95% 目标；V3 backup 配置校验分支 86.29%、响应 action 80.48%、函数 sandbox 77.27%、XHR runtime 84.21%，仍低于目标，后续按风险补测。更新 matcher cache-hit 回归后，domain 总覆盖为语句 90.34%、分支 89.73%、函数 100%、行 89.71%。完成 179 / 245 项（73.1%）。
- 2026-09-26：阶段 6 为 V3 backup 配置补 regex 规则数、header 数与组合 UTF-8 字节数、disabled origin 数量上限回归；上限溢出均拒绝导入。全量覆盖运行 246 项 Vitest 后，整体语句 75.57%、分支 72.09%、函数 77.41%、行 77.40%；`backup.ts` 分支覆盖由 86.29% 提升至 88.14%，V3 domain 整体分支 91.05%。workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 180 / 246 项（73.2%）。
- 2026-09-26：阶段 6 为 V3 response function 覆盖响应 snapshot 超过 512 KiB 的 fail-open 路径：executor 不运行，`snapshot-too-large` 诊断固定，fetch 返回同一原 Response 且 body 完整可读。全量覆盖运行 247 项 Vitest 后，整体语句 75.65%、分支 72.28%、函数 77.41%、行 77.40%；`responseAction.ts` 分支覆盖由 80.48% 提升至 85.36%，V3 runtime 总分支为 83.49%。workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 181 / 247 项（73.3%）。
- 2026-09-26：阶段 6 为 V3 XHR 增加 `EventListenerObject.handleEvent` 回归；断言回调 `this` 保持 listener object，`target` / `currentTarget` 在回调期间指向公开 XHR proxy。全量覆盖运行 248 项 Vitest 后，整体语句 75.69%、分支 72.32%、函数 77.41%、行 77.45%；`xhr.ts` 分支覆盖升至 84.73%，V3 runtime 总分支 83.74%。workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 182 / 248 项（73.4%）。
- 2026-09-26：阶段 6 为 V3 backup 严格校验补结构畸形回归，按 issue path 检查非对象 settings / rule、非对象 action / payload / headers 和无 action rule 均被拒绝。全量覆盖运行 249 项 Vitest 后，整体语句 76.14%、分支 72.70%、函数 77.41%、行 77.91%；`backup.ts` 分支覆盖达到 91.11%，V3 domain 整体分支达到 93.15%。workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 183 / 249 项（73.5%）。
- 2026-09-26：阶段 6 为 V3 XHR 覆盖 boolean 与 `{capture:true}` 参数映射、不同 wrapper 缓存及匹配 capture 移除。全量覆盖运行 250 项 Vitest 后，整体语句 76.14%、分支 72.88%、函数 77.41%、行 77.91%；`xhr.ts` 分支覆盖升至 86.84%，V3 runtime 总分支 84.72%。workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 184 / 250 项（73.6%）。
- 2026-09-26：阶段 6 为 response function 缺少 sandbox executor 覆盖 fail-open：完整返回原 response，报告 `sandbox-unavailable` 和固定 unsupported outcome。全量覆盖运行 251 项 Vitest 后，整体语句 76.26%、分支 72.93%、函数 77.41%、行 78.04%；`responseAction.ts` 分支覆盖升至 86.58%，V3 runtime 总分支 84.97%。workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 185 / 251 项（73.7%）。
- 2026-09-26：阶段 6 为标记为文本但字节无法按 UTF-8 解码的 Fetch response 增加 function snapshot 回归；executor 不运行，保留原 response 身份与完整原始字节，并回传固定 unsupported 诊断。全量覆盖运行 252 项 Vitest，整体覆盖保持语句 76.26%、分支 72.93%、函数 77.41%、行 78.04%。workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 186 / 252 项（73.8%）。
- 2026-09-26：阶段 6 为超过 100 个 header 的 response snapshot 覆盖 fail-open：executor 不运行，报告 `snapshot-too-large` 并保留完整网络响应。全量覆盖运行 253 项 Vitest 后，整体语句 76.30%、分支 72.98%、函数 77.41%、行 78.09%；`responseAction.ts` 分支覆盖升至 87.80%，V3 runtime 总分支 85.22%。workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 187 / 253 项（73.9%）。
- 2026-09-26：阶段 6 为 response snapshot 覆盖响应 headers 的合计 UTF-8 字节超过 32 KiB 时拒绝执行函数、保留原始 response 并报告 `snapshot-too-large`。全量覆盖运行 254 项 Vitest，整体语句 76.30%、分支 72.98%、函数 77.41%、行 78.09%；`responseAction.ts` 分支 87.80%。workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 188 / 254 项（74.0%）。
- 2026-09-26：阶段 6 将 Fetch no-body 回归扩展为 HEAD、204、205、304 四种情况；replacement body 均被丢弃，且统计回调抛错不改变请求结果。全量覆盖运行 257 项 Vitest，覆盖率保持语句 76.30%、分支 72.98%、函数 77.41%、行 78.09%。workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 189 / 257 项（73.5%）。
- 2026-09-26：阶段 6 覆盖 Fetch outcome service worker 对 response-only 规则的 request 网络失败校验；即便 request action 关闭，只要 response action 启用且 outcome 与 rule 匹配，已 armed 诊断仍正确转发。全量覆盖运行 258 项 Vitest 后，整体语句 76.38%、分支 73.26%、函数 77.41%、行 78.18%；`v3FetchOutcome.ts` 分支覆盖升至 80.39%。workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 190 / 258 项（73.6%）。
- 2026-09-26：阶段 6 为 Fetch outcome service worker 增加重定向构造失败、unsupported response 和全局关闭 gate 回归；校验通过的 fallback 按 rule action 转发，全局关闭时不读取一次性 arm。全量覆盖运行 260 项 Vitest 后，整体语句 76.50%、分支 73.72%、函数 77.41%、行 78.27%；`v3FetchOutcome.ts` 分支覆盖达 98.03%。workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 191 / 260 项（73.5%）。
- 2026-09-26：阶段 6 为 Fetch outcome service worker 覆盖无效存储配置的拒绝路径；invalid V3 backup 不读取一次性 arm、不转发诊断。全量覆盖运行 261 项 Vitest，整体语句 76.50%、分支 73.72%、函数 77.41%、行 78.27%；`v3FetchOutcome.ts` 未覆盖路径已清零。workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 192 / 261 项（73.6%）。
- 2026-09-26：阶段 6 为 V3 badge 覆盖配置无效 / 全局关闭时清空旧徽章，且不读取 V3 hit counters。全量覆盖运行 262 项 Vitest 后，整体语句 76.58%、分支 73.86%、函数 77.41%、行 78.32%；`v3Hit.ts` 语句 / 行 / 函数覆盖 100%，分支 95%。workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 193 / 263 项（73.4%）。
- 2026-09-26：阶段 6 为 V3 XHR 覆盖规则读取在异步 `open()` 期间抛错的 fail-open 路径；扩展保持原 URL、method、async、用户名和密码参数调用原生 `open()`。全量覆盖运行 263 项 Vitest 后，整体语句 76.62%、分支 73.86%、函数 77.41%、行 78.36%；`xhr.ts` 行覆盖达到 95%。workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 194 / 264 项（73.5%）。
- 2026-09-26：阶段 6 为 V3 Fetch 覆盖运行时非法 response status（700）导致 `Response` 构造异常的回退路径；不暴露构造错误，返回相同原始 response / body 并报告 `response-replacement-failed`。全量覆盖运行 264 项 Vitest 后，整体语句 76.70%、分支 73.86%、函数 77.41%、行 78.46%；`responseAction.ts` 语句覆盖 94.01%、行覆盖 96.22%。workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 195 / 265 项（73.6%）。
- 2026-09-26：阶段 6 为 V3 backup JSON body 校验覆盖 JavaScript 输入中的 `NaN` 与正无穷，均按精确字段路径拒绝。全量覆盖运行 264 项 Vitest，整体语句 76.70%、分支 73.86%、函数 77.41%、行 78.46%。workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 196 / 266 项（73.7%）。
- 2026-09-26：阶段 6 为 V3 backup / response result validator 补规则级未知字段拒绝、恶意 Proxy 原型读取异常拒绝及空函数结果拒绝。全量覆盖运行 265 项 Vitest 后，整体语句 76.87%、分支 74.00%、函数 77.41%、行 78.64%；`backup.ts` 分支覆盖升至 92.22%，V3 domain 分支覆盖 93.94%。workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 197 / 267 项（73.8%）。
- 2026-09-26：阶段 6 为 V3 Fetch 仅修改响应 headers 增加原 body clone 保留回归，并确认原始 Response 仍可独立读取。全量覆盖运行 266 项 Vitest 后，整体语句 76.91%、分支 74.10%、函数 77.41%、行 78.68%；`responseAction.ts` 分支覆盖升至 90.24%。workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 198 / 268 项（73.9%）。
- 2026-09-26：阶段 6 为 V3 XHR 响应配置自定义函数代码增加 fail-open 回归；原生 status / body 保持不变，并报告 `response-replacement-unsupported`。全量覆盖运行 267 项 Vitest 后，整体语句 76.95%、分支 74.14%、函数 77.41%、行 78.73%；`xhr.ts` 分支覆盖升至 87.36%。workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 199 / 269 项（74.0%）。
- 2026-09-26：阶段 6 为 V3 XHR 非法替换 status 增加 fail-open 回归；原生 status / body 保持不变，并报告 `response-replacement-failed`。全量覆盖运行 268 项 Vitest 后，整体语句 76.99%、分支 74.24%、函数 77.41%、行 78.78%；`xhr.ts` 分支覆盖升至 88.42%。workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 200 / 270 项（74.1%）。
- 2026-09-26：阶段 6 覆盖 response executor 以 sandbox-unavailable 错误拒绝时的执行错误分类；原 response / body 保留，错误 code 和 response fallback outcome 稳定。全量覆盖运行 269 项 Vitest 后，整体语句 77.03%、分支 74.33%、函数 77.41%、行 78.78%；`responseAction.ts` 分支覆盖升至 92.68%。workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 201 / 271 项（74.2%）。
- 2026-09-26：阶段 6 为函数执行错误诊断 callback 自身抛错补回归；异常不向外泄漏，原始 Response / body 与 fallback outcome 保持。全量覆盖运行 270 项 Vitest，整体语句 77.03%、分支 74.33%、函数 77.41%、行 78.78%。workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 202 / 272 项（74.3%）。
- 2026-09-26：阶段 6 为 V3 XHR outcome callback 抛错补保护回归；diagnostic 异常不向外传播，原生 `send()` 仍收到原 body。全量覆盖运行 271 项 Vitest，整体语句 77.03%、分支 74.33%、函数 77.41%、行 78.78%。workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 203 / 273 项（74.4%）。
- 2026-09-26：阶段 6 为 V3 backup 覆盖非法 rule ID / enabled、空白 matcher URL 与 request / response enabled 字段；对应 schema path 均被拒绝。全量覆盖运行 272 项 Vitest 后，整体语句 77.15%、分支 74.47%、函数 77.41%、行 78.87%；`backup.ts` 分支覆盖升至 93.33%，V3 domain 分支覆盖 94.73%。workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 204 / 274 项（74.5%）。
- 2026-09-26：阶段 6 为 V3 Fetch 仅修改 headers 且原始 response body 为空的场景补回归；替换结果保持 null body。全量覆盖运行 273 项 Vitest 后，整体语句 77.15%、分支 74.52%、函数 77.41%、行 78.87%；`responseAction.ts` 分支覆盖升至 93.90%。workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 205 / 275 项（74.5%）。
- 2026-09-26：阶段 6 为 V3 backup 覆盖重复 tag ID、空白名称和非 boolean `used`；错误字段路径均稳定报告。全量覆盖运行 274 项 Vitest 后，整体语句 77.27%、分支 74.66%、函数 77.41%、行 78.96%；`backup.ts` 分支覆盖升至 94.44%，V3 domain 总分支覆盖达到 95.52%（超过 95% 目标）。workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 206 / 276 项（74.6%）。
- 2026-09-26：阶段 6 为 V3 backup settings 的 `globalEnabled`、`mode` 和 `language` 增加无效值拒绝及字段路径回归。全量覆盖运行 275 项 Vitest 后，整体语句 77.39%、分支 74.84%、函数 77.41%、行 79.10%；`backup.ts` 分支覆盖达到 95.92%，达到 95% 目标。workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 207 / 277 项（74.7%）。
- 2026-09-26：阶段 6 为 V3 response function 在 request / response 均无 body 时补空快照回归；executor 收到省略的 request body 与空 response body，返回仍保持 null body。全量覆盖运行 276 项 Vitest 后，整体语句 77.39%、分支 74.89%、函数 77.41%、行 79.10%；`responseAction.ts` 分支覆盖达到 95.12%，达到 95% 目标。workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 208 / 278 项（74.8%）。
- 2026-09-26：阶段 6 为 V3 backup 校验覆盖非对象 tag 与空 ID，错误条目均按路径拒绝。全量覆盖运行 277 项 Vitest 后，整体语句 77.51%、分支 74.98%、函数 77.41%、行 79.23%；`backup.ts` 分支覆盖升至 96.66%，V3 domain 总分支覆盖达到 97.10%。workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 209 / 279 项（74.9%）。
- 2026-09-26：阶段 6 为 V3 XHR 覆盖 `responseType=json` 下读取 `responseText` 时保留原生 `InvalidStateError`。全量覆盖运行 278 项 Vitest 后，整体语句 77.55%、分支 75.08%、函数 77.41%、行 79.28%；`xhr.ts` 分支覆盖升至 89.47%。workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 210 / 280 项（75.0%）。
- 2026-09-26：阶段 6 新增 Service Worker V3 function error 通知回归：只转发当前启用、匹配且函数 action 已启用的规则，关闭全局开关或规则不匹配时不发通知。全量覆盖运行 279 项 Vitest 后，整体语句 78.00%、分支 75.78%、函数 77.91%、行 79.69%；`v3FunctionError.ts` 分支覆盖 93.75%。workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 211 / 281 项（75.1%）。
- 2026-09-26：阶段 6 为 Vue 3 RedirectRuleEditor 增加必填 / 首尾空格拒绝、regex / POST / redirect target / tag IDs 精确保存 payload 组件回归。Vue 3 组件测试 10 项通过，全量 Vitest 279 项、workspace typecheck、改动文件零告警 ESLint / Prettier 通过；总体覆盖语句 78.00%、分支 75.78%、函数 77.91%、行 79.69%。完成 212 / 282 项（75.2%）。
- 2026-09-26：阶段 6 为 V3 panel storage 覆盖有效 config 后读取 hit counters 失败及显式清空 config 写入失败；两条路径都返回稳定 storage error，不返回半截配置或写入其他 key。全量覆盖运行 281 项 Vitest 后，整体语句 78.04%、分支 75.78%、函数 77.91%、行 79.74%；`v3Panel.ts` 语句 / 行 / 函数覆盖达到 100%。workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 213 / 283 项（75.3%）。
- 2026-09-26：阶段 6 为 BackupRestoreDialog 增加函数规则恢复确认和导入 source 编辑后失效旧预览的组件回归；拒绝确认不 restore，确认后发出解析并停用函数 action 的规范化备份。Vue 3 组件测试 12 项通过，全量 Vitest 281 项、workspace typecheck、改动文件零告警 ESLint / Prettier 通过；总体覆盖语句 78.04%、分支 75.78%、函数 77.91%、行 79.74%。完成 214 / 284 项（75.4%）。
- 2026-09-26：阶段 6 为 RuleTagsDialog 增加新建 tag 原名 emit 后清空输入，以及相同 / 空白重命名 disabled、有效名称 emit 的组件回归。Vue 3 组件测试 14 项通过，全量 Vitest 281 项；workspace typecheck、改动文件零告警 ESLint / Prettier 通过；总体覆盖语句 78.04%、分支 75.78%、函数 77.91%、行 79.74%。完成 215 / 285 项（75.4%）。
- 2026-09-26：阶段 6 为 V3 XHR 覆盖 dispatch 完成后 `currentTarget` 回到原生空值，以及 null listener 的注册 / 移除不触碰 native listener。全量覆盖运行 282 项 Vitest 后，整体语句 78.20%、分支 76.01%、函数 77.91%、行 79.83%；`xhr.ts` 分支覆盖升至 92.10%。workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 216 / 286 项（75.5%）。
- 2026-09-26：阶段 6 为 V3 XHR 覆盖非法原始请求 URL 与非法 redirect URL 的 fail-open；两种场景均原样调用 native `open()`。全量覆盖运行 283 项 Vitest 后，整体语句 78.28%、分支 76.01%、函数 77.91%、行 79.92%；`xhr.ts` 语句覆盖 97.93%、行覆盖 98.88%。workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 217 / 287 项（75.6%）。
- 2026-09-26：阶段 6 为 V3 XHR 覆盖空 response replacement：保留 native status / body，且不产生 applied outcome。全量覆盖运行 284 项 Vitest 后，整体语句 78.28%、分支 76.15%、函数 77.91%、行 79.92%；`xhr.ts` 分支覆盖升至 93.68%。workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 218 / 288 项（75.7%）。
- 2026-09-26：阶段 6 为 V3 function error Service Worker 覆盖 V3 config storage reject；异常向上游传播，由消息入口隔离处理，且不发送通知。全量覆盖运行 285 项 Vitest，整体语句 78.28%、分支 76.15%、函数 77.91%、行 79.92%；workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 219 / 289 项（75.8%）。
- 2026-09-26：阶段 6 为 V3 function error Service Worker 覆盖带额外私有字段的畸形 envelope；在 storage 读取前拒绝，不发送通知。全量覆盖运行 286 项 Vitest 后，整体语句 78.32%、分支 76.20%、函数 77.91%、行 79.92%；workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 220 / 290 项（75.9%）。
- 2026-09-26：阶段 6 为 V3 XHR outcome Service Worker 覆盖 V3 config 与一次性诊断开关的 storage reject；两种拒绝均向上游传播且不发送通知。全量覆盖运行 288 项 Vitest 后，整体语句 78.32%、分支 76.20%、函数 77.91%、行 79.92%；workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 221 / 291 项（76.0%）。
- 2026-09-26：阶段 6 为 RuleTemplatesDialog 新增组件测试，覆盖模板选择事件、saving 禁用、焦点 / ARIA、错误提示与关闭交互；Vue 3 组件测试 19 项通过，全量覆盖套件 288 项，整体覆盖语句 78.32%、分支 76.20%、函数 77.91%、行 79.92%。该测试 ESLint / Prettier 通过。完成 222 / 292 项（76.0%）。
- 2026-09-26：阶段 6 为 V3 XHR 覆盖文本响应替换及替换 body 序列化抛错时保留原生响应的 fail-open。全量覆盖运行 289 项 Vitest 后，整体语句 78.40%、分支 76.24%、函数 77.91%、行 80.01%；`xhr.ts` 行覆盖达到 100%，分支覆盖升至 94.21%。workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 223 / 293 项（76.1%）。
- 2026-09-26：阶段 6 为 V3 XHR 覆盖未配置重定向的规则遇到同步 native send 错误时保持异常传播且不误报 redirect outcome。全量覆盖运行 290 项 Vitest 后，整体语句 78.40%、分支 76.29%、函数 77.91%、行 80.01%；`xhr.ts` 分支覆盖升至 94.73%。改动文件零告警 ESLint / Prettier 通过。完成 224 / 294 项（76.2%）。
- 2026-09-26：阶段 6 为 V3 XHR 覆盖相对 URL 以页面 location 为基址解析，同时保留传给原生 `open()` 的参数。全量覆盖运行 291 项 Vitest 后，整体语句 78.40%、分支 76.34%、函数 77.91%、行 80.01%；`xhr.ts` 分支覆盖达到 95.26%，满足核心模块 95% 目标。改动文件零告警 ESLint / Prettier 通过。完成 225 / 295 项（76.3%）。
- 2026-09-26：阶段 6 为 Service Worker 消息入口补异步拒绝隔离集成回归；V3 function error 通知 Promise reject 后，同一 listener 仍处理下一条合法消息。全量覆盖运行 292 项 Vitest 后，整体语句 79.41%、分支 77.60%、函数 78.66%、行 81.16%；Service Worker 目录语句 69.06%、分支 67.61%。workspace typecheck、改动文件零告警 ESLint / Prettier 通过；Edge Stable 153.0.4234.48 的 V3 Fetch/XHR runtime smoke 通过。完成 226 / 296 项（76.4%）。
- 2026-09-26：阶段 6 为 V3 backup、ruleMatching、Fetch、responseAction 和 XHR 核心文件启用各自独立的 95% 分支覆盖 CI 门槛；不对全仓或旧 V2 包设置全局 95% 门槛。responseFunctionSandbox（77.27%）和 runtimeController（84%）仍需补测，已记为后续工作。全量覆盖运行 292 项 Vitest，五个逐文件门槛均通过；整体语句 79.41%、分支 77.60%、函数 78.66%、行 81.16%。完成 227 / 297 项（76.4%）。
- 2026-09-26：阶段 6 补齐 response sandbox 加载期间 iframe 被替换的拒绝路径，以及 runtime controller no-match 诊断的 100 条上限 / truncated 行为；全量覆盖运行 294 项 Vitest，整体语句 79.45%、分支 77.64%、函数 78.66%、行 81.20%，responseFunctionSandbox 分支覆盖 78.40%、runtimeController 84%。五个 V3 核心逐文件 95% 门槛通过；两项定向测试、改动文件 ESLint / Prettier 通过。完成 229 / 299 项（76.6%）。
- 2026-09-26：阶段 6 为 response sandbox 覆盖 ready 握手成功后无法发送 run 消息的错误路径；执行拒绝原始 message channel 错误，pending 记录被清理。全量覆盖运行 295 项 Vitest，整体语句 79.45%、分支 77.64%、函数 78.66%、行 81.20%；五个核心逐文件分支门槛通过，定向测试、ESLint / Prettier 通过。完成 230 / 300 项（76.7%）。
- 2026-09-26：阶段 6 加固 V3 hit 和 service-worker hit notice 协议校验：按 own data property descriptor 安全复制后校验，拒绝 getter、symbol 与隐藏扩展字段，不触发 getter 或 proxy get trap。定向测试 11 项、全量 Vitest 298 项通过；workspace typecheck、protocol build、改动文件 ESLint、format 和包边界检查通过。全量覆盖语句 79.53%、分支 77.74%、函数 78.71%、行 81.25%；五个核心逐文件 95% 分支门槛通过。全仓 `lint:all` 仍有 722 errors / 6,095 warnings（改动文件单独 lint 通过）。完成 231 / 301 项（76.7%）。
- 2026-09-26：阶段 6 为 V3 response function result validator 补可枚举 body getter 抛错回归，验证异常被隔离并返回稳定的 JSON 安全错误。domain 定向测试 36 项、全量 Vitest 299 项通过；改动文件 ESLint / Prettier 通过。全量覆盖语句 79.57%、分支 77.74%、函数 78.71%、行 81.30%；domain 分支覆盖 97.10%，五个核心逐文件门槛通过。完成 232 / 302 项（76.8%）。
- 2026-09-26：阶段 6 为 Service Worker no-match 转发覆盖规则数超过 100 时的截断标志、前 100 条规则顺序 / ID，以及不一致 payload 在消费一次性诊断许可前被拒绝。定向测试 7 项、全量 Vitest 301 项通过；改动文件 ESLint / Prettier 通过。全量覆盖语句 79.57%、分支 77.74%、函数 78.71%、行 81.30%，五个核心逐文件门槛通过。完成 233 / 303 项（76.9%）。
- 2026-09-26：阶段 6 为 BackupRestoreDialog 增加冲突标签 ID 的规则导入流程回归：名称冲突时显示错误并阻止发出 import-rules；当前标签名称一致后成功发出规范化导入数据。定向组件测试 3 项、全部 Vue 3 组件测试 20 项通过；改动文件 ESLint / Prettier 通过。完成 234 / 304 项（77.0%）。
- 2026-09-26：阶段 6 为 ResponseRuleEditor 增加函数响应保存确认流程测试：取消安全确认不发出 save，明确确认后保存函数代码且 responseEnabled 默认 false。定向组件测试 2 项、全部 Vue 3 组件测试 22 项（5 个文件）通过；改动文件 ESLint / Prettier 通过。完成 235 / 305 项（77.0%）。
- 2026-09-26：阶段 6 为 RedirectRuleEditor 增加编辑态切换回归：从规则 A 切换到 B 时重新填充匹配和重定向字段、筛选方式、method 与标签，清除旧校验提示，并发出 B 的 redirect save payload。定向测试 2 项、全部 Vue 3 组件测试 23 项（5 个文件）通过；改动文件 ESLint / Prettier 通过。完成 236 / 306 项（77.1%）。
- 2026-09-26：阶段 6 扩展 E2E 增加快速创建规则停用回归：停用精确响应规则并重载真实页面后，请求由既有通用规则接手，返回预期 202 响应；配置中的精确规则继续持久化为 disabled。`pnpm extension:smoke` 通过，改动脚本 ESLint / Prettier 通过。完成 237 / 307 项（77.2%）。
- 2026-09-26：阶段 6 补 V3 response function sandbox 的 `crypto.randomUUID()` 失败兼容路径：生成符合格式的 fallback ID，收到对应 sandbox 结果后正常 resolve。定向测试 13 项、全量 Vitest 302 项通过；整体覆盖语句 79.61%、分支 77.74%、函数 78.71%、行 81.34%；改动文件 ESLint / Prettier 通过。完成 238 / 308 项（77.3%）。
- 2026-09-26：阶段 6 补齐响应规则 JSON 保存成功路径：状态码、解析后的 JSON body、匹配条件、规则 enabled 和所选标签 ID 被组合到 save event。Vue 3 组件测试增至 6 项；组件 / 全量 Vitest、workspace typecheck、改动文件零告警 ESLint / Prettier 通过。完成 172 / 238 项（72.3%）。
- 2026-09-26：阶段 6 修复 V3 runtime controller 读取页面 origin 时的 fail-open 边界：宿主 `location` getter 抛错时 Fetch 保持原生并跳过诊断；缺少 `location` 的测试宿主仍沿用既有规则行为。全量覆盖 303 项 Vitest、workspace typecheck、改动文件 ESLint / Prettier 通过；整体覆盖语句 79.67%、分支 77.77%、函数 78.76%、行 81.41%。完成 239 / 309 项（77.3%）。
- 2026-09-26：阶段 6 为 V3 Fetch 同源重定向补充凭据保留边界：重定向后 `authorization`、`proxy-authorization`、`cookie`、`cookie2` 与自定义 header 保持不变，请求 body 可读；和已有跨源重定向移除敏感头测试形成对称保护。全量覆盖 304 项 Vitest、Fetch 定向测试 31 项、workspace typecheck、改动文件 ESLint / Prettier 通过；整体覆盖语句 79.67%、分支 77.77%、函数 78.76%、行 81.41%。完成 240 / 310 项（77.4%）。
- 2026-09-26：阶段 6 为 response function sandbox 超时清理补充 cancel 消息发送异常路径：cancel `postMessage` 抛错时仍返回稳定超时错误，并在 100ms grace period 到期后移除 iframe。sandbox 定向测试 14 项、全量覆盖 305 项 Vitest、workspace typecheck、改动文件 ESLint / Prettier 通过；整体覆盖语句 79.67%、分支 77.77%、函数 78.76%、行 81.41%。完成 241 / 311 项（77.5%）。
- 2026-09-26：阶段 6 补 V3 runtime controller 的 function-error 通知集成：响应函数 sandbox 返回非法结果时 Fetch 保留原生响应，并发出 detail 符合 `V3FunctionError` protocol validator 的 CustomEvent；事件只含 rule ID、匹配条件、method 和稳定错误码，不带请求 URL query 或异常文本。runtimeController 定向测试 8 项、全量覆盖 306 项 Vitest、workspace typecheck、改动文件 ESLint / Prettier 通过；runtimeController 行覆盖 100%，整体覆盖语句 79.87%、分支 77.81%、函数 79.25%、行 81.59%。完成 242 / 312 项（77.6%）。
- 2026-09-26：阶段 6 为 RuleTagFilterPopover 增加选择与清除标签筛选的组件回归：选择 Team B 发出 `team-b`，清除筛选发出空字符串。Vue 3 组件套件 24 项（6 个文件）通过，改动文件 ESLint / Prettier 通过。完成 243 / 313 项（77.6%）。
- 2026-09-26：阶段 6 为 Service Worker 消息入口补合法 V3 XHR outcome 路由集成：共享 outcome key 下的有效 `v3-xhr-outcome` 只调用 XHR notifier，不误调 Fetch notifier；同一 listener 在 function-error 通知 Promise reject 后继续处理后续消息。全量覆盖 306 项 Vitest、workspace typecheck、改动文件 ESLint / Prettier 通过；整体覆盖语句 79.91%、分支 78.00%、函数 79.25%、行 81.64%。完成 244 / 314 项（77.7%）。
- 2026-09-26：为 RuleTagFilterPopover 补键盘可访问性回归：弹窗从关闭切为打开后首个标签选项获得焦点，按 Escape 发出 close。Vue 3 组件套件 25 项（6 个文件）通过，改动文件 ESLint / Prettier 通过。完成 245 / 315 项（77.8%）。
- 2026-09-26：阶段 6 为 Service Worker V3 内容通知补无 tab sender 拒绝边界：相同扩展 ID 但缺少 `sender.tab` 的合法 function-error 消息不会触发 function-error、no-match、Fetch / XHR outcome 或 panel 通知；合法 content sender 后续仍被处理。全量覆盖 306 项 Vitest、workspace typecheck、改动文件 ESLint / Prettier 通过；整体覆盖语句 79.99%、分支 78.14%、函数 79.25%、行 81.69%。完成 246 / 316 项（77.8%）。
- 2026-09-26：阶段 6 扩展 E2E 补 V3 函数规则的重启持久化行为：关闭并重开持久化浏览器上下文后确认函数规则及两个启用状态仍保留，重载页面后 Fetch 继续返回函数生成的 209 响应。`pnpm extension:smoke`、改动脚本 ESLint / Prettier 通过。完成 247 / 317 项（77.9%）。
- 2026-09-26：阶段 6 为 runtime controller 未命中诊断补异常隔离回归：content `dispatchEvent` 抛错时 Fetch 仍返回同一个原生 Response，原生 fetch 只调用一次。全量覆盖 307 项 Vitest、workspace typecheck、改动文件 ESLint / Prettier 通过；整体覆盖语句 79.99%、分支 78.14%、函数 79.25%、行 81.69%。完成 248 / 318 项（78.0%）。
- 2026-09-26：阶段 6 补 V3 runtime controller 未配置 backup 时的 Fetch 透明行为：原生 fetch 只调用一次、返回同一个原生 Response，且不发送诊断。全量覆盖 308 项 Vitest、workspace typecheck、改动文件 ESLint / Prettier 通过；runtimeController 覆盖语句 98.41%、分支 89.28%、函数 / 行 100%，全量覆盖语句 80.03%、分支 78.19%、函数 79.25%、行 81.69%。完成 249 / 319 项（78.1%）。
- 2026-09-26：阶段 6 为 response function sandbox round-trip 补 malformed result 生命周期验证：当前执行 ID 的成功 envelope 带额外字段时不 settle Promise / 不消费 pending，后续同 ID 的合法结果仍正常 resolve。sandbox 定向 14 项、全量覆盖 308 项 Vitest、workspace typecheck、改动文件 ESLint / Prettier 通过。完成 250 / 320 项（78.1%）。
- 2026-09-26：阶段 6 补 response function sandbox ready 状态复用回归：同一 iframe 完成一次合法握手后，第二次执行无需再次等待 ready 消息即可发送 run 并正常接收结果。sandbox 定向 14 项、全量覆盖 308 项 Vitest、workspace typecheck、改动文件 ESLint / Prettier 通过。完成 251 / 321 项（78.2%）。
- 2026-09-26：阶段 6 加固 V3 panel 消息协议的 accessor 边界：GET 路由字段与 SAVE 内层 config 仅通过 own data descriptor 读取；getter 不执行，代理 descriptor trap 异常安全拒绝。V3 panel 协议定向测试 7 项通过，改动文件 ESLint / Prettier 通过。完成 252 / 322 项（78.3%）。
- 2026-09-26：阶段 6 增加站点开关持久化闭环组件回归：禁用含路径 / 查询的 URL 只保存规范 origin，重新打开后启用会从配置移除该 origin；保存失败时对话框保持打开并显示错误。Vue 3 组件测试 27 项、改动文件 ESLint / Prettier 通过。完成 253 / 323 项（78.3%）。
- 2026-09-26：阶段 6 补 response function sandbox 多 waiter 加载超时隔离回归：较早调用加载超时后，后续仍等待同一 iframe 的调用在 ready 握手到达时仍能发送 run 并成功 resolve。sandbox 定向测试 15 项、全量覆盖 311 项 Vitest、workspace typecheck、改动文件 ESLint / Prettier 通过；整体覆盖语句 80.16%、分支 78.37%、函数 79.31%、行 81.82%，sandbox 分支覆盖升至 80.68%。完成 254 / 324 项（78.4%）。
- 2026-09-26：阶段 6 为 V3 runtime controller 补匹配规则的 hit 通知异常隔离集成回归：`dispatchEvent` 抛错时仍返回 JSON 响应替换结果，原生 Fetch 只调用一次。定向测试 11 项、全量覆盖 312 项 Vitest、workspace typecheck、改动文件 ESLint / Prettier 通过；整体覆盖语句 80.16%、分支 78.37%、函数 79.31%、行 81.82%。完成 255 / 325 项（78.5%）。
- 2026-09-26：阶段 6 加固 V3 backup 校验器对异常 getter / Proxy trap 的边界：`format` getter 与 `ownKeys` trap 抛错时返回稳定校验 issue，不向调用方逸出异常。domain 定向测试 37 项、全量覆盖 313 项 Vitest、domain 构建、workspace typecheck、改动文件 ESLint / Prettier 通过；整体覆盖语句 80.19%、分支 78.37%、函数 79.36%、行 81.85%，`backup.ts` 分支覆盖 96.66%。完成 256 / 326 项（78.5%）。
- 2026-09-26：阶段 6 增加全局代理开关持久化闭环组件回归：保存 payload 写入 `globalEnabled=false`；保存失败保留启用开关和侧栏“监视中”状态并展示错误，保存成功后顶部开关与侧栏状态同步为停用。Vue 3 组件套件 7 个文件 / 29 项测试、改动文件 ESLint / Prettier 通过。完成 257 / 327 项（78.6%）。
- 2026-09-26：阶段 6 补齐 Service Worker V3 面板 SAVE 入口真实写入拒绝回归：合法 trusted 请求异步返回 `storage-write-failed`；仅调用一次 V3 配置写入且不读取 storage。V3 panel 定向测试 19 项、全量覆盖 314 项 Vitest、workspace typecheck、改动文件 ESLint / Prettier 通过；整体覆盖语句 80.19%、分支 78.37%、函数 79.36%、行 81.85%。完成 258 / 328 项（78.7%）。
- 2026-09-26：阶段 6 补 response function sandbox 超时重置时 sibling pending 清理回归：第一个执行超时并在 100ms grace 后移除共享 iframe 时，其他执行收到固定 reset 错误且计时器被清除，不会在原截止时间再发 cancel。sandbox 定向测试 16 项、全量覆盖 315 项 Vitest、workspace typecheck、改动文件 ESLint / Prettier 通过；整体覆盖语句 80.42%、分支 78.51%、函数 79.36%、行 82.07%，sandbox 分支覆盖升至 84.09%。完成 259 / 329 项（78.7%）。
- 2026-09-26：阶段 6 验证 sandbox 超时清理仅影响旧 worker：旧 iframe 的执行超时并重置时，新 iframe 上已运行的执行仍可接收合法结果并完成；之后到达其原计时器时没有多余 cancel。sandbox 定向测试 17 项、改动文件 ESLint / Prettier 通过。完成 260 / 330 项（78.8%）。
- 2026-09-26：阶段 6 补 V3 XHR 同源重定向敏感头保留回归：请求重定向到同一 origin 的新路径时，原生 `open()` 使用目标 URL，Authorization、Cookie 与自定义 header 保持不变。XHR 定向测试 31 项、全量覆盖 317 项 Vitest、workspace typecheck、改动文件 ESLint / Prettier 通过；整体覆盖语句 80.46%、分支 78.56%、函数 79.36%、行 82.07%，sandbox 分支覆盖升至 85.22%。完成 261 / 331 项（78.9%）。
- 2026-09-26：阶段 6 补 V3 sandbox iframe 身份校验拒绝路径：携带合法 sandbox URL 的普通对象 / DOM 元素不能冒充 `HTMLIFrameElement`，executor 稳定拒绝且不投递 `postMessage`。sandbox 定向测试 18 项、改动文件 ESLint / Prettier 通过。完成 262 / 332 项（78.9%）。
- 2026-09-26：阶段 6 修复全局 V3 开关关闭时仍发送 no-match 诊断：关闭后匹配 Fetch / XHR 均保持原生响应与调用，诊断开关开启也不发送 hit、no-match 或 outcome 事件。runtime controller 定向测试 12 项、proxy-lib 构建、workspace typecheck、全量覆盖 319 项 Vitest、改动文件 ESLint / Prettier 通过；整体覆盖语句 80.50%、分支 78.61%、函数 79.36%、行 82.07%，runtimeController 分支覆盖 89.65%。完成 263 / 333 项（79.0%）。
- 2026-09-26：阶段 6 补 App 级备份恢复持久化闭环：首次 SAVE_CONFIG 失败时仍显示原规则 / 设置并保留恢复对话框、展示错误；重试成功后保存规范化完整备份，关闭对话框并更新规则、全局开关和语言。Vue 3 组件套件 7 个文件 / 30 项测试、改动文件 ESLint / Prettier 通过。完成 264 / 334 项（79.0%）。
- 2026-09-26：阶段 6 记录 coverage scope / exclusions 及替代验证方式，说明 CI 报告位置、JavaScript 与 Vue 组件未计入 LCOV、生成类型和静态资源的验证路径；记录以行为 / 边界 / 故障回归为核心的测试质量策略及 mutation testing 的成本评估结论。现有 CI、测试隔离约定和独立浏览器自动化已满足对应计划项。完成 268 / 334 项（80.2%）。
- 2026-09-26：阶段 6 修复备份文件读取失败时静默拒绝并可能残留旧预览的问题：`File.text()` reject 后清空旧候选、禁用恢复 / 追加操作并显示本地化错误，用户粘贴有效内容后错误清除。Vue 3 组件套件 7 个文件 / 31 项测试、改动文件 ESLint / Prettier 通过。完成 269 / 335 项（80.3%）。
- 2026-09-26：阶段 6 补 App 级追加导入失败后重试回归，并修复 `BackupRestoreDialog` 漏声明 `import-rules` 导致 App 处理器不执行的缺陷。已有规则 ID 被跳过，同名不同 ID 标签重映射到现有标签；失败时保留旧设置 / 禁用 origin / 规则，重试后只保存追加规则。Vue 3 组件套件 7 个文件 / 32 项测试、改动文件 ESLint / Prettier 通过。完成 270 / 336 项（80.4%）。
- 2026-09-26：阶段 6 审核并补齐规则匹配验收：现有 V3 URL / regex / method / priority 与 V2 ignore helper 测试完整；新增 legacy `redirectFetch` 逐规则 ignore 命中后将原 Request / init 透传给 native fetch 的集成回归。明确 V3 规则不承载 V2 ignore 列表。定向测试 5 项、改动文件 ESLint / Prettier 通过。完成 272 / 337 项（80.7%）。
- 2026-09-26：阶段 6 补 V3 Fetch 的 `Request + init` 覆盖：init method/body 参与匹配，并按 POST redirect 且保留请求 body；补 V3 XHR method mismatch：同 URL 的 GET 不命中 POST 替换规则，原生打开及响应保持不变。Fetch / XHR 定向测试 2 个文件 / 64 项通过，改动文件 ESLint / Prettier 通过。完成 276 / 339 项（81.4%）。
- 2026-09-26：阶段 6 根据现有 CI 证据完成扩展端到端测试验收：`extension:smoke` 在隔离持久化 Chromium profile 加载生产扩展，覆盖启停、规则编辑、Fetch / XHR 真实请求、面板与站点状态同步和 Service Worker 重启；CI 对该 smoke 已通过。品牌 Chrome / Edge Stable 另由 runtime smoke 验证，Playwright 扩展自动化使用配套 Chromium。完成 277 / 339 项（81.7%）。
- 2026-09-26：阶段 6 补齐自定义函数异步 / 失败场景：legacy interceptor Promise reject 返回配置 fallback 并标记 fail-open；真实扩展 smoke 使用 V3 sandbox `await Promise.resolve()` 函数，通过 Fetch 验证异步替换响应。定向函数测试 5 项、`pnpm build` 与 `pnpm extension:smoke` 通过，改动文件 ESLint / Prettier 通过。完成 280 / 341 项（82.1%）。
- 2026-09-26：在 macOS Chrome Stable 154.0.8037.58 加载已启用的本地生产扩展，使用 V3 面板创建 status `209` JSON 响应规则，确认真实页面 Fetch 和 XHR 都返回预期 status / body；完成后删除临时规则并关闭本地测试服务。扩展 API 权限未扩大。完成 281 / 342 项（82.2%）。
- GitHub 里程碑：[阶段 0](https://github.com/Nyakooo/ajax-proxy/milestone/1)、[阶段 1](https://github.com/Nyakooo/ajax-proxy/milestone/2)、[阶段 2](https://github.com/Nyakooo/ajax-proxy/milestone/3)、[阶段 3](https://github.com/Nyakooo/ajax-proxy/milestone/4)、[阶段 4](https://github.com/Nyakooo/ajax-proxy/milestone/5)、[阶段 5](https://github.com/Nyakooo/ajax-proxy/milestone/6)、[阶段 6](https://github.com/Nyakooo/ajax-proxy/milestone/7)、[阶段 7](https://github.com/Nyakooo/ajax-proxy/milestone/8)；已复现缺陷：[issue #56](https://github.com/Nyakooo/ajax-proxy/issues/56)。
