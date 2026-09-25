# Ajax Proxy V3 浏览器兼容策略

## 支持范围

- 首发目标浏览器：Chrome 与 Microsoft Edge 稳定正式版。
- 不承诺 Beta、Dev、Canary 等预览版本兼容。
- 初始兼容窗口覆盖发布时点往前最近 12 个月内的稳定版；依据现有 API 盘点，V3 初始最低主版本锁定为 Chrome 141 与 Edge 140。Vue 面板的 Babel / PostCSS 生产目标已设为 Chrome 141+ / Edge 140+；TypeScript 与 Vite 输出语法目标已设为 ES2022。编辑器库保留较旧的保守 Babel 目标，避免 Vue CLI 库模式生成无法解析的 CSS。2026-09-25 的 Node 24.21.0 clean build、类型检查通过。Chrome Stable / Edge Stable 基础运行时 smoke test 已加入 CI；当前 Stable 手动扩展 smoke 已确认 Fetch / XHR 响应拦截成功。Chrome 141 与 Edge 140 最低版本扩展 smoke 均已通过 CI（run 36106005756）。JS Web API / CSS 特性由真实浏览器 smoke 覆盖常用能力，未另设静态扫描器。任何验证发现更高的核心能力下限时，再修订版本并记录依据。
- 每季度复核一次支持窗口。停止支持某个版本前，应提前通过发行说明和项目支持文档公告，并说明生效版本。
- 低于公布最低版本的浏览器不阻塞发布。非核心增强使用能力检测并提供降级行为；核心能力不依赖实验性或刚推出、尚未进入稳定版本的 API。

## 最低版本盘点

仓库当前 Manifest 和调用点涉及：Manifest V3 service worker、`action`、`commands`、`content_scripts`、`storage`、`notifications`、`tabs`、`runtime` 消息和网页资源暴露；未发现 `scripting`、`webRequest` 或 `declarativeNetRequest` 调用。Chrome 官方文档列出 `action` API 自 Chrome 88 / MV3 起可用；这些核心扩展能力远早于拟定的 12 个月窗口。Edge 官方文档提供支持 API 清单，并提醒 Chromium 浏览器间可能存在 API 差异，因此最低版本还要在 Edge 实际加载与关键流程中确认。

按“最近 12 个月发布的稳定版”计算，初始最低支持主版本锁定为 Chrome 141（2025-09-30 首次稳定发布）和 Edge 140（2025-09-25 稳定发布）。当前 API 盘点没有发现高于此窗口的核心版本要求。CI 固定版本矩阵使用 Chrome for Testing 141.0.7390.122 和 Microsoft Edge 140.0.3485.94。2026-09-25 在 macOS arm64 安装 Chrome for Testing 141.0.7390.122 后，当前构建的网页运行时 smoke 和扩展 Fetch / XHR / iframe / redirect / service worker 重启 smoke 均通过；CI run 36106005756 已通过 Chrome 141 与 Edge 140 的运行时和扩展 smoke。本机 Edge 最低版本下载脚本只支持 Linux x64，因此品牌 Edge 140 验证由 CI 完成。当前稳定版会持续变化，CI 另安装 Chrome Stable 与 Edge Stable 并运行基础网页运行时 smoke test。

