const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { chromium } = require('playwright')

const extensionPath = path.resolve(__dirname, '../../packages/shell-chrome/build')
const manifest = JSON.parse(fs.readFileSync(path.join(extensionPath, 'manifest.json'), 'utf8'))
const sandboxPath = 'v3-sandbox/sandbox.html'
const channel = 'ajax-proxy-v3-function-sandbox'
const csp = manifest.content_security_policy?.sandbox || ''

assert.deepEqual(manifest.sandbox?.pages, [sandboxPath])
assert.match(csp, /sandbox allow-scripts(?:;|$)/)
assert.doesNotMatch(csp, /allow-same-origin/)
assert.match(csp, /script-src 'self' 'unsafe-eval'/)
assert.match(csp, /worker-src blob:/)
assert.match(csp, /connect-src 'none'/)
assert.match(csp, /form-action 'none'/)
assert.doesNotMatch(csp, /allow-forms|allow-popups|allow-top-navigation/)
assert.ok(
  manifest.web_accessible_resources?.some(
    (entry) => entry.resources.includes(sandboxPath) && entry.matches.includes('<all_urls>')
  ),
  'sandbox page must be web accessible to ordinary web frames'
)

async function addSandbox(host, extensionId) {
  await host.evaluate(
    ({ extensionId, channel }) => {
      const frame = document.createElement('iframe')
      frame.id = 'ajax-proxy-v3-function-sandbox'
      frame.src = `chrome-extension://${extensionId}/v3-sandbox/sandbox.html`
      frame.hidden = true
      frame.setAttribute('aria-hidden', 'true')
      window.__v3SandboxMessages = []
      window.addEventListener('message', (event) => {
        if (event.source === frame.contentWindow && event.data?.channel === channel) {
          window.__v3SandboxMessages.push(event.data)
        }
      })
      document.documentElement.append(frame)
    },
    { extensionId, channel }
  )
  const frame = host.frameLocator('#ajax-proxy-v3-function-sandbox')
  await host.waitForFunction(
    ({ channel }) =>
      window.__v3SandboxMessages?.some(
        (message) => message.channel === channel && message.type === 'ready'
      ),
    { channel },
    { timeout: 10000 }
  )
  return frame
}

async function run(host, id, code, request = {}, response = {}) {
  const previousResultCount = await host.evaluate(
    ({ channel, id }) =>
      window.__v3SandboxMessages?.filter(
        (message) => message.channel === channel && message.type === 'result' && message.id === id
      ).length || 0,
    { channel, id }
  )
  await host.evaluate(
    ({ channel, id, code, request, response }) => {
      const frame = document.getElementById('ajax-proxy-v3-function-sandbox')
      frame.contentWindow.postMessage({ channel, type: 'run', id, code, request, response }, '*')
    },
    { channel, id, code, request, response }
  )
  await host.waitForFunction(
    ({ channel, id, previousResultCount }) =>
      (window.__v3SandboxMessages?.filter(
        (message) => message.channel === channel && message.type === 'result' && message.id === id
      ).length || 0) > previousResultCount,
    { channel, id, previousResultCount },
    { timeout: 10000 }
  )
  return host.evaluate(
    ({ channel, id }) =>
      window.__v3SandboxMessages
        .filter(
          (message) => message.channel === channel && message.type === 'result' && message.id === id
        )
        .at(-1),
    { channel, id }
  )
}

async function runConcurrent(host, requests) {
  const previousCounts = await host.evaluate(
    ({ channel, requests }) =>
      Object.fromEntries(
        requests.map(({ id }) => [
          id,
          window.__v3SandboxMessages?.filter(
            (message) =>
              message.channel === channel && message.type === 'result' && message.id === id
          ).length || 0,
        ])
      ),
    { channel, requests }
  )
  await host.evaluate(
    ({ channel, requests }) => {
      const frame = document.getElementById('ajax-proxy-v3-function-sandbox')
      for (const request of requests) {
        frame.contentWindow.postMessage(
          { channel, type: 'run', request: {}, response: {}, ...request },
          '*'
        )
      }
    },
    { channel, requests }
  )
  await host.waitForFunction(
    ({ channel, requests, previousCounts }) =>
      requests.every(
        ({ id }) =>
          (window.__v3SandboxMessages?.filter(
            (message) =>
              message.channel === channel && message.type === 'result' && message.id === id
          ).length || 0) > previousCounts[id]
      ),
    { channel, requests, previousCounts },
    { timeout: 10000 }
  )
  return host.evaluate(
    ({ channel, requests }) =>
      requests.map(({ id }) =>
        window.__v3SandboxMessages
          .filter(
            (message) =>
              message.channel === channel && message.type === 'result' && message.id === id
          )
          .at(-1)
      ),
    { channel, requests }
  )
}

