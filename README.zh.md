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

[Edge 版本](https://microsoftedge.microsoft.com/addons/detail/ajax-proxy/iladajdkobpmadjfpeginhngnneaoefi)

[Chrome 版本](https://chrome.google.com/webstore/detail/ajax-proxy/jbikjaejnjfbloojafllmdiknfndgljo)

## 效果展示

视频: [https://www.bilibili.com/video/BV1KB4y1j7Gm](https://www.bilibili.com/video/BV1KB4y1j7Gm)

<!-- ![interceptor](https://github.com/g0ngjie/ajax-proxy/wiki/images/interceptor-1.png) -->

![operation.gif](media/operation.gif)

![zhihu](https://github.com/g0ngjie/ajax-proxy/wiki/images/zhihu-ajaxproxy.png)

## 视频介绍

- [请求方式拦截介绍](https://www.bilibili.com/video/BV1eW4y1H76x/?vd_source=47f2c439d1dcdfef3c5f144bf04b0c01)
- [状态码规则与正则的使用介绍](https://www.bilibili.com/video/BV1LV4y1V7e2/?vd_source=47f2c439d1dcdfef3c5f144bf04b0c01)

## 常见问题

1. 数据拦截不起作用
   - 方法 1: 可以通过切换 `interceptor` 和 `redirector` 来刷新 Ajax 引用问题
     ![issues_checked](https://github.com/g0ngjie/ajax-proxy/wiki/images/issues_checked.png)
   - 方法 2: 可以在开发者工具中的`网络（network）`里面，通过 ☑️ 禁用缓存
     ![issues_disabled_cache](https://github.com/g0ngjie/ajax-proxy/wiki/images/issues_disabled_cache.png)
2. [函数方式响应说明](README.func.md)

## Monorepo

| Package                                           | Description          |
| ------------------------------------------------- | -------------------- |
| [@proxy/compatibility](./packages/compatibility/) | 老数据兼容库         |
| [@proxy/lib](./packages/proxy-lib/)               | 操作 Ajax 核心逻辑库 |
| [@proxy/shared-utils](./packages/shared-utils/)   | 通用类库             |
| [@proxy/shell-chrome](./packages/shell-chrome/)   | 浏览器扩展库         |
| [@proxy/vue-panels](./packages/vue-panels/)       | 应用操作面板         |

## 源码使用方式

1. 下载对应版本的 [Source code](https://github.com/g0ngjie/ajax-proxy/releases) 解压
2. 浏览器打开 `开发者模式`
3. 加载解压后的文件夹

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
