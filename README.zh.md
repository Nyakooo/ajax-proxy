<br>

<h1 align="center">Ajax Proxy</h1>

<br>

<h4 align="center">一款基于Chromium内核的浏览器插件 · 面向开发者的工具 · 用于Web端接口数据的修改</h4>

<p align="center">
  <a href="https://github.com/g0ngjie/ajax-proxy/blob/master/LICENSE">
    <img alt="GitHub" src="https://img.shields.io/github/license/g0ngjie/ajax-proxy"/>
  </a>
  <a href="https://chrome.google.com/webstore/detail/ajax-proxy/jbikjaejnjfbloojafllmdiknfndgljo" target="__blank">
    <img src="https://img.shields.io/chrome-web-store/v/jbikjaejnjfbloojafllmdiknfndgljo.svg?logo=Google%20Chrome&logoColor=white&color=red&style=flat-square" alt="chrome web store">
  </a>
  <a href="https://chrome.google.com/webstore/detail/ajax-proxy/jbikjaejnjfbloojafllmdiknfndgljo" target="__blank">
    <img src="https://img.shields.io/chrome-web-store/stars/jbikjaejnjfbloojafllmdiknfndgljo.svg?logo=Google%20Chrome&logoColor=white&color=red&style=flat-square" alt="chrome rating">
  </a>
  <!-- Temporary badges for edge -->
  <a href="https://microsoftedge.microsoft.com/addons/detail/ajax-proxy/iladajdkobpmadjfpeginhngnneaoefi" target="__blank">
    <img src="https://img.shields.io/badge/dynamic/json?label=edge%20add-on&style=flat-square&prefix=v&query=%24.version&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Filadajdkobpmadjfpeginhngnneaoefi" alt="edge addons">
  </a>
  <a href="https://microsoftedge.microsoft.com/addons/detail/ajax-proxy/iladajdkobpmadjfpeginhngnneaoefi" target="__blank">
    <img src="https://img.shields.io/badge/dynamic/json?label=users&style=flat-square&query=%24.activeInstallCount&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Filadajdkobpmadjfpeginhngnneaoefi" alt="edge users">
  </a>
</p>

<div align="center">
<strong>

[English](README.md) | 中文

</strong>
</div>

## 适用场景

- 当实际数据无法达到预期结果时，需要进行 Mock 数据处理。
- 在开发或生产阶段，需要验证异常场景或临界值。
- 开发阶段数据频繁变更，导致页面无法正常联调时。
- 某个接口返回 404 错误时。

<!-- - 当 ... ... -->

## 安装

Chrome 与 Edge 商店链接指向已发布版本。`refactor/v3` 开发分支中的 V3 仍处于 development staging 阶段，尚未纳入该发布版本或替换扩展默认面板入口。

