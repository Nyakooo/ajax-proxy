# V3 输入校验与资源上限

本文记录 V3 完整备份 schema 的输入边界。校验错误携带字段路径；任何错误都拒绝整份备份，不会部分修复或应用。

## 当前上限

| 输入                     | 限制                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| UTF-8 JSON 备份          | 5 MiB                                                                                                     |
| 规则 / 标签              | 最多 1,000 条规则、500 个标签；其中最多 100 条正则规则                                                    |
| ID / 标签名称            | ID 最多 256 字符；标签名称最多 512 字符                                                                   |
| URL matcher / 重定向目标 | 最多 4,096 字符；matcher 正则使用 RE2 语法；重定向只允许 HTTP(S) 或相对 URL                               |
| HTTP method              | 最多 32 字符，且必须符合 HTTP token 字符集                                                                |
| response headers         | 最多 100 项；名称是 HTTP token，值拒绝 CR、LF、NUL 和控制字符；单值最多 8,192 字符，总计最多 32 KiB UTF-8 |
| 函数源码                 | 最多 64 KiB 字符；导入时仍保持停用                                                                        |
| JSON response body       | 最多 64 层、50,000 个值节点；使用迭代遍历，拒绝循环对象和非 JSON 值                                       |
| response status          | 200–599 整数；排除 Fetch `Response` 构造器不支持的 1xx                                                    |
| 运行时 URL matcher       | 每条 request URL 最多 65,536 字符；最多 256 个最近使用的已编译正则保留在缓存中                            |

备份字节限制、规则数量、字段长度和 JSON 深度 / 节点上限共同限制解析和校验的时间与内存用量。Header 名和值会在存入规则前满足 `Headers` 的基本字符要求，避免运行时构造时才抛错。

## 正则语法与执行

V3 使用纯 JavaScript 的 `re2js` 进行语法验证和匹配。RE2 引擎避免原生回溯引擎的灾难性指数时间模式；当前配置启用大小写不敏感，不启用 lookbehind。JS lookahead 和 backreference 等 RE2 不支持的语法会在导入或面板保存时拒绝。每条 request URL 限制为 65,536 字符，正则最多 100 条，避免在很多规则上重复扫描超长输入；匹配时只缓存最近 256 个编译结果。

`re2js` 2.8.6 浏览器 ESM 入口约 252 KB，gzip 约 61 KB。当前生产构建中，包含代理实现的 `document.js` 为 157 KB（gzip 47,928 B），Vue 面板的按需 chunk `npm.re2js.d1acfa85.js` 为 140.43 KiB（gzip 41.55 KiB）；该依赖会增加页面代理与正则相关面板代码的下载体积。

## 验收

- 单测覆盖 RE2 嵌套量词匹配、RE2 不支持的语法、危险 URL scheme、HTTP method / header 校验、备份大小、规则数、函数源码和 JSON 深度限制。
- Playwright Chromium 扩展 smoke 覆盖 Fetch、XHR、iframe、redirect 和 service worker 重启；Chrome Stable 154.0.8037.58 与 Edge Stable 153.0.4234.48 重载当前扩展并打开面板。RE2 pattern 的品牌浏览器页面请求行为尚未单独做端到端验证，语法拒绝和运行时安全性由单元测试覆盖。
