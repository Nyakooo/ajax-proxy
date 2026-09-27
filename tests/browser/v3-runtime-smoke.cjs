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
  const crossOriginRequests = []
  const preflights = []
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
      requests.push({
        url: request.url,
        method: request.method,
        body,
        headers: request.headers,
      })
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
  const crossOriginServer = http.createServer((request, response) => {
    const origin = request.headers.origin
    if (request.method === 'OPTIONS') {
      preflights.push({
        url: request.url,
        origin,
        method: request.headers['access-control-request-method'],
        headers: request.headers['access-control-request-headers'],
      })
      response.writeHead(204, {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': request.headers['access-control-request-headers'] || '',
        'access-control-max-age': '0',
      })
      response.end()
      return
    }
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      crossOriginRequests.push({
        url: request.url,
        method: request.method,
        body: Buffer.concat(chunks).toString(),
        headers: request.headers,
        origin,
      })
      response.writeHead(200, {
        'access-control-allow-origin': origin,
        'content-type': 'application/json',
      })
      response.end(JSON.stringify({ source: 'cross-origin-server', path: request.url }))
    })
  })
  await new Promise((resolve) => crossOriginServer.listen(0, '127.0.0.1', resolve))
  const crossOriginPort = crossOriginServer.address().port
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

    const runtimeOrigins = [`http://127.0.0.1:${port}`, `http://127.0.0.1:${crossOriginPort}`]
    const result = await page.evaluate(async ([origin, crossOrigin]) => {
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

      const fetchHeaderRule = {
        id: 'fetch-redirect-headers',
        enabled: true,
        match: { url: '/fetch-header-source', method: 'POST' },
        request: {
          enabled: true,
          redirect: {
            url: '/fetch-header-target',
            headers: {
              'x-v3-override': 'fetch-configured',
              'x-v3-empty': '',
              'x-v3-added': 'fetch-added',
            },
          },
        },
      }
      const fetchWithHeaders = createV3Fetch(window.fetch.bind(window), {
        getRules: () => [fetchHeaderRule],
      })
      await fetchWithHeaders(`${origin}/fetch-header-source`, {
        method: 'POST',
        headers: {
          'x-v3-override': 'fetch-page',
          'x-v3-keep': 'fetch-kept',
        },
        body: 'fetch-header-payload',
      })

      const xhrHeaderRule = {
        id: 'xhr-redirect-headers',
        enabled: true,
        match: { url: '/xhr-header-source', method: 'POST' },
        request: {
          enabled: true,
          redirect: {
            url: '/xhr-header-target',
            headers: {
              'x-v3-override': 'xhr-configured',
              'x-v3-empty': '',
              'x-v3-added': 'xhr-added',
            },
          },
        },
      }
      const XHRWithHeaders = createV3XHR(window.XMLHttpRequest, {
        getRules: () => [xhrHeaderRule],
      })
      await new Promise((resolve, reject) => {
        const xhr = new XHRWithHeaders()
        xhr.open('POST', `${origin}/xhr-header-source`, true)
        xhr.setRequestHeader('x-v3-override', 'xhr-page')
        xhr.setRequestHeader('x-v3-keep', 'xhr-kept')
        xhr.onloadend = resolve
        xhr.onerror = () => reject(new Error('V3 XHR redirect header request failed'))
        xhr.send('xhr-header-payload')
      })

      const crossOriginFetchRule = {
        id: 'fetch-cross-origin-redirect-headers',
        enabled: true,
        match: { url: '/fetch-cross-origin-source', method: 'POST' },
        request: {
          enabled: true,
          redirect: {
            url: `${crossOrigin}/fetch-cross-origin-target`,
            headers: {
              authorization: 'configured-fetch-token',
              'x-v3-cross-origin': 'fetch-configured',
            },
          },
        },
      }
      const fetchCrossOrigin = createV3Fetch(window.fetch.bind(window), {
        getRules: () => [crossOriginFetchRule],
      })
      const crossOriginFetchResponse = await fetchCrossOrigin(
        `${origin}/fetch-cross-origin-source`,
        {
          method: 'POST',
          headers: {
            authorization: 'caller-fetch-token',
            'x-v3-cross-origin': 'fetch-page',
          },
          body: 'fetch-cross-origin-payload',
        }
      )
      const crossOriginFetchBody = await crossOriginFetchResponse.json()

      const crossOriginXhrRule = {
        id: 'xhr-cross-origin-redirect-headers',
        enabled: true,
        match: { url: '/xhr-cross-origin-source', method: 'POST' },
        request: {
          enabled: true,
          redirect: {
            url: `${crossOrigin}/xhr-cross-origin-target`,
            headers: {
              authorization: 'configured-xhr-token',
              'x-v3-cross-origin': 'xhr-configured',
            },
          },
        },
      }
      const XHRCrossOrigin = createV3XHR(window.XMLHttpRequest, {
        getRules: () => [crossOriginXhrRule],
      })
      const crossOriginXhrResult = await new Promise((resolve, reject) => {
        const xhr = new XHRCrossOrigin()
        xhr.open('POST', `${origin}/xhr-cross-origin-source`, true)
        xhr.setRequestHeader('authorization', 'caller-xhr-token')
        xhr.setRequestHeader('x-v3-cross-origin', 'xhr-page')
        xhr.onloadend = () => resolve({ status: xhr.status, responseText: xhr.responseText })
        xhr.onerror = () => reject(new Error('V3 cross-origin XHR request failed CORS'))
        xhr.send('xhr-cross-origin-payload')
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
        crossOriginFetch: {
          status: crossOriginFetchResponse.status,
          body: crossOriginFetchBody,
        },
        crossOriginXhr: crossOriginXhrResult,
      }
    }, runtimeOrigins)

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
    assert.equal(result.crossOriginFetch.status, 200)
    assert.deepEqual(result.crossOriginFetch.body, {
      source: 'cross-origin-server',
      path: '/fetch-cross-origin-target',
    })
    assert.equal(result.crossOriginXhr.status, 200)
    assert.deepEqual(JSON.parse(result.crossOriginXhr.responseText), {
      source: 'cross-origin-server',
      path: '/xhr-cross-origin-target',
    })
    assert.deepEqual(
      requests.map(({ url, method, body }) => ({ url, method, body })),
      [
        { url: '/fetch-target', method: 'POST', body: 'fetch-payload' },
        { url: '/xhr-target', method: 'POST', body: 'xhr-payload' },
        { url: '/xhr-json-target', method: 'POST', body: 'json-payload' },
        { url: '/fetch-header-target', method: 'POST', body: 'fetch-header-payload' },
        { url: '/xhr-header-target', method: 'POST', body: 'xhr-header-payload' },
      ]
    )
    for (const [index, expected] of [
      [3, { override: 'fetch-configured', empty: '', added: 'fetch-added', keep: 'fetch-kept' }],
      [4, { override: 'xhr-configured', empty: '', added: 'xhr-added', keep: 'xhr-kept' }],
    ]) {
      const { headers } = requests[index]
      assert.equal(headers['x-v3-override'], expected.override)
      assert.equal(headers['x-v3-empty'], expected.empty)
      assert.equal(headers['x-v3-added'], expected.added)
      assert.equal(headers['x-v3-keep'], expected.keep)
    }
    assert.deepEqual(
      crossOriginRequests.map(({ url, method, body }) => ({ url, method, body })),
      [
        { url: '/fetch-cross-origin-target', method: 'POST', body: 'fetch-cross-origin-payload' },
        { url: '/xhr-cross-origin-target', method: 'POST', body: 'xhr-cross-origin-payload' },
      ]
    )
    assert.deepEqual(
      crossOriginRequests.map(({ headers }) => ({
        authorization: headers.authorization,
        configured: headers['x-v3-cross-origin'],
      })),
      [
        { authorization: undefined, configured: 'fetch-configured' },
        { authorization: undefined, configured: 'xhr-configured' },
      ]
    )
    assert.equal(preflights.length, 2)
    for (const preflight of preflights) {
      assert.equal(preflight.method, 'POST')
      assert.match(preflight.headers, /x-v3-cross-origin/)
      assert.doesNotMatch(preflight.headers, /authorization/)
    }

    console.log(`${label} ${browser.version()} V3 Fetch/XHR runtime smoke passed`)
  } finally {
    await browser?.close()
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
    await new Promise((resolve, reject) => {
      crossOriginServer.close((error) => (error ? reject(error) : resolve()))
    })
    fs.rmSync(outputDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
