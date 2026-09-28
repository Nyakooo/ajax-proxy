<div align="center">
  <img src="docs/brand/ajax-proxy-mark-dark.png" width="76" height="76" alt="Ajax Proxy 图标" />
  <h1>Ajax Proxy</h1>
  <p><strong>按你的需要改写接口响应，让开发继续向前。</strong></p>
  <p>在 Chromium 浏览器中 Mock 尚不存在的接口、重定向请求，并随时验证边界场景。</p>

  <p>
    <a href="https://github.com/Nyakooo/ajax-proxy/actions/workflows/ci.yml?query=branch%3Arefactor%2Fv3"><img alt="V3 CI" src="https://img.shields.io/github/actions/workflow/status/Nyakooo/ajax-proxy/ci.yml?branch=refactor%2Fv3&label=V3%20CI"></a>
    <a href="LICENSE"><img alt="MIT 许可证" src="https://img.shields.io/github/license/Nyakooo/ajax-proxy"></a>
    <a href="https://github.com/Nyakooo/ajax-proxy/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/Nyakooo/ajax-proxy?style=social"></a>
    <a href="https://chrome.google.com/webstore/detail/ajax-proxy/jbikjaejnjfbloojafllmdiknfndgljo"><img alt="Chrome 网上应用店版本" src="https://img.shields.io/chrome-web-store/v/jbikjaejnjfbloojafllmdiknfndgljo?logo=googlechrome&logoColor=white"></a>
    <a href="https://microsoftedge.microsoft.com/addons/detail/ajax-proxy/iladajdkobpmadjfpeginhngnneaoefi"><img alt="Microsoft Edge 加载项" src="https://img.shields.io/badge/Edge%20Add--ons-available-0078D7?logo=microsoftedge&logoColor=white"></a>
  </p>

  <p><strong>V3 开发预览 · Chrome 与 Microsoft Edge 稳定版</strong><br>V3 正在 <code>refactor/v3</code> 分支开发；上方商店链接指向单独发布的版本。</p>
  <p>安装商店已发布版本（与 V3 开发预览分开）：<a href="https://chrome.google.com/webstore/detail/ajax-proxy/jbikjaejnjfbloojafllmdiknfndgljo">Chrome 网上应用店</a> · <a href="https://microsoftedge.microsoft.com/addons/detail/ajax-proxy/iladajdkobpmadjfpeginhngnneaoefi">Edge 加载项</a></p>
  <p>
    <a href="#试用-v3-开发预览"><strong>构建并试用 V3</strong></a> ·
    <a href="docs/V3-RULE-MODEL.zh.md">规则模型</a> ·
    <a href="docs/V3-BACKUP-RESTORE.zh.md">备份与恢复</a> ·
    <a href="https://github.com/Nyakooo/ajax-proxy/issues">问题反馈</a>
  </p>
  <p><a href="README.md">English</a> | 简体中文</p>
</div>

<p align="center">
  <img src="media/ajax-proxy-v3-showcase.svg" alt="Ajax Proxy V3 示意图：匹配浏览器请求并返回配置好的 JSON Mock 响应" width="100%">
</p>

## 为什么使用 Ajax Proxy？

前端页面需要的接口可能还没开发好，也可能很难稳定复现某个错误。Ajax Proxy 可以在浏览器里直接为请求配置响应，不必改业务代码，也不用等待后端准备测试数据，就能继续联调和验证界面。

## 核心能力

