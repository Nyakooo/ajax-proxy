const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { build } = require('vite')
const { chromium } = require('playwright')

async function main() {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ajax-proxy-playground-'))
  const root = path.resolve(__dirname, '../../pages')
  const errors = []
  const requests = []
  await build({
    configFile: false,
    logLevel: 'warn',
    build: {
      lib: {
        entry: path.resolve(__dirname, '../../packages/proxy-lib/test/v3/runtimeBrowserEntry.ts'),
        name: 'PlaygroundRuntime',
        formats: ['iife'],
        fileName: 'runtime',
      },
      outDir: out,
      minify: false,
    },
  })
  const server = http.createServer((req, res) => {
    requests.push(req.url)
    const pathname = new URL(req.url, 'http://localhost').pathname
    const file = path.join(root, pathname.endsWith('/') ? pathname + 'index.html' : pathname)
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) {
      res.writeHead(404)
      res.end('Not found')
      return
    }
    res.setHeader(
      'content-type',
      file.endsWith('.html')
        ? 'text/html'
        : file.endsWith('.js')
          ? 'text/javascript'
          : 'application/json'
    )
    res.end(fs.readFileSync(file))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}/playground/`
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    page.on('pageerror', (error) => errors.push(error.message))
    for (const key of ['mock', 'replace', 'redirect', 'method']) {
      await page.goto(base + '?case=' + key)
      await page.addScriptTag({ path: path.join(out, 'runtime.iife.js') })
      assert.equal(await page.locator('#example-case').inputValue(), key)
      const validation = await page.evaluate(() => {
        const runtime = window.AjaxProxyV3Runtime
        const parsed = runtime.parseV3BackupJson(document.getElementById('example-json').value)
        if (!parsed.ok) return parsed
        window.fetch = runtime.createV3Fetch(window.fetch.bind(window), {
          getRules: () => parsed.data.rules,
        })
        window.XMLHttpRequest = runtime.createV3XHR(window.XMLHttpRequest, {
          getRules: () => parsed.data.rules,
        })
        return { ok: true }
      })
      assert.deepEqual(validation, { ok: true })
      for (const transport of ['fetch', 'xhr']) {
        await page.locator(`[data-run="example-${transport}"]`).click()
        await page.waitForFunction(
          (label) => document.getElementById('live-description').textContent.includes(label),
          transport === 'fetch' ? 'Fetch' : 'XHR'
        )
        const body = await page.locator('#live-body').textContent()
        assert.match(
          body,
          new RegExp(
            key === 'mock'
              ? 'playground-mock'
              : key === 'replace'
                ? 'playground-replace'
                : key === 'redirect'
                  ? 'redirect-target'
                  : '"fixture": "profile"'
          )
        )
        if (key === 'redirect')
          assert.match(
            await page.locator('#live-url').textContent(),
            /redirect-target\.json\?case=example-redirect&page=1$/
          )
        if (key === 'replace') assert.match(await page.locator('#live-status').textContent(), /201/)
      }
    }
    assert.ok(
      !requests.some((url) => url.includes('missing.json?case=example-mock')),
      'Mock must skip the network'
    )
    await page.goto(base + '?case=redirect')
    await page.locator('#copy-example').click()
    await page.waitForFunction(
      () => document.getElementById('example-copy-status').textContent.length > 0
    )
    assert.match(await page.locator('#example-copy-status').textContent(), /已复制|已选中/)
    const download = page.waitForEvent('download')
    await page.locator('#download-example').click()
    assert.equal((await download).suggestedFilename(), 'ajax-proxy-playground-redirect.json')
    await page.locator('#example-json').evaluate((input) => {
      input.closest('details').open = false
    })
    await page.evaluate(() => window.scrollTo(0, 0))
    const screenshotDir = process.env.PLAYGROUND_SCREENSHOTS
    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: 900 })
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `No overflow at ${width}px`
      )
      if (screenshotDir) {
        fs.mkdirSync(screenshotDir, { recursive: true })
        await page.screenshot({
          path: path.join(screenshotDir, `playground-${width}.png`),
          fullPage: false,
        })
      }
    }
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.evaluate(() => window.scrollTo(0, 1200))
    const pinned = await page.locator('.live-card').evaluate((card) => {
      const rect = card.getBoundingClientRect()
      return { top: rect.top, bottom: rect.bottom, position: getComputedStyle(card).position }
    })
    assert.equal(pinned.position, 'sticky')
    assert.ok(
      pinned.top >= 15 && pinned.top <= 17 && pinned.bottom <= 900,
      'Response stays visible while scrolling'
    )
    if (screenshotDir)
      await page.screenshot({ path: path.join(screenshotDir, 'playground-scroll.png') })
    assert.deepEqual(errors, [])
    console.log(
      'Playground: 4 valid importable examples, Fetch/XHR results, redirect query, Mock network skip, copy/download and desktop/mobile layout passed.'
    )
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
    fs.rmSync(out, { recursive: true, force: true })
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
