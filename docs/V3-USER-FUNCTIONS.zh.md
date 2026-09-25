# Ajax Proxy V3 自定义函数能力与安全边界

状态：阶段 3 执行环境与风险要求已确定；sandbox 原型、面板提示和导入确认仍是后续实施项。

## 当前 V2 行为与风险

V2 的响应覆写和重定向函数都通过 `window.eval()` 在网页主世界执行。函数能使用当前页面的 DOM、全局对象和网络能力，也可能读取页面中其他脚本暴露的数据或改变页面状态。输入的 `req` / `res` 参数限制不了这些额外能力，因此只能运行自己编写或完全信任的代码。

当前执行器在异步 Promise / callback 路径上最多等 5 秒，失败后按 fail-open 回退原请求或原响应；`eval()` 内同步死循环会先阻塞页面线程，5 秒计时器不能中断它。V2 面板目前也未明确提示此风险。这些行为记录为 V2 现状，不能作为 V3 安全承诺。

## V3 第一版函数合同

- 保留受限的响应计算函数，供必须按请求 / 原响应内容动态生成 replacement 的规则使用；静态 JSON 替换优先，不提供任意页面脚本扩展点。
- 函数输入是经过复制和结构校验的 request / response 数据快照；返回值只允许 schema 中定义的 JSON body、状态码和 headers。函数可以同步返回或返回 Promise，不使用 callback。
- 函数不能读取网页 DOM / 全局对象、扩展 storage、`chrome.*` API，也不能发起网络请求或加载外部代码。函数代码按不可信输入处理，即使来自用户本人的备份也不默认执行。
- 在扩展的 sandboxed unique-origin iframe 中运行；sandbox 内用专属 worker 执行动态代码。sandbox 仅通过结构化消息收发 action 输入与结果，不设置 `allow-same-origin`，不授予扩展 API，并以 CSP 阻止网络连接、外部脚本和页面导航。Chrome 官方文档建议用 sandbox iframe 将 `eval()` 与扩展高权限环境隔离，并通过消息交换数据。
- 每次执行最多 5 秒；达到期限时终止 worker 并销毁 sandbox，确保同步死循环也能被中断。对单规则和全扩展的并发执行数设上限，避免函数堆积占满资源。
- 语法错误、拒绝、超时、无效结果和 sandbox 通信失败均以可诊断错误结束并 fail-open。失败不得静默计为成功命中，也不得让下一条规则接管该请求。
- 含函数代码的规则默认关闭执行；启用前显示一次明确风险说明。导入备份时先标出带代码的规则及数量，不执行代码；用户确认恢复后仍保持这类规则停用，需单独启用。

## 面板风险提示文案

**中文：**自定义函数会读取请求与响应数据。仅运行可信代码；函数无法访问网页内容或发起网络请求。函数最长运行 5 秒，超时会终止并使用原始响应。

**English:** Custom functions can read request and response data. Run trusted code only. Functions cannot access page content or make network requests. A function runs for at most 5 seconds; on timeout it is stopped and the original response is used.

## 验收要求

验证 sandbox 无法读取页面全局变量、DOM、扩展 API 或执行网络请求；确认结构化输入 / 输出可用；覆盖同步返回、Promise 返回、异常、超时、同步死循环终止、错误结果、并发上限和 sandbox 重建；导入含代码规则时确认代码没有自动运行且规则保持停用。Chrome Stable 和 Edge Stable 都执行隔离、超时与 fail-open smoke。

参考：[Chrome：在 sandboxed iframe 中使用 eval](https://developer.chrome.com/docs/extensions/how-to/security/sandboxing-eval)、[Chrome：content script 执行世界](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)。
