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

## 尚待复现的代码审查线索

| 线索                                               | 位置                                    | 可能影响                                       | 验证安排                                           |
| -------------------------------------------------- | --------------------------------------- | ---------------------------------------------- | -------------------------------------------------- |
| 多条拦截规则可能覆盖先前响应并重复通知             | `packages/proxy-lib/src/createFetch.ts` | 最终响应与命中统计可能偏离用户预期             | 两条可区分命中规则并核对 body、status、通知次数    |
| 空 body 状态码可能和新 Response body 冲突          | `packages/proxy-lib/src/createFetch.ts` | 204 / 304 等响应可能构造失败                   | 复现 204、304、HEAD 与状态码 / body 组合           |
| XHR `open()` 包装可能改变同步调用语义              | `packages/proxy-lib/src/createXHR.ts`   | 同步 XHR 和原生事件顺序变化                    | 对照同步 / 异步请求、重复 open、headers 和事件时序 |
| storage 可能缺少跨上下文变更同步及统一写入错误处理 | `packages/shared-utils/src/storage.ts`  | 面板、标签页和 service worker 的设置暂时不一致 | 多上下文写入、读取及拒绝场景验证                   |

## 技术债与待决语义

- 用户函数通过 `window.eval` 执行；错误隔离、超时、未调用 `next` 和安全边界仍需阶段 3 评估。
- 多规则优先级、组合重定向 / 响应替换、失败回退以 `docs/V3-RULE-MODEL.zh.md` 为设计稿，最终语义需原型与测试确认。
- V3 不提供 V2 配置、规则和备份迁移；导入器需识别并明确告知不兼容。

## 后续动作

- 阶段 2 为已复现缺陷及高优先级审查线索建立可追踪任务，按先复现、再定语义、再修复和回归保护的顺序处理。
- 问题解决后更新状态、验证步骤和对应测试；未确认线索继续保留为待验证，不改写为已修复缺陷。
