# Redirect rule guide

V3 3.0.2 restores regex capture replacement for static Fetch and XHR redirects (issue #59). No function is required.

- Normal / exact match: a fixed destination; no substring replacement or automatic path/query copying.
- Regex without a replacement token: a fixed destination, preserving existing V3 behavior.
- Regex with a token: replace the first match in the original full URL using RE2JS. Unmatched prefix/suffix remain; anchor full URLs with `^` and `$` to avoid unintended destinations.
- Relative destinations resolve against the original request URL. Only HTTP(S) destinations without embedded usernames or passwords are supported.

Example: match `^https://www\.jingxuesiyingyu\.com/api/(.*)$`, destination `https://api.prod.com/$1`. A request to `https://www.jingxuesiyingyu.com/api/user/list?page=1` goes to `https://api.prod.com/user/list?page=1` in both Fetch and XHR. The capture includes the query; omitted query text is not copied automatically. Enter the pattern without slash delimiters; escape backslashes in JSON backups.

Templates support `$1`, `$2`, numbered captures, `$<name>`, `$&`, `$$`, dollar-backtick (prefix), and `$'` (suffix). Unmatched optional groups become empty; nonexistent references remain literal under RE2JS semantics. Use `$$1` or `%241` for a literal `$1` in regex mode. Normal / exact targets remain literal.

Check global/rule/action switches, method, priority and exclusions first. Match analysis explains rule selection; use Network to verify the actual destination. RE2 is case insensitive and does not support lookaround or regex backreferences; destination capture templates are supported. CORS and preflight still apply, cross-origin sensitive headers are stripped, and method/body are preserved. A target failure before dispatch falls back to the original request; network failures after dispatch are not retried. Function redirects remain Fetch-only. Existing backups need no schema change.

Try the regex redirect scenario in the [Playground](../pages/playground/index.html).
