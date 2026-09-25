# V3 重构问题与风险登记

本文件区分已复现缺陷、尚待复现的代码审查线索、技术债和产品语义决策。已复现表示有可重复步骤和观察结果；代码审查线索不应当作已确认用户影响。

## 已复现缺陷

### 拦截器模式下 Fetch 从 `Request` 读取 method 时规则不匹配

- 状态：已修复并回归验证（2026-09-25）。
- 影响范围：`packages/proxy-lib/src/createFetch.ts` 的拦截规则 method / URL 匹配、通知 method 和函数响应上下文。
- 复现日期：2026-09-25；以 Vitest 临时复现用例调用实际 `CustomFetch`，随后删除临时用例，避免把当前错误行为保留为产品断言。
- 步骤：将 `window.fetch` stub 为返回 `url=https://example.test/api`、body 为 `original` 的 Response；配置全局拦截开启及一条 `{ match_url: '/api', method: 'POST', override: 'intercepted' }` 规则；调用 `CustomFetch(new Request('https://example.test/api', { method: 'POST' }))`，不传第二个 `init` 参数。
- 原实际结果：返回 body 为 `original`，POST 规则未应用。实现只从 `init.method` 读取 method，因此把 Request 自身的 POST 当作 `ANY`；并以响应 URL 而非 Request URL 做规则匹配。
- 修复：以 `init.method` 优先，其次读取 `Request.method`，没有显式 method 时按 Fetch 默认 GET 处理；Request 输入用 `Request.url` 匹配，并将同一 URL / method 传给通知和函数响应上下文。
- 持久化回归覆盖：`Request` 自带 POST、不带 `init`；`init.method` 覆盖 Request method；缺省 GET；响应 URL 与 Request URL 不同时仍按原请求 URL 匹配。`pnpm test` 与 Chrome 141 的 `pnpm extension:smoke` 均通过。
- 边界：本条只记录拦截器模式的修复；重定向模式的 Request 输入另见下方已验证项。
- 跟踪任务：[GitHub issue #56](https://github.com/Nyakooo/ajax-proxy/issues/56)，归入[阶段 2 里程碑](https://github.com/Nyakooo/ajax-proxy/milestone/3)。

### 重定向模式下 Fetch 转发 `Request` 的 URL、method 和请求属性

- 状态：已修复并回归验证（2026-09-25）。
- 影响范围：`packages/proxy-lib/src/redirectFetch.ts`。
- 复现：配置 POST 重定向规则后调用 `fetch(new Request(url, { method: 'POST', body }))`；另覆盖 `fetch(request, init)` 的 method / body 覆盖情况。
- 原因与修复：旧实现依赖 `init` 提取 method 和 URL，无法正确处理仅传入 `Request` 的调用。现在先构造有效 Request 并据此匹配 URL / method；method 不匹配的规则继续查找。命中后按原 Request 属性重建目标 Request，并保留 headers、body、credentials、mode、cache、redirect、referrer、referrerPolicy、integrity、keepalive 和 signal。
- 验证：3 项 Vitest 回归用例通过；生产扩展 E2E 在 Chrome for Testing 中通过面板建立 POST 规则，由目标服务验证 URL、method、body、原始 header、自定义 header 和 cookie。

### 自定义规则函数的异步完成与失败回退

- 状态：已修复并回归验证（2026-09-25）。
- 影响范围：`packages/proxy-lib/src/overrideFunc.ts`、`packages/proxy-lib/src/redirectUrlFunc.ts` 及 Fetch、XHR 请求处理器。
- 问题：旧执行器只检查代码文本是否含有 `next(`，并在调用函数后立即 resolve 原始值；异步 callback 结果可能被提前丢弃，Promise 结果也不受支持。未调用 callback 的场景没有明确等待上限。
- 行为：保留 callback 用法并支持函数直接返回值或 Promise；首次有效完成生效，异步等待最多 5 秒。解析错误、同步异常、Promise 拒绝、无效结果和超时均返回未应用状态。响应拦截回退原响应且不触发命中通知；Fetch 重定向回退原始请求。XHR 共用执行器并在函数失败时保留原生响应 / 请求流程。
- 验证：Vitest 覆盖异步 callback、Promise 结果、未完成 callback 超时、同步异常，以及 Fetch 响应和重定向请求的失败回退。
- 限制：5 秒超时无法中断用户函数中的同步死循环；这需要隔离执行环境另行解决。

### Fetch 响应替换的 body、状态码与原始元数据

- 状态：已修复并回归验证（2026-09-25）。
- 影响范围：`packages/proxy-lib/src/createFetch.ts`。
- 问题：替换响应时总是创建非空 ReadableStream，导致 204、205、304 的 `Response` 构造抛错；HEAD 仍带替换 body；非法状态码也会使整个 Fetch reject。旧 `Content-Length` / `Content-Encoding` 可能不再匹配替换后的 body，且新建 Response 会丢失原始 `url`、`redirected` 和 `type`。
- 修复：HEAD 与 204 / 205 / 304 使用 null body；响应状态码无效时直接返回原始响应；复制 headers 后清除 `Content-Length`、`Content-Encoding`、`Content-Range` 和 `Transfer-Encoding`；代理对象从原始响应读取 `url`、`redirected`、`type`，其余属性和方法指向替换响应。
- 验证：覆盖 204、205、304、HEAD、非法状态码、保留其他 headers、清除失效 headers 和原始元数据。扩展 smoke 的真实 Fetch 响应还检查 `url`、`redirected`、`type` 和 Content-Length 清理。

### 拦截规则优先级与命中统计不一致

- 状态：已修复并回归验证（2026-09-25）。
- 影响范围：`packages/proxy-lib/src/createFetch.ts`、`packages/proxy-lib/src/createXHR.ts`、`packages/proxy-lib/src/redirectXHR.ts` 和 `packages/shell-chrome/src/service-worker/badge.ts`。
- 问题：Fetch / XHR 拦截遍历并应用所有命中规则，后面的响应覆盖前面结果；通知仅含 URL 和 method，徽章会把同 URL / method 的多条规则都记为命中。重定向 XHR 遇到 method 不匹配的首条规则则直接中止，没有继续检查后续规则。
- 决策与修复：统一采用列表顺序中的第一条启用且 URL / method 匹配的规则。拦截器在首条命中后停止；重定向 XHR 对 method 不匹配使用 continue。规则通知附带当前序号，徽章仅更新选中的行；不带序号的旧通知仍保留原匹配方式。
- 验证：Vitest 覆盖 Fetch / XHR 两类拦截的首条规则选择、唯一通知和准确序号；徽章测试使用两条相同 URL / method 的规则确认只递增指定项；重定向 XHR 测试确认 method mismatch 后命中下一条规则。

## 尚待复现的代码审查线索

| 线索                                               | 位置                                   | 可能影响                                       | 验证安排                                           |
| -------------------------------------------------- | -------------------------------------- | ---------------------------------------------- | -------------------------------------------------- |
| XHR `open()` 包装可能改变同步调用语义              | `packages/proxy-lib/src/createXHR.ts`  | 同步 XHR 和原生事件顺序变化                    | 对照同步 / 异步请求、重复 open、headers 和事件时序 |
| storage 可能缺少跨上下文变更同步及统一写入错误处理 | `packages/shared-utils/src/storage.ts` | 面板、标签页和 service worker 的设置暂时不一致 | 多上下文写入、读取及拒绝场景验证                   |

## 技术债与待决语义

- 用户函数通过 `window.eval` 执行；错误隔离、超时、未调用 `next` 和安全边界仍需阶段 3 评估。
- 组合重定向 / 响应替换与失败回退以 `docs/V3-RULE-MODEL.zh.md` 为设计稿，仍需后续原型与测试确认。
- V3 不提供 V2 配置、规则和备份迁移；导入器需识别并明确告知不兼容。

## 后续动作

- 阶段 2 为已复现缺陷及高优先级审查线索建立可追踪任务，按先复现、再定语义、再修复和回归保护的顺序处理。
- 问题解决后更新状态、验证步骤和对应测试；未确认线索继续保留为待验证，不改写为已修复缺陷。
