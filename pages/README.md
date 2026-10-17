# GitHub Pages content

The standalone Ajax Proxy Playground lives in [`playground/`](playground/). It has no build dependencies and can be published as-is from this directory.

The public privacy policy is available at both the existing Chrome Web Store URL and a versioned URL:

`https://nyakooo.github.io/ajax-proxy/privacy/`

`https://nyakooo.github.io/ajax-proxy/privacy/classic-3.1.0/`

Both pages contain the same bilingual policy. Keep them in sync when the policy changes. The versioned page identifies the classic 3.1.0 store listing; the existing URL remains available so current store links continue to work.

The `Deploy Pages demo` workflow uploads `pages/` as the Pages artifact. After GitHub Pages is enabled with **Settings → Pages → Build and deployment → Source → GitHub Actions**, the demo path is:

`https://nyakooo.github.io/ajax-proxy/playground/`

Until the repository's Pages source is enabled, the demo can be run locally by serving this directory with any static HTTP server and opening `/playground/`.
