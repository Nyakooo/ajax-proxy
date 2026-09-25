const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { chromium } = require('playwright')

const extensionPath = path.resolve(__dirname, '../../packages/shell-chrome/build')

async function main() {
  const server = http.createServer((request, response) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(
        JSON.stringify({ method: request.method, body: Buffer.concat(chunks).toString() })
      )
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ajax-proxy-v3-function-'))
  const contextOptions = {
    channel: process.env.BROWSER_EXECUTABLE_PATH ? undefined : 'chromium',
    executablePath: process.env.BROWSER_EXECUTABLE_PATH,
    headless: process.env.EXTENSION_SMOKE_HEADLESS !== '0',
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  }
  let context

  try {
    context = await chromium.launchPersistentContext(userDataDir, contextOptions)
    const serviceWorker =
      context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'))
    const extensionId = new URL(serviceWorker.url()).host
    const extensionPage = await context.newPage()
    await extensionPage.goto(`chrome-extension://${extensionId}/panels-v3/index.html`)
    const configKey = 'ajax-proxy:storage:v3-config'
    const code =
      'return { status: 209, body: { request: request.body, response: JSON.parse(response.body) } }'
    const rule = {
      id: 'v3-function-smoke',
      enabled: true,
      match: { url: '/api', method: 'POST' },
      response: { enabled: true, replace: { code } },
    }
    await extensionPage.evaluate(
      async ({ key, rule }) => {
        await chrome.storage.local.set({
          [key]: {
            format: 'ajax-proxy-backup',
            formatVersion: 3,
            settings: { globalEnabled: true, mode: 'interceptor', language: 'en' },
            tags: [],
            rules: [rule],
          },
        })
      },
      { key: configKey, rule }
    )
    await extensionPage.reload()
    await extensionPage.locator('.rule-row').waitFor()
    await extensionPage.evaluate(() => {
      window.__v3FunctionNotices = []
      chrome.runtime.onMessage.addListener((message) => {
        if (message?.key === 'ajax-proxy:notice:v3-function-error') {
          window.__v3FunctionNotices.push(message)
        }
      })
    })

    const page = await context.newPage()
    await page.goto(`http://127.0.0.1:${port}/`)
    await page.waitForFunction(() =>
      Boolean(document.getElementById('ajax-proxy-v3-function-sandbox'))
    )
    const fetchResult = await page.evaluate(async () => {
      const response = await fetch('/api', { method: 'POST', body: 'snapshot request' })
      return { status: response.status, body: await response.json() }
    })
    assert.deepEqual(fetchResult, {
      status: 209,
      body: {
        request: 'snapshot request',
        response: { method: 'POST', body: 'snapshot request' },
      },
    })

    const xhrResult = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const request = new XMLHttpRequest()
          request.onload = () =>
            resolve({ status: request.status, body: JSON.parse(request.responseText) })
          request.open('POST', '/api')
          request.send('XHR remains native')
        })
    )
    assert.deepEqual(xhrResult, {
      status: 200,
      body: { method: 'POST', body: 'XHR remains native' },
    })

    await extensionPage.evaluate(async (key) => {
      const config = (await chrome.storage.local.get(key))[key]
      config.rules[0].response.replace.code = 'return { unsupported: true }'
      await chrome.storage.local.set({ [key]: config })
    }, configKey)
    await page.reload()
    await page.waitForFunction(() =>
      Boolean(document.getElementById('ajax-proxy-v3-function-sandbox'))
    )
    const failOpenResult = await page.evaluate(async () => {
      const response = await fetch('/api', { method: 'POST', body: 'native fallback' })
      return { status: response.status, body: await response.json() }
    })
    assert.deepEqual(failOpenResult, {
      status: 200,
      body: { method: 'POST', body: 'native fallback' },
    })
    await extensionPage.waitForFunction(() => window.__v3FunctionNotices.length > 0, null, {
      timeout: 5000,
    })
    assert.equal(
      await extensionPage.evaluate(() => window.__v3FunctionNotices.at(-1).value.code),
      'invalid-result'
    )
    await extensionPage
      .getByText('The function returned an invalid result; the original response was used.', {
        exact: true,
      })
      .waitFor({ timeout: 5000 })

    await extensionPage.evaluate(async (key) => {
      const config = (await chrome.storage.local.get(key))[key]
      config.rules[0].response.replace.code = 'while (true) {}'
      await chrome.storage.local.set({ [key]: config })
    }, configKey)
    await page.reload()
    await page.waitForFunction(() =>
      Boolean(document.getElementById('ajax-proxy-v3-function-sandbox'))
    )
    await page.evaluate(() => {
      window.__v3OldSandboxFrame = document.getElementById('ajax-proxy-v3-function-sandbox')
    })
    const timeoutFallback = await page.evaluate(async () => {
      const response = await fetch('/api', { method: 'POST', body: 'timeout fallback' })
      return { status: response.status, body: await response.json() }
    })
    assert.deepEqual(timeoutFallback, {
      status: 200,
      body: { method: 'POST', body: 'timeout fallback' },
    })
    await page.waitForFunction(
      () =>
        Boolean(document.getElementById('ajax-proxy-v3-function-sandbox')) &&
        document.getElementById('ajax-proxy-v3-function-sandbox') !== window.__v3OldSandboxFrame,
      null,
      { timeout: 10000 }
    )
    await extensionPage
      .getByText(
        'The function exceeded 5 seconds and was stopped; the original response was used.',
        {
          exact: true,
        }
      )
      .waitFor()

    console.log(
      'V3 response function smoke passed: Fetch snapshots and replacement, XHR pass-through, visible invalid-result and timeout diagnostics, fail-open, sandbox recreation'
    )
  } finally {
    await context?.close()
    fs.rmSync(userDataDir, { recursive: true, force: true })
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