[Edge 旧稳定版](https://microsoftedge.microsoft.com/addons/detail/ajax-proxy/iladajdkobpmadjfpeginhngnneaoefi)

[Chrome 旧稳定版](https://chrome.google.com/webstore/detail/ajax-proxy/jbikjaejnjfbloojafllmdiknfndgljo)

V3 当前针对 **Chrome / Edge 当前稳定版**开发和验收。要试用 V3，请按下方“从源码加载 V3 staging”步骤构建并加载本地扩展。

## 效果展示

视频: [https://www.bilibili.com/video/BV1KB4y1j7Gm](https://www.bilibili.com/video/BV1KB4y1j7Gm)

<!-- ![interceptor](https://github.com/g0ngjie/ajax-proxy/wiki/images/interceptor-1.png) -->

![operation.gif](media/operation.gif)

![zhihu](https://github.com/g0ngjie/ajax-proxy/wiki/images/zhihu-ajaxproxy.png)

## 视频介绍

- [请求方式拦截介绍](https://www.bilibili.com/video/BV1eW4y1H76x/?vd_source=47f2c439d1dcdfef3c5f144bf04b0c01)
- [状态码规则与正则的使用介绍](https://www.bilibili.com/video/BV1LV4y1V7e2/?vd_source=47f2c439d1dcdfef3c5f144bf04b0c01)

## 常见问题

1. V2 旧版数据拦截不起作用
   - 方法 1: 可以通过切换 `interceptor` 和 `redirector` 来刷新 Ajax 引用问题
     ![issues_checked](https://github.com/g0ngjie/ajax-proxy/wiki/images/issues_checked.png)
   - 方法 2: 可以在开发者工具中的`网络（network）`里面，通过 ☑️ 禁用缓存
     ![issues_disabled_cache](https://github.com/g0ngjie/ajax-proxy/wiki/images/issues_disabled_cache.png)
2. [函数方式响应说明](README.func.md)
3. **为什么打开的还是旧面板？** V3 仍在 development staging 阶段，扩展默认入口还是 Vue 2 面板。构建并加载本地扩展后，需在地址栏显式打开 `chrome-extension://<扩展 ID>/panels-v3/index.html`；将 `<扩展 ID>` 替换为扩展详情页显示的 ID。
4. **V2 和 V3 配置能否互相导入？** 不能。V2 / V3 规则与备份格式不兼容，也没有自动迁移。请保留 V2 备份，并在 V3 面板中按需重新创建规则。详见 [V3 配置备份与恢复](docs/V3-BACKUP-RESTORE.zh.md#v2-备份不兼容)。
5. **V3 是否已覆盖 V2 的全部能力？** 尚未。当前 staging 支持 V3 格式的重定向和 JSON 响应规则、Fetch 函数响应及配置备份 / 恢复；函数响应仅作用于 Fetch。V2 专有的 substring replacement、headers、ignores 和 redirect function 尚未迁移。详见 [V3 面板迁移说明](docs/V3-PANEL-MIGRATION.zh.md)。
6. **V3 请求为什么没有命中规则？** 请确认打开的是 `panels-v3/` 页面、全局和站点开关已启用、规则 URL 与 method 条件匹配。多条规则命中时按列表顺序只应用首条。函数响应仅拦截 Fetch；XHR 保留原生响应。详见 [V3 规则模型](docs/V3-RULE-MODEL.zh.md)。

## Monorepo

| Package                                                 | Description                                     |
| ------------------------------------------------------- | ----------------------------------------------- |
| [@proxy/protocol](./packages/protocol/)                 | V2 / V3 通信协议与类型                          |
| [@proxy/v2-compatibility](./packages/v2-compatibility/) | V2 配置格式解析与校验；不负责 V2 到 V3 自动迁移 |
| [@proxy/lib](./packages/proxy-lib/)                     | V2 / V3 请求匹配与 Fetch / XHR 拦截核心逻辑     |
| [@proxy/shared-utils](./packages/shared-utils/)         | 扩展共享工具与存储能力                          |
| [@proxy/v3-domain](./packages/v3-domain/)               | V3 配置 schema、校验及规则匹配逻辑              |
| [@proxy/shell-chrome](./packages/shell-chrome/)         | Chromium 扩展、service worker 与构建入口        |
| [@proxy/vue-panels](./packages/vue-panels/)             | 当前默认 Vue 2 面板                             |
| [@proxy/vue3-panels](./packages/vue3-panels/)           | 独立构建的 V3 staging Vue 3 面板                |

## 源码使用方式

### 从源码加载 V3 staging

以下步骤适用于仓库 `refactor/v3` 开发分支；官方商店版本仍是旧稳定版。环境要求：Node.js `>=24.21.0 <25`、pnpm `12.6`。

```sh
git clone --branch refactor/v3 https://github.com/g0ngjie/ajax-proxy.git
cd ajax-proxy
pnpm install --frozen-lockfile
pnpm build
```

在 Chrome 或 Edge 当前稳定版中打开扩展管理页（Chrome `chrome://extensions`，Edge `edge://extensions`），开启“开发者模式”，选择“加载已解压的扩展程序”，并选择仓库中的 `packages/shell-chrome/build` 目录。加载后从扩展详情复制扩展 ID，再显式打开：

```text
chrome-extension://<扩展 ID>/panels-v3/index.html
```

Edge 的扩展页面也使用 `chrome-extension://` scheme。默认工具栏入口仍会打开 Vue 2 的 `panels/`；V3 staging 页面位于独立的 `panels-v3/` 路径。更多步骤及备份说明见 [V3 面板迁移说明](docs/V3-PANEL-MIGRATION.zh.md) 和 [V3 配置备份与恢复](docs/V3-BACKUP-RESTORE.zh.md)。

### 加载发布源码

下载对应版本的 [Source code](https://github.com/g0ngjie/ajax-proxy/releases) 解压，在浏览器开发者模式中加载已解压扩展目录。该发布源码对应商店旧稳定版，不包含上述 `refactor/v3` staging 说明。

## 测试用例

下载 [Interceptor.test.json](https://github.com/g0ngjie/ajax-proxy/blob/master/Interceptor.test.json)

分别使用在 [掘金](https://juejin.cn/) 首页、[百度翻译](https://fanyi.baidu.com/) 两个网站测试

1. 掘金: 直接在首页查看效果；
2. 百度翻译: 随便翻译点内容即可；
3. 也可以直接在[Swagger](https://petstore.swagger.io/)中测试

## ⭐ Stargazers

感谢支持!

[![Stargazers for ajax-proxy](https://reporoster.com/stars/g0ngjie/ajax-proxy)](https://github.com/g0ngjie/ajax-proxy/stargazers)

## License

Ajax Proxy is [MIT licensed](LICENSE).
