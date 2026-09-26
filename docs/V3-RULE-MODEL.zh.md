# Ajax Proxy V3 组合式规则设计

状态：阶段 2 执行语义已定稿；Fetch / XHR 的运行时能力边界仍需通过原型验证后确认。

## 目标

一条规则可以独立启用请求重定向、响应拦截 / 替换，或同时启用两者。用户可以只维护一条规则，描述同一请求从发起到收到响应的完整处理。

## 建议的数据模型

```ts
interface Rule {
  id: string
  enabled: boolean
  match: RequestMatcher
  request?: {
    enabled: boolean
    redirect: RedirectConfig
  }
  response?: {
    enabled: boolean
    replace: ResponseConfig
  }
}
```

- `match` 只匹配原始请求。本阶段仅定义 URL 与 method：`normal` 是原始 URL 的区分大小写子串匹配，`regex` 使用不区分大小写的 RE2；method 按大写后的 HTTP token 精确匹配，未填写或填写 `ANY` 表示任意 method。headers 等条件不属于当前 schema。
- 下一 matcher 切片计划加入 `exact`：将原始请求 URL 字符串与规则 URL 区分大小写地完整比较，不额外规范化、拆分或忽略 query 参数；method 语义不变。现有 `normal` 子串和 `regex` 语义保持不变，缺省 `type` 仍表示 `normal`。请求 header 条件和忽略列表不属于该切片。
- `request` 和 `response` 是独立能力；至少开启一项的规则才参与匹配。
- 列表顺序就是规则优先级，界面允许调整顺序。第一条满足规则级 `enabled`、至少一个 action 的 `enabled`，且 URL / method 全部匹配的规则负责请求。两种 action 均关闭的规则仍可保存（例如函数代码导入时自动停用 response action），但运行时将其视为不参与匹配。选中后锁定稳定的规则 ID；action 失败也不会把请求交给后续规则。
- schema 需要格式版本、严格校验和可读错误；不读取或转换 V2 字段。

执行策略：一个请求只选中一条规则；该规则中 request、response action 可独立启用，也可同时启用。请求在网络发送前只执行一次 request action；响应到达后只执行同一规则的 response action。规则命中统计在选中规则时增加一次，不按 action 数重复增加；重定向和响应替换的结果作为 action 诊断记录。匹配器自身异常时跳过该规则并继续列表；action 失败按 fail-open 返回原请求 / 原响应，不继续尝试后续规则。重定向后的 URL 不重新匹配，网络请求也不自动重试。

## 规则列表的导入、更新与清空

- V3 备份是完整快照。合法备份必须包含规则列表；空数组是有效值，导入 `rules: []` 会把当前规则替换为空列表。字段缺失、`null` 或非数组均视为格式错误，拒绝导入，不解释为清空或忽略。
- 更新规则集合采用整体替换语义。传入非空数组替换原列表，传入空数组明确清空；单条新增、编辑、删除由规则 ID 对应的操作更新列表，删除最后一条后的空列表与显式清空结果相同。
- 面板提供明确的清空操作并在清空非空列表前要求确认。恢复备份会显示待替换的规则数；即使备份中的列表为空，也按完整快照替换并提示将移除现有规则。对已空列表执行清空是无副作用的幂等操作。
- 空规则备份仍可导出，包含格式版本及其他配置，不因列表为空而拒绝备份。导入校验通过后一次性替换备份所包含的全部配置，避免只应用非空列表导致设置混合新旧数据。
- V2 当前导入会忽略空规则数组且不能清空已有规则；这只是 V2 行为。V3 不兼容 V2 格式，也不沿用该隐式语义。

实现验收时需覆盖：空规则导入清除旧列表、缺失 / `null` / 错类型字段被拒绝、完整替换不会残留旧设置、空备份可导出、清空最后一条规则与显式清空等价，以及重复清空安全。

具体 matcher 和 action 字段应在 Fetch / XHR 能力盘点后再定，避免在模型中承诺浏览器无法一致实现的字段。

## V3 备份格式与基础校验

V3 备份使用独立标识，不通过字段猜测把旧文件转换成新格式：

```json
{
  "format": "ajax-proxy-backup",
  "formatVersion": 3,
  "settings": {
    "globalEnabled": true,
    "mode": "interceptor",
    "language": "zh-CN"
  },
  "tags": [],
  "rules": []
}
```

