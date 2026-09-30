# Changelog

## Ajax Proxy 3.0.2 — 2026-09-30

- Rejected embedded credentials in static redirect URLs and removed original XHR open() credentials when redirecting across origins.
- Fixed body-bearing Fetch Request dispatch, bounded response-function snapshot reads, and hit counts for prototype-property rule IDs.
- Stopped sending V3 rules when the proxy or current site is disabled; omitted disabled rules/actions and removed legacy hit-threshold desktop notifications.
- Added a 5 MiB file check before reading backups and enforced release version, required-file and entry-resource checks before ZIP packaging.
- Made the full panel fill its tab/window and resize responsively, preserving a 700 × 560 px minimum usable layout.
- Fixed #59: regex capture templates now work in static Fetch and XHR redirects, including query strings, named captures and literal dollar escaping. Existing fixed destinations remain unchanged.
- Added bilingual redirect guidance and a Playground scenario for both transports.
- Fixed the production build command and refreshed release download links.

## Ajax Proxy 3.0.1 — 2026-09-29

### Added

- Added a standalone Ajax Proxy Playground with Fetch, XHR, iframe, and response inspection scenarios, plus a GitHub Pages deployment workflow.

### Fixed

- Toolbar hit totals now include enabled rules only and update when rule enablement changes.
- Clarified that Dedicated Worker requests are outside the extension's current interception scope.

## Ajax Proxy 3.0.0 — 2026-09-28

### Added

- Mock requests for endpoints that do not exist yet. Matching Fetch and supported asynchronous XHR requests can receive a configured JSON body and status without reaching a server.
- JSON response rules, request redirection, rule search and filters, pinning, tags, bulk enable / disable, temporary diagnostics, and JSON backup / restore.
- Restricted custom functions for Fetch response generation and Fetch redirection.

### Changed

- The production extension now opens the V3 Vue interface by default.
- V3 uses its own rules and backup format. V2 data is not migrated or converted automatically; export and keep a V2 backup before upgrading.
- The supported browser range is Chrome 141+ and Microsoft Edge 140+ Stable.

### Fixed

- Corrected extension state and toolbar icon synchronization, panel sizing and opening behavior, and rule editor layout issues covered by the V3 functional acceptance record.
- Improved URL matching, rule ordering, and visible diagnostics for applied, mocked, redirected, and unsupported requests.

### Removed

- The production V3 package no longer includes the legacy Vue 2 management panel or V2 data conversion code.

### Known limitations

- V2 substring replacement rules do not have an equivalent V3 feature yet.
- Custom response and redirect functions apply to Fetch only. XHR retains its original response or URL for function rules.
- V2 and V3 rule and backup formats are incompatible. There is no automatic migration; retain a separate V2 backup and recreate needed rules in V3.

## Earlier versions

See the [GitHub releases](https://github.com/Nyakooo/ajax-proxy/releases) for previous version history.
