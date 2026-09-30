<div align="center">
  <img src="docs/brand/ajax-proxy-mark-dark.png" width="76" height="76" alt="Ajax Proxy logo" />
  <h1>Ajax Proxy</h1>
  <p><strong>Shape API responses. Keep development moving.</strong></p>
  <p>Mock missing endpoints, redirect requests, and test edge cases from your Chromium browser.</p>

  <p>
    <a href="https://github.com/Nyakooo/ajax-proxy/actions/workflows/ci.yml?query=branch%3Amaster"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/Nyakooo/ajax-proxy/ci.yml?branch=master&label=CI"></a>
    <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/github/license/Nyakooo/ajax-proxy"></a>
    <a href="https://github.com/Nyakooo/ajax-proxy/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/Nyakooo/ajax-proxy?style=social"></a>
    <a href="https://chrome.google.com/webstore/detail/ajax-proxy/jbikjaejnjfbloojafllmdiknfndgljo"><img alt="Chrome Web Store version" src="https://img.shields.io/chrome-web-store/v/jbikjaejnjfbloojafllmdiknfndgljo?logo=googlechrome&logoColor=white"></a>
    <a href="https://microsoftedge.microsoft.com/addons/detail/ajax-proxy/iladajdkobpmadjfpeginhngnneaoefi"><img alt="Microsoft Edge Add-ons" src="https://img.shields.io/badge/Edge%20Add--ons-available-0078D7?logo=microsoftedge&logoColor=white"></a>
  </p>

  <p><strong>V3.0.2 stable release · Chrome and Microsoft Edge Stable</strong><br>Mock missing APIs, redirect requests, and shape supported Fetch and XHR responses in your browser.</p>
  <p><a href="https://github.com/Nyakooo/ajax-proxy/releases/tag/v3.0.2"><strong>Download Ajax Proxy 3.0.2</strong></a> · <a href="https://chrome.google.com/webstore/detail/ajax-proxy/jbikjaejnjfbloojafllmdiknfndgljo">Chrome Web Store</a> · <a href="https://microsoftedge.microsoft.com/addons/detail/ajax-proxy/iladajdkobpmadjfpeginhngnneaoefi">Edge Add-ons</a></p>
  <p>
    <a href="#install-v3-302"><strong>Install V3.0.2</strong></a> ·
    <a href="docs/V3-RULE-MODEL.zh.md">Rule model</a> ·
    <a href="docs/V3-BACKUP-RESTORE.zh.md">Backup &amp; restore</a> ·
    <a href="https://github.com/Nyakooo/ajax-proxy/issues">Issues</a>
  </p>
  <p>English | <a href="README.zh.md">简体中文</a></p>
</div>

<p align="center">
  <img src="media/ajax-proxy-v3-showcase.svg" alt="Ajax Proxy 3.0.2 matching a request and returning a configured JSON mock response" width="100%">
</p>

## Why Ajax Proxy?

A page can request an API before its backend is ready—or when you need to reproduce a failure that is hard to trigger. Ajax Proxy lets you define the response in the browser, so you can keep building and verify the UI without changing application code or waiting for a server fixture.

## What you can do

- **Mock API responses:** Match a URL and method, then return a configured JSON body and status to Fetch or supported asynchronous XHR calls. The browser request is fulfilled by the extension; the server does not need to implement that endpoint.
- **Redirect requests:** Send matching requests to another URL, add static request headers, exclude selected URLs, or compute a Fetch redirect with a restricted function.
- **Cover edge cases:** Reproduce empty data, validation failures, error statuses, and other response scenarios on demand.
- **Manage rules in context:** Search and filter rules, pin important ones, group with tags, and quickly toggle the extension or rules for the current site. When several rules match, the first enabled match in list order wins.
- **Inspect confirmed outcomes:** Temporarily enable request diagnostics to see whether an action was applied, fell back, failed, or is unsupported.
- **Use functions where needed:** V3 can calculate JSON responses and redirect targets with a restricted sandbox. Function actions apply to Fetch; XHR retains its original response or URL.
- **Back up and restore V3 rules:** Export a portable V3 configuration before moving or resetting your browser profile.

Ajax Proxy runs as a browser extension; it does not require an Ajax Proxy account or hosted service. V3 targets Chrome 141+ and Microsoft Edge 140+ on Stable channels; see the [browser compatibility policy](docs/V3-BROWSER-COMPATIBILITY.zh.md) for the support window.

### Mock an API in a few steps

1. Select the extension icon, open the **full panel** from the popup, and choose **Create rule**.
2. Enter a URL (a URL fragment works) and a request method. Keep `ANY` to match every method.
3. Choose a static JSON response, set **Response behavior** to **Mock: skip the real request**, enter a status and JSON body, then save and enable the rule.
4. Make sure the extension and current-site switches are on, then trigger the matching request from the page. Fetch and supported asynchronous XHR calls receive the configured response without sending a real request.