版本依据：[Chrome 141 稳定版公告](https://chromereleases.googleblog.com/2025/09/stable-channel-update-for-desktop_30.html)、[Edge 140 稳定版公告](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-relnote-archive-stable-channel)。2026-09-25 本机验证版本为 Chrome Stable 154.0.8037.58 与 Edge Stable 153.0.4234.48；Microsoft 的 Edge 153 稳定版公告显示主版本于 2026-09-10 发布，153.0.4234.48 于 2026-09-18 更新。Stable 扩展回归中，Edge 153 的自动化 smoke 通过；Chrome 154 通过 `chrome://extensions` 手动加载本地构建，并验证 `/api/(echo|items)$` 正则可拦截 Fetch / XHR，`/api/nope` 未命中并回源。Playwright 当前要求扩展自动化使用其附带的 Chromium，因为 Chrome / Edge Stable 已移除侧载所需的命令行参数；本项目 `extension:smoke` 使用附带 Chromium。支持矩阵的 `current` 项应跟随最新稳定版而不是写死某个版本号。

逐项记录 API 依据和实际验证：

| 能力 / API                                                                   | Chrome 首次稳定支持版本             | Edge 首次稳定支持版本         | 是否核心                      | 降级行为                          | 依据 / 验证                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------- | ----------------------------------- | ----------------------------- | ----------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `action`、Manifest V3 service worker                                         | Chrome 88+（`action` 官方最低版本） | Edge API 清单包含 `action`    | 是                            | 不适用                            | Chrome [action API](https://developer.chrome.com/docs/extensions/reference/api/action)，Edge [支持 API](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/api-support)            |
| `commands`、`content_scripts`、`runtime`、`storage`、`notifications`、`tabs` | Chrome 141+（本次最低支持版本）     | Edge 140+（本次最低支持版本） | 是                            | 不适用                            | API 盘点完成；固定版本运行时 smoke 已配置到 CI                                                                                                                                                              |
| Fetch / Request / Response 能力                                              | Chrome 141+（本次最低支持版本）     | Edge 140+（本次最低支持版本） | 是                            | 不适用                            | Stable 手动扩展 smoke 和 Chrome 141 / Edge 140 最低版本扩展 smoke 均通过（CI run 36106005756）                                                                                                              |
| XHR 拦截所需能力                                                             | Chrome 141+（本次最低支持版本）     | Edge 140+（本次最低支持版本） | 是                            | 不适用                            | Stable 手动扩展 smoke 和 Chrome 141 / Edge 140 最低版本扩展 smoke 均通过（CI run 36106005756）；同步语义在阶段 2 验收                                                                                       |
| JavaScript 语法 / Web API                                                    | Chrome 141+（本次最低支持版本）     | Edge 140+（本次最低支持版本） | 按功能确定                    | 能力检测或不启用非核心功能        | Vue 面板 Babel 目标设为 Chrome 141+ / Edge 140+；TypeScript / Vite 使用 ES2022。Chrome 141 / Edge 140 与当前 Stable 运行时 smoke 通过（CI run 36106005756）                                                 |
| Fetch / Request / Response、XHR、URL、Headers、TextEncoder                   | Chrome 141+（本次最低支持版本）     | Edge 140+（本次最低支持版本） | 是                            | 不适用                            | Chrome 141、Edge 140 和 Chrome / Edge Stable 网页运行时 smoke；Chrome 141 与 Edge 140 扩展 Fetch / XHR 集成 smoke 均通过（CI run 36106005756）                                                              |
| `crypto.randomUUID()`                                                        | 运行时能力检测                      | 运行时能力检测                | 否                            | 方法不可用时以时间和随机值生成 ID | 源码先检查 `crypto.randomUUID` 是否存在，再选择 fallback；不构成高于最低版本的要求                                                                                                                          |
| CSS Grid、`prefers-reduced-motion`                                           | Chrome 141+（本次最低支持版本）     | Edge 140+（本次最低支持版本） | Grid 为核心布局；动效为非核心 | 动效关闭或显示静态提示            | 面板 PostCSS / Autoprefixer 目标为 Chrome 141+ / Edge 140+；runtime smoke 验证 `CSS.supports('display: grid')` 和 reduced-motion 查询可读。边缘命中提示留待阶段 4，并须验证 reduce / no-preference 两种状态 |

最低版本由所有核心能力在 Chrome 与 Edge 上均有稳定支持的交集确定，并结合最近 12 个月窗口复核。源码审查未发现 `Vue.compile` 等动态模板编译，也未发现高于基准的新 CSS 特性；`Object.hasOwn` 目前只在 Node 边界检查脚本中使用，不进入扩展。若两浏览器版本节奏造成编号不一致，应分别记录浏览器最低版本，不能假设相同版本号代表相同兼容能力。

## CI 与发布检查

- CI 浏览器矩阵执行 Chrome Stable 与 Edge Stable 的真实浏览器运行时 smoke，核验 Fetch / Request、XHR、基础 CSS 和 `prefers-reduced-motion`；另运行 Chrome 141 for Testing 与 Microsoft Edge 140 的运行时和扩展 Fetch / XHR smoke。CI run 36106005756 的全部 browser-smoke、minimum-browser-smoke 与 build job 均通过。
- 扩展 API 和 CSS 的新增用法在合并前检查最低版本支持情况；非核心 API 要有能力检测和降级路径。
- 发布检查核对本文件的最低版本、CI 矩阵与发行说明，停止支持版本须已提前公告。
- 当前 CI 执行固定 Node / pnpm 的冻结安装、全包 lint / 格式基线检查、TypeScript 检查、单元测试 / 覆盖率、生产构建、声明一致性、ZIP 打包和体积报告；浏览器矩阵包括 Chrome Stable / Edge Stable 及固定的 Chrome 141 / Edge 140 最低版本。CI run 36106005756 的最低版本扩展 smoke 和 build job 全部通过。
