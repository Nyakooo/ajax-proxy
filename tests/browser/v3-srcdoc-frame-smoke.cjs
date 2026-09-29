const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { chromium } = require('playwright')

const extensionPath = path.resolve(__dirname, '../../packages/shell-chrome/build')
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ajax-proxy-srcdoc-'))
const server = http.createServer((request, response) => {
  if (request.url === '/') {
    response.writeHead(200, { 'content-type': 'text/html' })
    response.end(
      '<!doctype html><iframe srcdoc="<!doctype html><html><head></head><body></body></html>"></iframe>'
    )
    return
  }
  response.writeHead(200, { 'content-type': 'application/json' })
  response.end(JSON.stringify({ source: 'server' }))
})

async function main() {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  let context
  try {
    context = await chromium.launchPersistentContext(profile, {
      executablePath: process.env.BROWSER_EXECUTABLE_PATH || chromium.executablePath(),
      headless: true,
      ignoreDefaultArgs: ['--disable-extensions'],
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    })
    const worker =
      context.serviceWorkers()[0] ||
      (await context.waitForEvent('serviceworker', { timeout: 10000 }))
    await worker.evaluate(async () => {
      await chrome.storage.local.set({
        'ajax-proxy:storage:v3-config': {
          format: 'ajax-proxy-backup',
          formatVersion: 9,
          settings: { globalEnabled: true, mode: 'interceptor', language: 'en' },
          tags: [],
          disabledOrigins: [],
          rules: [
            {
              id: 'srcdoc-rule',
              enabled: true,
              match: { url: '/api/query', method: 'POST', type: 'normal' },
              response: {
                enabled: true,
                replace: { status: 202, body: { source: 'mock' } },
              },
            },
          ],
        },
      })
    })
    const page = await context.newPage()
    await page.goto(`http://127.0.0.1:${server.address().port}/`)
    const frame = page.frames().find((candidate) => candidate !== page.mainFrame())
    assert.ok(frame, 'srcdoc frame should exist')
    const origins = await frame.evaluate(() => ({
      location: location.origin,
      security: window.origin,
    }))
    assert.equal(origins.location, 'null')
    assert.equal(origins.security, new URL(page.url()).origin)
    await page.waitForFunction(() => {
      const frame = document.querySelector('iframe')
      return (
        frame &&
        !Function.prototype.toString
          .call(frame.contentWindow.XMLHttpRequest)
          .includes('[native code]')
      )
    })
    const result = await frame.evaluate(
      () =>
        new Promise((resolve) => {
          const xhr = new XMLHttpRequest()
          xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText })
          xhr.open('POST', '/api/query')
          xhr.send('{}')
        })
    )
    assert.deepEqual(result, { status: 202, body: JSON.stringify({ source: 'mock' }) })

    let hits = {}
    for (let attempt = 0; attempt < 40; attempt += 1) {
      hits = await worker.evaluate(async () => {
        return (
          (await chrome.storage.local.get('ajax-proxy:storage:v3-hits'))[
            'ajax-proxy:storage:v3-hits'
          ] || {}
        )
      })
      if (hits['srcdoc-rule'] === 1) break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    assert.equal(hits['srcdoc-rule'], 1)
    console.log('V3 srcdoc XHR replacement and hit counter smoke passed')
  } finally {
    if (context) await context.close()
    await new Promise((resolve) => server.close(resolve))
    fs.rmSync(profile, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