- 顶层必须且只能包含 `format`、`formatVersion`、`settings`、`tags`、`rules`。格式标识固定为 `ajax-proxy-backup`，版本固定为整数 `3`；未知格式 / 版本拒绝，检测到 V2 字段时返回明确的不兼容提示。
- `settings` 必须包含布尔值 `globalEnabled`、`interceptor` / `redirector` 模式和 `zh-CN` / `en` 语言。未知字段拒绝，避免输入拼错后被静默忽略。
- `tags` 必须是数组；每个 tag 包含唯一非空字符串 `id`、非空 `name` 和布尔 `used`，不允许未知字段。空数组合法。
- `rules` 必须是数组；每条规则包含唯一非空 `id`、布尔 `enabled`、非空 URL `match`，可选 `tagIds`、`request` 重定向 action 和 `response` 替换 action。`tagIds` 缺省表示无标签；提供时必须是唯一标签 ID 数组，且每个 ID 都必须指向顶层 `tags`。未知规则和 matcher 字段拒绝。
- URL matcher 的 `method` 是可选字符串，`type` 可选 `normal` 或 `regex`。正则采用 RE2 语法，以避免灾难性回溯；lookahead、backreference 等 RE2 不支持的语法在保存 / 导入时拒绝，具体输入上限见 `docs/V3-INPUT-VALIDATION.zh.md`。重定向 payload 必须含非空目标 `url`；响应替换可选 `status`（200–599 整数）、字符串 header map、JSON `body` 和字符串 `code`。未知 action / payload 字段拒绝。
- 校验结果携带字段路径和可读原因，不通过部分修复或丢弃字段来“尽量导入”。整个备份校验成功后才允许替换当前配置。

上述基础 envelope 已落为独立的 `@proxy/v3-domain` 校验实现。计划新增 URL 精确模式仍须遵循严格的 `formatVersion` 策略；静态响应 header 配置入口则需先单独审查 Fetch / XHR 差异并决定是否提供能力降级。任何格式变化都必须递增 `formatVersion`。

导入入口使用 `parseV3BackupJson(text)` 完成 JSON 解析和 schema 校验，UTF-8 BOM 会在解析前移除。返回的 `issues` 带有 `$` 根路径或 `rules[0].match.url` 这类字段路径；`formatV3ValidationIssues()` 可将其转换成可直接呈现的文本。语法错误、V2 不兼容、版本不支持和字段校验错误都通过同一结果结构返回，调用方应展示这些原因并在校验失败时保持当前配置不变。合法结果另含 `warnings`；含 response `code` 的规则会列出代码字段路径，并在返回数据中停用对应 response action，导入前不会执行代码。

## 建议的匹配和执行顺序

1. 捕获原始 URL 与 method；method 转为大写，原 URL 在请求及响应两个阶段都保持不变。
2. 按规则列表顺序检查规则启用状态、是否至少有一个 action 启用、URL matcher 与 method。未填写 method 或 `ANY` 匹配任意 method；其余 method 大小写无关地比较。选择第一条完整命中的规则；后续规则不再参与该请求。`normal` URL 条件按区分大小写的子串匹配，`regex` 按不区分大小写的 RE2 语义执行。
3. 一旦选中规则，锁定本次请求的 rule ID。规则的 request action 若启用，则在网络请求发出前计算重定向目标并改写请求；未启用时使用原始请求。
4. 请求只发送一次。收到响应后，使用同一条规则的 response action；若启用，则尝试拦截 / 替换。规则不会在重定向后的 URL 上重新匹配，也不会因 action 失败而转交给下一条规则。
5. 选中规则时记录一次命中，并分别记录重定向与响应替换的状态，避免组合 action 导致重复计数。诊断至少区分 `matched`、`redirect-applied`、`response-replaced` 和 `failed-open`。

第一条完整命中是已采用的运行时策略：优先级容易解释，单个请求只由一个规则负责，组合规则也不会和后续规则在不同阶段叠加出难以预测的结果。请求与响应 action 的优先级由阶段区分；同阶段不叠加多条规则。若未来确有链式需求，应作为显式、高风险能力单独设计，不隐式叠加。

## 失败回退建议

| 失败位置                 | 建议行为                                                                               | 原因                                     |
| ------------------------ | -------------------------------------------------------------------------------------- | ---------------------------------------- |
| 规则数据无效             | 导入 / 保存时拒绝并说明字段位置；运行时跳过无效规则并记录诊断                          | 避免请求执行中才暴露结构问题             |
| 匹配器运行异常           | 记录失败并跳过该规则，继续检查下一条                                                   | 该规则无法判定命中，不应阻塞其他规则     |
| 重定向目标计算异常或超时 | 保持原始 URL 和请求参数，继续原请求；同一规则仍可执行响应 action                       | 采用 fail-open，避免调试逻辑阻断业务请求 |
| 重定向后的网络请求失败   | 返回原生网络错误，不自动重试原 URL                                                     | 防止非幂等请求重复提交或产生副作用       |
| 响应读取、解析或替换失败 | 返回原始响应；如原始响应已被消费，则实现层必须先保留可恢复副本，否则不能启用该转换路径 | 业务响应优先，避免代理逻辑造成额外失败   |
| 命中通知 / 统计失败      | 不改变请求和响应结果，仅记录可用诊断                                                   | 可观测性不能影响请求正确性               |

当前函数式 action 执行器保留 callback 用法并支持直接返回值 / Promise，首次有效完成生效；异步等待上限为 5 秒。语法错误、同步异常、Promise 拒绝、无效结果及超时按 fail-open 回退：响应拦截返回原响应，重定向继续原始请求。该超时不能中断同步死循环，用户代码隔离仍需单独设计。浏览器 API 不允许可靠回退的场景，应显式显示原生错误，不得伪装成成功。

## Fetch 与 XHR 验证边界

