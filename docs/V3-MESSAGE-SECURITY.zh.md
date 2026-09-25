# V3 扩展消息边界

本文记录 V3 对 content script、页面主世界、面板和 service worker 消息的信任边界。扩展运行时消息按 Chrome 提供的 `sender` 校验；页面主世界与 isolated world 之间没有可供当前实现独立验证的发送方身份，因此页面消息一律视为不可信输入。

## 接收边界

| 接收端                 | 允许的来源                        | 校验内容                                                                                                                                         |
| ---------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 页面代理 `document.js` | 当前 frame 的 content script 消息 | `event.source` 必须是当前 `window`，origin 必须与当前页面一致；消息 envelope、方向、key 和对应的开关、模式、完整状态或规则数组必须符合预期结构。 |
| content script         | 页面主世界命中事件                | 只接受 plain record；`match_url`、HTTP method、可选 URL 和规则序号有类型及长度限制；拒绝额外字段、异常对象和无效规则序号。                       |
| service worker         | content script                    | `sender.id` 必须是本扩展 ID，且必须有 tab；只接受受限的标题初始化或命中统计数据。                                                                |
| service worker         | 面板                              | `sender.id` 必须是本扩展 ID，没有 tab，且 `sender.url` 位于扩展 origin；每种 key 分别校验布尔值、模式、规则数组或空标题查询。                    |
| service worker         | 长连接                            | 只接受本扩展 ID 下由 tab 发起的连接；其他端口立即断开。                                                                                          |
| 面板                   | service worker                    | 校验扩展 ID、扩展页面 URL、无 tab、消息 envelope、方向、key 和标题值。                                                                           |

规则列表和完整代理状态在到达 `@proxy/lib` 前进行字段校验。拦截规则要求有效 URL、开关、筛选方式、method、响应字段与命中数；重定向规则校验目标、headers、忽略项和函数类型。空数组仍是有效列表，更新特定列表使用专用 API，避免依当前模式猜测清空对象。

## 页面主世界的限制

`window.postMessage` 和页面事件都能被同一页面的脚本伪造；`event.source` / `event.origin` 只能排除其他 frame 和跨 origin 消息，不能证明消息由 content script 生成。页面可以伪造本页代理配置消息或命中统计事件。因此接收的数据只影响当前页面的代理状态和扩展统计，不触发 storage 写入、权限操作或任意扩展消息转发；页面命中事件仅作为统计提示，不能用于授权或安全决策。

该边界无法靠共享 DOM 中的 token 修复，因为页面脚本能够观察 token 的发布和传递。若将来需要可信的页面到扩展操作，应改为由 isolated world / service worker 发起并校验的扩展 API 流程，而不是提升当前页面桥接消息的信任级别。

## 验收

- 单元测试覆盖代理状态、规则列表、页面命中事件结构和长连接发送方过滤。
- 全量扩展构建及 Chrome Stable / Edge Stable 实测覆盖 Fetch、XHR 和面板配置同步；页面消息伪造局限作为明确的 trust boundary 保留。
