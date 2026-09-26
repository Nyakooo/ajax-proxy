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

### XHR 重定向将原生 `open()` 变成异步调用

- 状态：已修复并回归验证（2026-09-25）。
- 影响范围：`packages/proxy-lib/src/redirectXHR.ts`。
- 问题：包装函数声明为 `async`，使原生 `open()` 返回 Promise。调用方紧接着执行 `setRequestHeader()` 或 `send()` 时会早于底层 `open()`，同步 XHR 也因此失去原生调用语义。
- 修复：包装后的 `open()` 同步决策并转发原有 method、URL、async、username、password。静态规则和同步完成的 callback 函数立即生效。XHR 不能等待 Promise 或延迟 callback；这类函数会给出警告并同步使用原始 URL，避免延迟改写调用流程。Fetch 规则函数仍支持 Promise / 异步 callback。
- 验证：Vitest 覆盖同步返回、静态与 callback 重定向、`open(..., false)` 参数保留、紧随其后的请求头 / body 操作，以及 Promise 规则回退原 URL。

### 复用拦截 XHR 时沿用上一次响应缓存和命中锁

- 状态：已修复并回归验证（2026-09-25）。
- 影响范围：`packages/proxy-lib/src/createXHR.ts`。
- 问题：同一个 XHR 实例再次调用 `open()` 时，代理对象保留上一请求写入的 `responseText`、`response`、`status`、`statusText` 缓存和命中通知锁，可能让下一请求显示旧响应或漏记命中。
- 修复：每次 `open()` 时清除请求 body、响应覆写缓存并重置命中锁；底层 XHR 仍负责按原生语义清理请求头和响应状态。
- 验证：同一对象连续发送三次请求，中间关闭再开启拦截，确认第二次返回原响应、第三次重新覆写并分别统计命中；覆盖 response 函数抛错回退原响应且不发通知。

### 扩展启停时页面已有 Fetch / XHR 包装器被替换

- 状态：按共存策略修复并回归验证（2026-09-25）。
- 影响范围：`packages/proxy-lib/src/index.ts` 及 Fetch / XHR 模式包装器。
- 问题：每次开关或模式更新都无条件重置全局 Fetch / XHR 引用，可能移除页面在扩展之后安装的包装器；仅检查全局开关的包装器在外层页面包装保留后仍可能继续改写请求。
- 策略：保留注入前观察到的页面 Fetch 函数和 XHR 构造器，关闭时恢复原始引用。若更新时发现全局引用是未知的外层页面包装器，不覆盖它；内层代理按全局开关和当前模式返回原始请求 / 响应。关闭后同模式重新启用可恢复原链路。若外层包装器隐藏代理且模式发生变化，当前页面不强行重建链路，需重载页面。
- 验证：Vitest 覆盖注入前包装器在拦截 / 重定向 / 关闭后的调用和恢复、扩展外层页面包装器在关闭后仍保留，以及同模式重新启用后 Fetch / XHR 重定向恢复。
- 互操作边界：回归仅验证页面自身包装器与代理的先后安装 / 启停组合，不承诺兼容任意第三方扩展。其他扩展的注入顺序、运行环境和包装方式各异，无法由通用 CI 稳定代表；若外层包装器隐藏了代理，切换模式后需重载页面。

## 尚待复现的代码审查线索

目前没有待复现的代码审查线索。

## 已验证的 XHR 通用事件监听转发

- 状态：已修复并回归验证（2026-09-25）。
- 影响范围：`packages/proxy-lib/src/createXHR.ts`。
- 问题：请求由内部原生 XHR 执行，`CustomXHR` 继承对象上的 `addEventListener()` 却没有收到内部请求的 `readystatechange`、`load`、`progress` 等事件；若直接把原监听器挂到内部 XHR，回调的 `this` / `target` 会暴露内部实例。
- 修复：将内部 `readystatechange` 和 `loadstart`、`progress`、`abort`、`error`、`load`、`timeout`、`loadend` 事件转发到调用方的 `CustomXHR` 对象；在 readyState 4 上先完成响应处理，再转发对应状态事件和后续终态事件。原生 `EventTarget` 在代理对象上管理监听器，保留注册 / 移除、`once` 和监听器顺序语义。`ProgressEvent` 的 `loaded`、`total` 和 `lengthComputable` 会复制到转发事件。
- 验证：Vitest 覆盖 `this` / `target`、属性处理器与通用监听器顺序、`loadstart` / `readystatechange` / `progress` / `load` / `loadend` 转发、监听器移除及 `once`。真实扩展 Chromium smoke 对实际响应检查 `this`、`target`、`currentTarget`，并确认 readyState 通知早于 `load`。
- 边界：转发事件是合成事件，其 `isTrusted` 为 `false`；XHR `upload` 对象仍由底层原生 XHR 直接提供。本实现不把页面传入的监听器转发给扩展上下文。

## 已验证的存储更新一致性

- 状态：扩展上下文与普通网页存储均已实现并回归验证（2026-09-25）。
- 影响范围：`packages/shared-utils/src/storage.ts`、`packages/shell-chrome/src/content.ts`、`packages/shell-chrome/src/service-worker/index.ts`。
- 策略：各扩展上下文监听 `chrome.storage.onChanged` 更新本地缓存；每个标签页 content script 使用同一缓存快照通知页面代理。service worker 不再通过仅保存最近一个 content port 的方式同步规则。普通网页初始化 localStorage 缓存，并监听跨标签 `storage` 事件，两种环境共用同步缓存访问方式。
- 验证：storage 测试覆盖扩展与普通网页存储变更、读写、删除、清空、忽略其他 storage area、初始化期间竞态、初始化失败和配额写入失败。双标签页扩展 smoke 在面板更新规则后确认两个页面都应用 Fetch / XHR 拦截和 Fetch 重定向。
- 错误处理：扩展存储操作检查 `chrome.runtime.lastError`；写操作成功后才更新缓存，失败保留原缓存并派发 `ajax-proxy:storage-error`，面板显示初始化或保存错误。普通网页 localStorage 初始化和读写异常采用同一 Promise 拒绝与错误报告机制。

## 技术债与待决语义

- 用户函数通过 `window.eval` 执行；错误隔离、超时、未调用 `next` 和安全边界仍需阶段 3 评估。
- 组合重定向 / 响应替换与失败回退以 `docs/V3-RULE-MODEL.zh.md` 为设计稿，仍需后续原型与测试确认。
- V3 不提供 V2 配置、规则和备份迁移；导入器已识别并明确告知不兼容，用户需在 V3 中重新配置规则。使用说明见 `docs/V3-BACKUP-RESTORE.zh.md`。
- 页面外层包装器隐藏代理时，切换拦截 / 重定向模式需要重载页面，才能重新挂载对应模式。

## 后续动作

- 阶段 2 为已复现缺陷及高优先级审查线索建立可追踪任务，按先复现、再定语义、再修复和回归保护的顺序处理。
- 问题解决后更新状态、验证步骤和对应测试；未确认线索继续保留为待验证，不改写为已修复缺陷。
