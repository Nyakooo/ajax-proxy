# Ajax Proxy Playground

独立静态演示位于 [`pages/playground/`](../pages/playground/)，用于在真实浏览器页面中手动验证 Ajax Proxy 的请求匹配和响应行为。页面没有构建依赖；fixture JSON / text、独立 iframe、srcdoc iframe 与 Worker 脚本都保存在该目录。

## 打开页面

GitHub Pages 已启用，仓库的 Pages 工作流会把 `pages/` 目录发布到：

在线地址：[https://nyakooo.github.io/ajax-proxy/playground/](https://nyakooo.github.io/ajax-proxy/playground/)。站点根路径 [https://nyakooo.github.io/ajax-proxy/](https://nyakooo.github.io/ajax-proxy/) 会跳转到 Playground。

工作流定义在 [pages-demo.yml](../.github/workflows/pages-demo.yml)，会在 `master` 上的 Pages 文件变化时自动部署，也可以手动运行。

本地运行时，在仓库根目录启动任一静态文件服务器，例如：

```sh
python3 -m http.server 8000 --directory pages
```

然后打开 `http://127.0.0.1:8000/playground/`。不要用 `file://` 打开；扩展的页面注入和相对 URL 测试需要 HTTP(S) origin。

## 建议测试步骤

1. 确认 Ajax Proxy V3 全局开关已开启。
2. 创建启用状态的响应规则；先用普通包含匹配，将 URL 设为 `playground/fixtures/profile.json`，method 设为 `GET`。
3. 在 Playground 点 **发送 Fetch GET** 和 **发送 XHR JSON**。页面顶部的“最新接口响应”会实时显示请求方式、最终 URL、HTTP 状态和页面实际收到的响应体；页面下方还会保留历史请求记录。
4. 为了直观看出规则是否替换成功，把规则的响应体改为明显不同于默认 fixture 的 JSON（例如 `{ "source": "my-rule", "hit": true }`），再发送请求。顶部响应体应显示规则配置的内容，并结合扩展面板的命中计数确认。
5. 再创建 `POST` 规则，匹配 `playground/fixtures/echo.json`，测试 Fetch / XHR JSON body、method 条件和响应 mock。Pages 是静态托管，没有 POST API；未命中时看到 404 / 405 或静态站点错误页属于预期回退。
6. 用自定义请求测试精确 URL、正则、query string 和其它 method；用“method 不匹配”确认仅 URL 相同时，不同 method 不会命中。
7. 在独立 iframe 和 srcdoc iframe 内分别点 Fetch / XHR，检查子 frame 命中与相对 URL 解析。父页面“最新接口响应”和“请求记录”都会显示结果。
8. Dedicated Worker 按钮仅用于确认浏览器的 Worker 原生 Fetch 可正常访问 fixture。Ajax Proxy 当前只在 document 主世界代理 Fetch / XHR，不支持拦截 Dedicated Worker 内部请求；此场景不能作为插件拦截是否正常的判断标准。
9. 检查 ArrayBuffer、404、并发请求、Request 对象 method 覆盖及跨源 CORS 场景。跨源请求只会在手动点击后发送到公开 JSONPlaceholder；网络或 CORS 错误会显示在响应面板中。

## 页面中的场景

| 分类           | 覆盖内容                                                                              |
| -------------- | ------------------------------------------------------------------------------------- |
| Fetch          | GET JSON、POST JSON、Request + `init` method 覆盖、并发请求、404、跨源 CORS           |
| XMLHttpRequest | JSON / text / ArrayBuffer responseType、POST body、method 不匹配                      |
| Frame          | 独立同源 iframe、继承 origin 的 srcdoc iframe、相对 URL                               |
| 边界对照       | 不受插件代理的 Dedicated Worker 原生请求、无效路径、静态 Pages 不支持的 POST 原始回退 |
| 自定义         | 输入 URL、method、JSON body、Fetch / XHR transport 和 XHR responseType                |

所有默认请求都指向本 Pages 站点内的静态 fixture。页面不会自动发请求；请求记录只存在于当前页面内存中，刷新后清空。除用户主动点击跨源 CORS 场景外，不会向第三方发送请求。

每个按钮完成后，页面顶部会更新最新请求的 URL、method、HTTP 状态和实际响应 body；页面底部保留可展开的请求历史。此处展示的是页面收到的结果。将规则响应设成明显不同于默认 fixture 的值，可以直接观察插件替换是否生效；命中计数仍可在扩展面板中交叉确认。Worker 对照场景、浏览器 CORS 和静态站点对非 GET method 的限制需要按文中边界解释。
