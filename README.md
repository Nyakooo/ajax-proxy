<br>

<h1 align="center">Ajax Proxy</h1>

<br>

<h4 align="center">A browser plugin based on Chromium kernel · Tools for Developers · For the modification of web-side response</h4>

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

English | [中文](README.zh.md)

</strong>
</div>

## When to use

- When actual data fails to meet expected results, mocking data is needed.
- In development or production stages, verification of exceptional scenarios or edge cases is necessary.
- The frequent changes in interface data hinder the development process.
- When a certain interface returns a 404 error.

## Installation

The links below point to the published Chrome and Edge builds. The V3 work on this development branch is staging only and is not part of that release. The extension's default panel remains Vue 2; to try the V3 staging panel, load a local development build and explicitly open `chrome-extension://<extension-id>/panels-v3/index.html` (replace `<extension-id>` with the ID shown on the browser's extensions page).

[Microsoft Edge](https://microsoftedge.microsoft.com/addons/detail/ajax-proxy/iladajdkobpmadjfpeginhngnneaoefi)

[Google Chrome](https://chrome.google.com/webstore/detail/ajax-proxy/jbikjaejnjfbloojafllmdiknfndgljo)

## Examples

Video: [https://www.youtube.com/watch?v=F\_\_7LXBqnvQ&list=PLniy0-3-8-V1ZhsmG6\_\_HdOJBAschGWSt](https://www.youtube.com/watch?v=F__7LXBqnvQ&list=PLniy0-3-8-V1ZhsmG6__HdOJBAschGWSt)

<!-- ![interceptor](https://github.com/g0ngjie/ajax-proxy/wiki/images/interceptor-1.png) -->

![operation.gif](media/operation.gif)

![zhihu](https://github.com/g0ngjie/ajax-proxy/wiki/images/zhihu-ajaxproxy.png)

## FAQ

1. Data interception in the published V2 version does not work
   - You can switch between `interceptor` and `redirector` to solve the Ajax referencing problem
     ![issues_checked](https://github.com/g0ngjie/ajax-proxy/wiki/images/issues_checked.png)
   - You can select the `Network` section in Developer Tools and disable caching by checking ☑️
     ![issues_disabled_cache](https://github.com/g0ngjie/ajax-proxy/wiki/images/issues_disabled_cache.png)
2. [Function-based response explanation](README.func.md)
3. **Can I use V2 rules or backups in the V3 staging panel?** No. V2 and V3 configuration and backup formats are incompatible, and there is no automatic migration. Keep your V2 backup and recreate any rules you need in V3. See the [V3 backup and restore guide](docs/V3-BACKUP-RESTORE.zh.md) (Chinese).
4. **What does the V3 staging panel support?** The current staging scope includes redirect and JSON response rule editing, Fetch response functions, tags, and V3 backup and restore. Function responses apply to Fetch; XHR keeps its original response. V2-only redirect features such as substring replacement, headers, ignores, and redirect functions have not been migrated. See the [V3 panel migration notes](docs/V3-PANEL-MIGRATION.zh.md) (Chinese).
5. **Why does a V3 request not match?** Open the `panels-v3/` page, check that the global and site switches are enabled, and confirm the rule's URL and method match. Only the first matching rule runs, in list order. Response functions apply to Fetch; XHR keeps its original response. See the [V3 rule model](docs/V3-RULE-MODEL.zh.md) (Chinese).

## Monorepo

| Package                                                 | Description                                                |
| ------------------------------------------------------- | ---------------------------------------------------------- |
| [@proxy/protocol](./packages/protocol/)                 | Shared V2 / V3 message protocols and types                 |
| [@proxy/v2-compatibility](./packages/v2-compatibility/) | V2 Data Format Conversion Library                          |
| [@proxy/lib](./packages/proxy-lib/)                     | V2 / V3 request matching and Fetch / XHR interception      |
| [@proxy/shared-utils](./packages/shared-utils/)         | Public Class Libraries                                     |
| [@proxy/shell-chrome](./packages/shell-chrome/)         | Browser Extension Library                                  |
| [@proxy/vue-panels](./packages/vue-panels/)             | Application Operator Panel                                 |
| [@proxy/vue3-panels](./packages/vue3-panels/)           | V3 development-staging panel (not the default entry point) |
| [@proxy/v3-domain](./packages/v3-domain/)               | V3 configuration schema and domain logic                   |

## Use of source code

To try the V3 development staging build, use the `refactor/v3` branch. It is not a store release; the extension's default entry point remains the Vue 2 panel, and the V3 panel must be opened explicitly.

Requirements: Node.js `>=24.21.0 <25` and pnpm `12.6`.
V3 staging validation targets the current stable versions of Chrome and Edge.

1. Check out the `refactor/v3` branch and install the locked dependencies:

   ```sh
   git clone --branch refactor/v3 https://github.com/g0ngjie/ajax-proxy.git
   cd ajax-proxy
   pnpm install --frozen-lockfile
   ```

2. Build the extension and both panel outputs:

   ```sh
   pnpm build
   ```

3. In Chrome or Edge, open the extensions page, enable Developer mode, choose **Load unpacked**, and select `packages/shell-chrome/build`.
4. Copy the extension ID from its details page and open `chrome-extension://<extension-id>/panels-v3/index.html` to access the V3 staging panel. The regular extension entry point continues to open `panels/` (Vue 2).

V2 and V3 configuration and backup files are incompatible; this build does not migrate V2 data automatically. For V3 details and current scope, see the [V3 panel migration notes](docs/V3-PANEL-MIGRATION.zh.md) and [backup and restore guide](docs/V3-BACKUP-RESTORE.zh.md) (Chinese).

## Testing

You can test it directly in [Swagger](https://petstore.swagger.io/)

## ⭐ Stargazers

Thanks for your support!

[![Stargazers for ajax-proxy](https://reporoster.com/stars/g0ngjie/ajax-proxy)](https://github.com/g0ngjie/ajax-proxy/stargazers)

## License

Ajax Proxy is [MIT licensed](LICENSE).