- **Mock 接口响应：** 按 URL 和请求方法匹配，为 Fetch 或支持的异步 XHR 返回指定的 JSON 内容与状态码。浏览器请求由扩展直接提供响应，不要求服务端真的存在这个接口。
- **重定向请求：** 将匹配到的请求发送到另一个 URL；静态重定向可设置请求头或排除指定 URL，也可用受限函数为 Fetch 动态计算目标地址。
- **覆盖异常场景：** 按需模拟空数据、校验失败、错误状态码及其他难以触发的响应场景。
- **就地管理规则：** 搜索和筛选规则、置顶重要规则、用标签归类，并快速切换扩展总开关或当前站点规则。多条规则同时匹配时，按列表顺序仅应用首条启用规则。
- **查看已确认的执行结果：** 按需开启临时诊断，查看规则动作已应用、回退、失败或暂不支持等状态。
- **按需使用函数规则：** V3 支持在受限 sandbox 中计算 JSON 响应和重定向目标。函数规则只作用于 Fetch；XHR 保留原始响应或 URL。
- **备份和恢复 V3 配置：** 导出独立的 V3 配置备份，便于迁移或重置浏览器配置文件。

Ajax Proxy 以浏览器扩展形式运行，不需要 Ajax Proxy 账号或托管服务。V3 当前最低支持 Chrome 141、Microsoft Edge 140 稳定版；支持窗口策略见[浏览器兼容说明](docs/V3-BROWSER-COMPATIBILITY.zh.md)。

## 试用 V3 开发预览

> **开发版本说明：** V3 尚未作为此开发分支的构建发布到扩展商店。加载此分支会安装本地开发构建。V2 与 V3 的规则和备份格式互不兼容；V3 不会自动迁移 V2 数据。请保留 V2 备份，并按需在 V3 中重新创建规则。

环境要求：Node.js `>=24.21.0 <25`、pnpm `12.6`。

```sh
git clone --branch refactor/v3 https://github.com/Nyakooo/ajax-proxy.git
cd ajax-proxy
pnpm install --frozen-lockfile
pnpm build
```

然后在 Chrome（`chrome://extensions`）或 Edge（`edge://extensions`）中：

1. 开启**开发者模式**。
2. 选择**加载已解压的扩展程序**。
3. 选择源码目录中的 `packages/shell-chrome/build`。
4. 打开扩展 popup，点击**打开大面板**管理规则。

V3 当前用于开发和评估，已在 Chrome 与 Edge 稳定版进行功能验收；详见 [V3 面板迁移说明](docs/V3-PANEL-MIGRATION.zh.md) 与[测试和验收记录](docs/V3-TESTING.zh.md)。此分支不代表商店发布版本。

## 文档

- [V3 规则模型与命中优先级](docs/V3-RULE-MODEL.zh.md)
- [V3 配置备份与恢复](docs/V3-BACKUP-RESTORE.zh.md)
- [V3 迁移状态与已知差异](docs/V3-PANEL-MIGRATION.zh.md)
- [V3 浏览器兼容范围](docs/V3-BROWSER-COMPATIBILITY.zh.md)
- [自定义响应函数与 sandbox 限制](docs/V3-USER-FUNCTIONS.zh.md)
- [权限和安全边界](docs/V3-PERMISSIONS.zh.md)
- [V2 旧函数 API 参考（不适用于 V3）](README.func.md)

V3 设计和实现文档目前主要以中文维护。上方商店安装链接对应单独发布的稳定版本。

## 演示

下面的动图展示的是**旧版 V2 界面**，仅作历史演示；它不是 V3 预览版的截图。

<details>
  <summary>展开查看 V2 旧版演示</summary>
  <p><a href="https://www.bilibili.com/video/BV1KB4y1j7Gm">观看 Bilibili 上的旧版功能演示</a>。</p>
  <p><img src="media/operation.gif" alt="Ajax Proxy V2 旧版界面操作演示"></p>
</details>

## 参与贡献

欢迎通过 [GitHub Issues](https://github.com/Nyakooo/ajax-proxy/issues) 反馈问题或提出功能建议。请提供浏览器和扩展版本及最小复现步骤；分享日志或备份前，请移除真实请求内容、Cookie、令牌、个人信息和私有函数代码。较大的改动建议先通过 issue 讨论范围；提交 PR 时请聚焦单一主题，并说明用户可见变化和已完成的功能验证。V3 开发构建及其 CI 位于 `refactor/v3` 分支。

## 许可证

Ajax Proxy 使用 [MIT License](LICENSE) 开源。