The panel labels a mock hit **Mock skipped the real network request** and shows the returned status. Use this mode when an endpoint does not exist yet or when you need a fixed response. The regular response-replacement mode sends the real request first and then replaces its response; function responses also need a real response as input and currently apply to Fetch only.

## Install V3 3.0.2

> **Upgrade note:** V2 and V3 rules and backup files use incompatible formats. V3 does not migrate old data. Export and keep a V2 backup before upgrading, then recreate the rules you still need.

Download the `ajax-proxy-3.0.2.zip` asset from the [V3.0.2 GitHub release](https://github.com/Nyakooo/ajax-proxy/releases/tag/v3.0.2), unzip it, and load the extracted folder in Chrome (`chrome://extensions`) or Edge (`edge://extensions`):

1. Turn on **Developer mode**.
2. Select **Load unpacked**.
3. Choose the extracted folder containing `manifest.json`.
4. Open the extension popup and choose **Open full panel** to manage rules.

To build from source, use Node.js `>=24.21.0 <25` and pnpm `12.6`:

```sh
git clone https://github.com/Nyakooo/ajax-proxy.git
cd ajax-proxy
pnpm install --frozen-lockfile
pnpm build
```

The production build is at `packages/shell-chrome/build`. V3 core functionality was validated on Chrome Stable and Microsoft Edge Stable; see the [migration notes](docs/V3-PANEL-MIGRATION.zh.md), [browser compatibility](docs/V3-BROWSER-COMPATIBILITY.zh.md), and [acceptance record](docs/V3-TESTING.zh.md). The store listings may show their previous package until their review is complete.

## Documentation

- [V3 rule model and matching priority](docs/V3-RULE-MODEL.zh.md)
- [V3 backup and restore](docs/V3-BACKUP-RESTORE.zh.md)
- [V3 migration status and known gaps](docs/V3-PANEL-MIGRATION.zh.md)
- [V3 browser compatibility](docs/V3-BROWSER-COMPATIBILITY.zh.md)
- [Ajax Proxy Playground](docs/PLAYGROUND.zh.md)
- [Custom response functions and sandbox limits](docs/V3-USER-FUNCTIONS.zh.md)
- [Permissions and security boundaries](docs/V3-PERMISSIONS.zh.md)
- [Changelog](CHANGELOG.md) · [简体中文更新日志](CHANGELOG.zh.md)
- [Legacy V2 function reference (not for V3)](README.func.md)

Most detailed design and implementation notes are currently maintained in Chinese. The Chrome and Edge links above point to the existing listings; store availability can lag behind the GitHub release while an update is under review.

## Online Playground

Open the [Ajax Proxy Playground](https://nyakooo.github.io/ajax-proxy/playground/) to try Fetch, XHR, iframe, srcdoc, Worker comparison, and other request scenarios in a real browser page. After each click, it shows the latest request URL, status, and response body, with request history kept below so you can check whether a rule took effect.

For a quick check, create an enabled GET rule matching `playground/fixtures/profile.json`, set a clearly distinguishable response body, then click **Send Fetch GET** or **Send XHR JSON**. Compare the displayed response with the hit count in the extension panel. The Worker scenario is a native-request comparison; requests made inside Dedicated Workers are not currently intercepted. See the [Playground guide](docs/PLAYGROUND.zh.md) for all scenarios, rule examples, and local setup.

Regex redirects support `$1`, `$2`, and `$<name>` captures for both Fetch and XHR. See the [redirect guide](docs/REDIRECT-RULES.md) for fixed targets, relative URLs, escaping, and troubleshooting.

## Demo

The animation below shows the **legacy V2 interface** and is kept for historical reference; it is not a screenshot of the V3.0.2 release.

<details>
  <summary>Show the legacy V2 demo</summary>
  <p>See the <a href="https://www.youtube.com/watch?v=F__7LXBqnvQ&list=PLniy0-3-8-V1ZhsmG6__HdOJBAschGWSt">legacy walkthrough videos on YouTube</a>.</p>
  <p><img src="media/operation.gif" alt="Legacy Ajax Proxy V2 interface demo"></p>
</details>

## Contributing

Bug reports and feature proposals are welcome through [GitHub Issues](https://github.com/Nyakooo/ajax-proxy/issues). Include browser and extension versions plus minimal reproduction steps. For larger changes, open an issue first to agree on scope; keep pull requests focused and include user-visible behavior and functional verification. Remove real request data, cookies, tokens, personal information, and private function code before sharing logs or backups. The default branch is `master`.

## License

Ajax Proxy is released under the [MIT License](LICENSE).
