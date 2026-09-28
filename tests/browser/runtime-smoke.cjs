const assert = require('node:assert/strict')
const http = require('node:http')
const { chromium } = require('playwright')

const channel = process.env.BROWSER_CHANNEL || 'chromium'
const executablePath = process.env.BROWSER_EXECUTABLE_PATH
const label = process.env.BROWSER_LABEL || channel
const supportedChannels = new Set(['chromium', 'chrome', 'msedge'])

if (!supportedChannels.has(channel)) {
  throw new Error(`Unsupported BROWSER_CHANNEL: ${channel}`)
}

async function main() {
  const server = http.createServer((request, response) => {
    if (request.url === '/') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end('<!doctype html><title>Browser compatibility smoke</title>')
      return
    }

    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(
        JSON.stringify({
          method: request.method,
          body: Buffer.concat(chunks).toString(),
        })
      )
    })
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  let browser

  try {
    browser = await chromium.launch({
      channel: executablePath || channel === 'chromium' ? undefined : channel,
      executablePath,
      headless: true,
    })
    const page = await browser.newPage()
    await page.goto(`http://127.0.0.1:${port}/`)

    const result = await page.evaluate(async (origin) => {
      const request = new Request(`${origin}/echo`, {
        method: 'POST',
        body: 'fetch-smoke',
      })
      const fetchResponse = await fetch(request)
      const fetchResult = await fetchResponse.json()

      const xhrResult = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('GET', `${origin}/echo`)
        xhr.onload = () => resolve(JSON.parse(xhr.responseText))
        xhr.onerror = () => reject(new Error('XHR request failed'))
        xhr.send()
      })

      return {
        userAgent: navigator.userAgent,
        requestMethod: request.method,
        fetchResult,
        xhrResult,
        cssGrid: CSS.supports('display', 'grid'),
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      }
    }, `http://127.0.0.1:${port}`)

    assert.equal(result.requestMethod, 'POST')
    assert.deepEqual(result.fetchResult, { method: 'POST', body: 'fetch-smoke' })
    assert.deepEqual(result.xhrResult, { method: 'GET', body: '' })
    assert.equal(result.cssGrid, true)
    assert.equal(typeof result.reducedMotion, 'boolean')

    if (channel === 'chrome') {
      assert.match(result.userAgent, /Chrome\//)
      assert.doesNotMatch(result.userAgent, /Edg\//)
    }
    if (channel === 'msedge') assert.match(result.userAgent, /Edg\//)

    console.log(`${label} ${browser.version()} runtime smoke passed`)
  } finally {
    await browser?.close()
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