async function main() {
  let networkRequests = 0
  const server = http.createServer((request, response) => {
    if (request.url === '/page') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end('<!doctype html><title>Sandbox host</title><main>host ready</main>')
      return
    }
    if (request.url === '/network-probe') networkRequests += 1
    response.writeHead(200, { 'content-type': 'text/plain' })
    response.end('unexpected network access')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ajax-proxy-v3-sandbox-'))
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

    const extensionHost = await context.newPage()
    await extensionHost.goto(`chrome-extension://${extensionId}/panels/index.html`)
    await addSandbox(extensionHost, extensionId)
    const extensionIsolation = await extensionHost
      .frameLocator('#ajax-proxy-v3-function-sandbox')
      .locator('body')
      .evaluate(() => ({
        origin: self.origin,
        hasChromeRuntime: typeof chrome !== 'undefined' && Boolean(chrome.runtime),
        parentDomBlocked: (() => {
          try {
            return parent.document === document
          } catch {
            return true
          }
        })(),
      }))
    assert.equal(extensionIsolation.origin, 'null')
    assert.equal(extensionIsolation.hasChromeRuntime, false)
    assert.equal(extensionIsolation.parentDomBlocked, true)
    const extensionResult = await run(
      extensionHost,
      'extension-echo',
      'return { request, status: response.status, ok: true }',
      { path: '/api/items' },
      { status: 202 }
    )
    assert.deepEqual(extensionResult, {
      channel,
      type: 'result',
      id: 'extension-echo',
      ok: true,
      result: { request: { path: '/api/items' }, status: 202, ok: true },
    })

    const nonSerializableInput = await extensionHost.evaluate(
      ({ channel }) => {
        const frame = document.getElementById('ajax-proxy-v3-function-sandbox')
        try {
          frame.contentWindow.postMessage(
            {
              channel,
              type: 'run',
              id: 'nonserializable-input',
              code: 'return 1',
              request: () => {},
              response: {},
            },
            '*'
          )
          return null
        } catch (error) {
          return error.name
        }
      },
      { channel }
    )
    assert.equal(nonSerializableInput, 'DataCloneError')
    const nonSerializableOutput = await run(
      extensionHost,
      'nonserializable-output',
      'return () => 1'
    )
    assert.equal(nonSerializableOutput.ok, false)
    assert.match(nonSerializableOutput.error, /JSON serializable/)

    const networkResult = await run(
      extensionHost,
      'network-block',
      "return fetch('http://127.0.0.1:${port}/network-probe').then(() => ({ allowed: true }), () => ({ allowed: false }))"
    )
    assert.deepEqual(networkResult.result, { allowed: false })
    await new Promise((resolve) => setTimeout(resolve, 100))
    assert.equal(networkRequests, 0)

    const concurrentResults = await runConcurrent(
      extensionHost,
      Array.from({ length: 5 }, (_, index) => ({
        id: `concurrency-${index}`,
        code: 'return new Promise(() => {})',
      }))
    )
    assert.equal(concurrentResults[4].ok, false)
    assert.match(concurrentResults[4].error, /concurrency limit/i)
    for (const result of concurrentResults.slice(0, 4)) {
      assert.equal(result.ok, false)
      assert.match(result.error, /timed out/i)
    }

    const selfClose = await run(
      extensionHost,
      'self-close',
      'setTimeout(() => self.close(), 0); return { worker: "self-close-scheduled" }'
    )
    assert.equal(selfClose.ok, true)
    const duplicate = await run(extensionHost, 'extension-echo', 'return 2')
    assert.equal(duplicate.ok, false)
    assert.match(duplicate.error, /Duplicate/)

    const webHost = await context.newPage()
    await webHost.goto(`http://127.0.0.1:${port}/page`)
    await addSandbox(webHost, extensionId)
    const webResult = await run(
      webHost,
      'web-echo',
      'return { method: request.method, body: response.body }',
      { method: 'POST' },
      { body: { ok: true } }
    )
    assert.deepEqual(webResult.result, { method: 'POST', body: { ok: true } })
    const webIsolation = await webHost
      .frameLocator('#ajax-proxy-v3-function-sandbox')
      .locator('body')
      .evaluate(() => ({
        origin: self.origin,
        hasChromeRuntime: typeof chrome !== 'undefined' && Boolean(chrome.runtime),
        parentDomBlocked: (() => {
          try {
            return parent.document === document
          } catch {
            return true
          }
        })(),
      }))
    assert.deepEqual(webIsolation, {
      origin: 'null',
      hasChromeRuntime: false,
      parentDomBlocked: true,
    })

    const runaway = await webHost.evaluate(
      ({ channel }) => {
        const frame = document.getElementById('ajax-proxy-v3-function-sandbox')
        frame.contentWindow.postMessage(
          {
            channel,
            type: 'run',
            id: 'remove-frame-loop',
            code: 'while (true) {}',
            request: {},
            response: {},
          },
          '*'
        )
        return true
      },
      { channel }
    )
    assert.equal(runaway, true)
    await webHost.waitForTimeout(150)
    await webHost.locator('#ajax-proxy-v3-function-sandbox').evaluate((frame) => frame.remove())
    await webHost.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)))
    assert.equal(await webHost.locator('main').textContent(), 'host ready')

    console.log(
      `V3 sandbox smoke passed in ${process.env.BROWSER_EXECUTABLE_PATH || 'Playwright Chromium'}: opaque origin, worker protocol, clone rejection, no runtime/parent DOM, blocked network, four-worker concurrency limit and timeout, self-close, iframe removal, extension and ordinary HTTP hosts.`
    )
  } finally {
    await context?.close()
    await new Promise((resolve) => server.close(resolve))
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
