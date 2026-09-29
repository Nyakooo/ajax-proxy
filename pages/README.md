# GitHub Pages content

The standalone Ajax Proxy Playground lives in [`playground/`](playground/). It has no build dependencies and can be published as-is from this directory.

The `Deploy Pages demo` workflow uploads `pages/` as the Pages artifact. After GitHub Pages is enabled with **Settings → Pages → Build and deployment → Source → GitHub Actions**, the demo path is:

`https://nyakooo.github.io/ajax-proxy/playground/`

Until the repository's Pages source is enabled, the demo can be run locally by serving this directory with any static HTTP server and opening `/playground/`.
