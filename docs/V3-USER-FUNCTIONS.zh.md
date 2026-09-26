# Ajax Proxy V3 自定义函数能力与安全边界

状态：V3 Fetch 函数响应已接入隔离 sandbox、编辑面板和逐次失败诊断；备份恢复界面会提示含函数代码的规则数量，并确保导入后保持停用。

## 当前 V2 行为与风险

V2 的响应覆写和重定向函数都通过 `window.eval()` 在网页主世界执行。函数能使用当前页面的 DOM、全局对象和网络能力，也可能读取页面中其他脚本暴露的数据或改变页面状态。输入的 `req` / `res` 参数限制不了这些额外能力，因此只能运行自己编写或完全信任的代码。

当前执行器在异步 Promise / callback 路径上最多等 5 秒，失败后按 fail-open 回退原请求或原响应；`eval()` 内同步死循环会先阻塞页面线程，5 秒计时器不能中断它。V2 面板目前也未明确提示此风险。这些行为记录为 V2 现状，不能作为 V3 安全承诺。

## V3 第一版函数合同

- 保留受限的响应计算函数，供必须按请求 / 原响应内容动态生成 replacement 的规则使用；静态 JSON 替换优先，不提供任意页面脚本扩展点。
- 函数输入是经过复制和结构校验的 request / response 数据快照；返回值只允许 schema 中定义的 JSON body、状态码和 headers。函数可以同步返回或返回 Promise，不使用 callback。
- 函数不能读取网页 DOM / 全局对象、扩展 storage、`chrome.*` API，也不能发起网络请求或加载外部代码。函数代码按不可信输入处理，即使来自用户本人的备份也不默认执行。
- 在扩展的 sandboxed unique-origin iframe 中运行；sandbox 内用专属 worker 执行动态代码。sandbox 仅通过结构化消息收发 action 输入与结果，不设置 `allow-same-origin`，不授予扩展 API，并以 CSP 阻止网络连接、外部脚本和页面导航。Chrome 官方文档建议用 sandbox iframe 将 `eval()` 与扩展高权限环境隔离，并通过消息交换数据。
- 每次执行最多 5 秒；达到期限时终止 worker 并销毁 sandbox，确保同步死循环也能被中断。对单规则和全扩展的并发执行数设上限，避免函数堆积占满资源。
- 第一版只接入 Fetch；XHR 的同步响应读取接口不能等待 sandbox，函数规则命中 XHR 时保持浏览器原响应。
- 只将文本、JSON、XML 和表单请求/响应快照交给函数；单侧快照最多 512 KiB，总快照最多 1 MiB。二进制、无法按 UTF-8 解码或超限的内容保持原响应。
- 返回值只允许非空 `{ body?, status?, headers? }`，状态码为 200–599，结果最大 1 MiB。语法错误、拒绝、超时、无效结果和 sandbox 通信失败均 fail-open。失败不得静默改写响应，也不得让下一条规则接管该请求。
- 含函数代码的规则默认关闭执行；启用前显示一次明确风险说明。导入备份时先标出带代码的规则及数量，不执行代码；用户确认恢复后仍保持这类规则停用，需单独启用。

### 可复制的响应函数示例

在响应函数编辑器中粘贴下面的函数体代码（不要再包一层函数声明）。它读取 request / response 快照，将 JSON 响应中的 `items` 数组数量写入 `meta.itemCount`，并为响应添加一个标记 header：

```js
const payload = JSON.parse(response.body)
const data = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}
const items = Array.isArray(data.items) ? data.items : []

return {
  status: response.status,
  headers: {
    'x-ajax-proxy': 'v3-function',
  },
  body: {
    ...data,
    meta: {
      ...(data.meta && typeof data.meta === 'object' && !Array.isArray(data.meta) ? data.meta : {}),
      itemCount: items.length,
      requestMethod: request.method,
    },
  },
}
```

输入快照的字段为 `request.url`、`request.method`、可选的文本 `request.body`，以及 `response.status`、`response.statusText`、`response.headers` 和文本 `response.body`。JSON 响应的 `response.body` 仍是字符串，因此示例先用 `JSON.parse` 解析；如果响应不是有效 JSON，解析错误会触发 fail-open，浏览器会收到原始响应。

函数可同步返回，也可返回 Promise。结果必须是非空对象，只能包含 `body`、`status`、`headers`：`body` 仅允许 JSON 值，`status`（如果提供）必须为 200–599 的整数，`headers`（如果提供）必须是安全的 HTTP header 名和值。不要返回 `undefined`，也不要添加其他字段；无效结果会 fail-open。`body`、状态码和 headers 都可选，但至少需要返回其中一项。

响应函数仅作用于 Fetch；XHR 保留原生响应。函数只能处理传入的快照，不能访问 DOM、页面全局对象或 `chrome.*`，也不能调用 `fetch`、发起其他网络请求或加载外部代码。每次执行最多 5 秒；抛错、Promise 拒绝、无效结果、超时或隔离环境故障都会 fail-open，使用原始响应。请求或响应不支持文本快照或超过大小限制时，同样使用原始响应。

V3 domain 解析器会为每条导入函数规则返回警告路径，并停用其 response action。备份恢复界面汇总显示函数规则数量，要求用户确认后才执行恢复；恢复后的函数响应仍保持停用，必须逐条明确启用。

## 面板风险提示文案

**中文：**自定义函数会读取请求与响应数据。仅运行可信代码；函数无法访问网页内容或发起网络请求。函数最长运行 5 秒，超时会终止并使用原始响应。

**English:** Custom functions can read request and response data. Run trusted code only. Functions cannot access page content or make network requests. A function runs for at most 5 seconds; on timeout it is stopped and the original response is used.

## 验收要求

验证 sandbox 无法读取页面全局变量、DOM、扩展 API 或执行网络请求；确认结构化输入 / 输出可用；覆盖同步返回、Promise 返回、异常、超时、同步死循环终止、错误结果、并发上限和 sandbox 重建；导入含代码规则时确认代码没有自动运行且规则保持停用。扩展级 smoke 需同时验证面板保存、Fetch 动态结果、XHR 原响应和运行失败 fail-open。Chrome Stable 和 Edge Stable 都执行隔离 smoke。

当前已验证：Chrome for Testing 154.0.8037.57 与 Edge Stable 153.0.4234.48 的 sandbox 隔离、网络阻断、四并发上限及 worker 超时；Chrome 和 Edge 函数 runtime smoke 验证动态响应、无效结果和同步死循环诊断、fail-open 及 sandbox 重建；Chrome 扩展 smoke 覆盖面板保存、Fetch/XHR 行为、函数规则备份恢复提示及 service worker 重启。Chrome Stable 品牌浏览器上的扩展 smoke 仍需单独完成验收。

参考：[Chrome：在 sandboxed iframe 中使用 eval](https://developer.chrome.com/docs/extensions/how-to/security/sandboxing-eval)、[Chrome：content script 执行世界](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)。
