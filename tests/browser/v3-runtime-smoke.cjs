const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { build } = require('vite')
const { chromium } = require('playwright')

const channel = process.env.BROWSER_CHANNEL || 'chromium'
const executablePath = process.env.BROWSER_EXECUTABLE_PATH
const label = process.env.BROWSER_LABEL || channel
const supportedChannels = new Set(['chromium', 'chrome', 'msedge'])

if (!supportedChannels.has(channel)) throw new Error(`Unsupported BROWSER_CHANNEL: ${channel}`)

async function main() {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ajax-proxy-v3-runtime-'))
  const entry = path.resolve(__dirname, '../../packages/proxy-lib/test/v3/runtimeBrowserEntry.ts')
  await build({
    configFile: false,
    logLevel: 'warn',
    build: {
      lib: { entry, name: 'AjaxProxyV3Runtime', formats: ['iife'], fileName: 'v3-runtime' },
      outDir: outputDir,
      emptyOutDir: true,
      minify: false,
    },
  })
  const bundlePath = path.join(outputDir, 'v3-runtime.iife.js')
  assert.ok(fs.existsSync(bundlePath), `Vite did not emit ${bundlePath}`)

  const requests = []
  const server = http.createServer((request, response) => {
    if (request.url === '/') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end('<!doctype html><title>V3 runtime smoke</title>')
      return
    }
    if (request.url === '/favicon.ico') {
      response.writeHead(204)
      response.end()
      return
    }
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      const body = Buffer.concat(chunks).toString()
      requests.push({ url: request.url, method: request.method, body })
      const responseBody = JSON.stringify({
        source: 'server',
        path: request.url,
        method: request.method,
      })
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(responseBody)
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  let browser

  try {
    browser = await chromium.launch({
      channel: executablePath ? undefined : channel,
      executablePath,
      headless: true,
    })
    const page = await browser.newPage()
    await page.goto(`http://127.0.0.1:${port}/`)
    await page.addScriptTag({ path: bundlePath })

    const result = await page.evaluate(async (origin) => {
      const { createV3Fetch, createV3XHR } = window.AjaxProxyV3Runtime
      const fetchRule = {
        id: 'fetch-composite',
        enabled: true,
        match: { url: '/fetch-source', method: 'POST' },
        request: { enabled: true, redirect: { url: '/fetch-target' } },
        response: { enabled: true, replace: { status: 201, body: { source: 'v3-fetch' } } },
      }
      const fetchHits = []
      const fetch = createV3Fetch(window.fetch.bind(window), {
        getRules: () => [fetchRule],
        onMatched: (rule, index) => fetchHits.push({ id: rule.id, index }),
      })
      const fetchResponse = await fetch(`${origin}/fetch-source?original=1`, {
        method: 'POST',
        headers: { 'x-v3-request': 'fetch' },
        body: 'fetch-payload',
      })
      const fetchResponseBody = await fetchResponse.json()

      const xhrRule = {
        id: 'xhr-composite',
        enabled: true,
        match: { url: '/xhr-source', method: 'POST' },
        request: { enabled: true, redirect: { url: '/xhr-target' } },
        response: { enabled: true, replace: { status: 202, body: { source: 'v3-xhr' } } },
      }
      const xhrHits = []
      const XHR = createV3XHR(window.XMLHttpRequest, {
        getRules: () => [xhrRule],
        onMatched: (rule, index) => xhrHits.push({ id: rule.id, index }),
      })
      const xhrResult = await new Promise((resolve, reject) => {
        const xhr = new XHR()
        xhr.open('POST', `${origin}/xhr-source?original=1`, true, 'user', 'password')
        xhr.onloadend = function (event) {
          resolve({
            status: xhr.status,
            responseText: xhr.responseText,
            responseType: xhr.responseType,
            openTargetPath: new URL(xhr.responseURL).pathname,
            listenerThisIsProxy: this === xhr,
            targetIsProxy: event.target === xhr,
            currentTargetIsProxy: event.currentTarget === xhr,
          })
        }
        xhr.onerror = () => reject(new Error('V3 XHR request failed'))
        xhr.send('xhr-payload')
      })
      const jsonXhrRule = {
        id: 'xhr-json-composite',
        enabled: true,
        match: { url: '/xhr-json-source', method: 'POST' },
        request: { enabled: true, redirect: { url: '/xhr-json-target' } },
        response: { enabled: true, replace: { status: 203, body: { source: 'v3-xhr-json' } } },
      }
      const JsonXHR = createV3XHR(window.XMLHttpRequest, {
        getRules: () => [jsonXhrRule],
      })
      const jsonXhrResult = await new Promise((resolve, reject) => {
        const xhr = new JsonXHR()
        xhr.responseType = 'json'
        xhr.open('POST', `${origin}/xhr-json-source`, true)
        xhr.onloadend = function (event) {
          let responseTextError = ''
          try {
            void xhr.responseText
          } catch (error) {
            responseTextError = error.name
          }
          resolve({
            status: xhr.status,
            response: xhr.response,
            responseTextError,
            targetIsProxy: event.target === xhr,
          })
        }
        xhr.onerror = () => reject(new Error('V3 JSON XHR request failed'))
        xhr.send('json-payload')
      })

      return {
        fetch: {
          status: fetchResponse.status,
          url: fetchResponse.url,
          body: fetchResponseBody,
          hits: fetchHits,
        },
        xhr: { ...xhrResult, hits: xhrHits },
        jsonXhr: jsonXhrResult,
      }
    }, `http://127.0.0.1:${port}`)

    assert.equal(result.fetch.status, 201)
    assert.equal(result.fetch.url, `http://127.0.0.1:${port}/fetch-target`)
    assert.deepEqual(result.fetch.body, { source: 'v3-fetch' })
    assert.deepEqual(result.fetch.hits, [{ id: 'fetch-composite', index: 0 }])
    assert.equal(result.xhr.status, 202)
    assert.equal(result.xhr.responseText, '{"source":"v3-xhr"}')
    assert.equal(result.xhr.openTargetPath, '/xhr-target')
    assert.equal(result.xhr.listenerThisIsProxy, true)
    assert.equal(result.xhr.targetIsProxy, true)
    assert.equal(result.xhr.currentTargetIsProxy, true)
    assert.deepEqual(result.xhr.hits, [{ id: 'xhr-composite', index: 0 }])
    assert.equal(result.jsonXhr.status, 203)
    assert.deepEqual(result.jsonXhr.response, { source: 'v3-xhr-json' })
    assert.equal(result.jsonXhr.responseTextError, 'InvalidStateError')
    assert.equal(result.jsonXhr.targetIsProxy, true)
    assert.deepEqual(requests, [
      { url: '/fetch-target', method: 'POST', body: 'fetch-payload' },
      { url: '/xhr-target', method: 'POST', body: 'xhr-payload' },
      { url: '/xhr-json-target', method: 'POST', body: 'json-payload' },
    ])

    console.log(`${label} ${browser.version()} V3 Fetch/XHR runtime smoke passed`)
  } finally {
    await browser?.close()
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
    fs.rmSync(outputDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