- **Fetch**：验证 `Request` 与 `init` 合并语义、method / headers / body / credentials / signal / mode 保留、请求体能否重放、Response body 一次性读取、无 body 状态码、headers 和 `Content-Length` 处理。
- **XHR 请求改写**：`open()` 必须同步返回并保留 method、async、用户名密码参数。静态重定向和同步 callback 规则可以立即应用；Promise 或延迟 callback 规则无法在 XHR `open()` 内等待，当前 fail-open 使用原 URL 并警告。Fetch 仍支持异步规则函数。重复 `open()`、`setRequestHeader()`、`send()` 和原生事件时序继续由后续 XHR 回归覆盖。
- **XHR 响应替换**：XHR 的 `response`、`responseText`、`status` 等原生状态并非可任意写入。需用原型验证能否在不破坏事件顺序、`responseType` 和同步请求语义的条件下实现替换；若不能，应缩小 XHR 支持范围并在 UI 明示，不能宣称与 Fetch 完全一致。
- **共同场景**：验证多条规则命中、规则禁用、重定向失败、函数异常 / 超时、请求循环风险、其他包装器共存、iframe、多标签和 service worker 状态更新。

当前扩展 XHR runtime 对异步请求按原 URL / method 选择首条规则，支持静态 HTTP(S) 重定向，以及空 / `text` / `json` responseType 下的静态 body / status 替换；同步 XHR、函数 `code`、其他 responseType 和带 response headers 覆盖的 action 均 fail-open。它不重写响应头，也不合成原生网络事件；代理给事件监听器包装代理 `this`、`target` 和 `currentTarget`。FakeXHR 单测与 Chrome / Edge Stable、最低 Chrome 141 / Edge 140 扩展 smoke 已覆盖组合 Fetch / XHR 路径，但两者的原生能力仍不完全等价，UI 需要标明受限 action。

## 扩展运行时接入边界

页面请求 API 只能在 MAIN world 包装，因此扩展 content script 通过同源 `window.postMessage` 把 V3 配置交给 MAIN-world runtime。该消息通道不是身份认证机制：页面脚本能观察消息，也能伪造格式正确的配置消息；MAIN-world 的 schema 校验只限制结构，不证明消息来自扩展。运行时因此只消费格式化、受限长度且经 schema 校验的规则，但 V3 配置不得视为页面不可见或防篡改的机密。跨 origin 重定向会剥离 `Authorization`、`Proxy-Authorization`、`Cookie` 和 `Cookie2`；这不能替代安全隔离。若页面已在扩展代理外包装 Fetch / XHR，扩展遵循现有“不覆盖页面包装器”策略，不能保证 V3 立即接管；已捕获的 V2 代理会在 V3 状态生效时停止应用旧规则。

V3 runtime 使用独立 `V3_HIT` 消息和 `V3_HITS` 存储，不发送 V2 badge 命中消息，也不把计数写进 V2 规则或 V3 backup。Fetch / XHR 选择第一条完整命中规则后上报其 ID、匹配条件与原始 URL / method；service worker 重新校验活动 backup、启用状态和规则字段，再串行递增对应计数。扩展徽章在有效 V3 配置启用时显示 V3 总命中数；清除配置后再恢复 V2 badge 逻辑。打开的 V3 面板会在内存显示跨标签页最近 10 条收到的命中通知、原始请求 URL / method、规则匹配条件与接收时间；刷新或关闭面板后清空，不保存请求 body / headers。此通知早于请求处理完成，因此“已匹配”不代表重定向或响应替换成功。尚无运行时未命中原因或 action 最终结果视图，计数和页面主世界事件不能视为可信日志或安全证据。

面板另提供离线规则匹配试算：用户手动输入 URL / method，使用当前完整规则顺序复用同一 domain matcher，逐条说明全局或规则停用、action 全停用、method / URL 不符、无效正则、首条完整命中和优先级遮蔽。试算不会发出请求、改写配置或计数，也不持久化输入；它只解释当前配置对这组输入的判断，不代表某次历史请求的实际生命周期或 action 成败。

面板可从最近命中记录快捷创建响应或重定向规则。它只使用已收到的通知中的原始 URL / method 预填草稿；响应默认 JSON 状态码 200、空对象正文，重定向目标保持空白待用户填写。新规则默认停用且不带标签，不复制请求 / 响应 body、headers、既有响应、重定向目标或函数代码。完整 URL 可能包含敏感 query 参数，因此会在编辑器中显示并允许用户检查和修改。关闭编辑器不保存；用户保存后仍须显式启用规则，它才会参与请求处理。

页面主世界事件依然可以由网页脚本伪造，因此 V3 计数是便于排查的提示，不可信任为审计日志或安全依据。计数写入失败不会影响请求，并且后续命中会继续尝试更新。

## 待确认项

1. 是否接受目标计算失败时继续原始请求、网络失败时不重试、响应转换失败时回退原响应。
2. Fetch 与 XHR 无法完全一致时，是否接受按能力降级并在规则编辑界面标出差异。
3. 规则命中统计是否保留现有单一计数，还是在总命中外新增 action 级诊断计数。
