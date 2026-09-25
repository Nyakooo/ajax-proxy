const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { chromium } = require('playwright')

const extensionPath = path.resolve(__dirname, '../../packages/shell-chrome/build')

async function main() {
  const server = http.createServer((request, response) => {
    if (request.url === '/') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end(`<!doctype html>
        <title>Extension Smoke Page</title>
        <iframe id="child-frame" src="/frame"></iframe>
        <button id="fetch">Fetch</button>
        <button id="xhr">XHR</button>
        <button id="redirect-fetch">Redirect Fetch</button>
        <pre id="result">ready</pre>
        <script>
          const result = document.querySelector('#result')
          document.querySelector('#fetch').onclick = async () => {
            const request = new Request('/api/echo', { method: 'POST', body: 'test' })
            const response = await fetch(request)
            result.textContent = JSON.stringify({
              kind: 'fetch', status: response.status, url: response.url,
              redirected: response.redirected, type: response.type,
              contentLength: response.headers.get('content-length'), body: await response.text()
            })
          }
          document.querySelector('#xhr').onclick = () => {
            const request = new XMLHttpRequest()
            request.open('POST', '/api/echo')
            request.onload = () => {
              result.textContent = JSON.stringify({
                kind: 'xhr', status: request.status, body: request.responseText
              })
            }
            request.send('test')
          }
          document.querySelector('#redirect-fetch').onclick = async () => {
            try {
              document.cookie = 'redirect-smoke=present; path=/'
              const request = new Request('/api/echo', {
                method: 'POST',
                body: 'redirected body',
                credentials: 'include',
                headers: { 'x-original': 'preserved' },
              })
              const response = await fetch(request)
              result.textContent = JSON.stringify({
                kind: 'redirect-fetch', status: response.status, url: response.url,
                body: await response.json(),
              })
            } catch (error) {
              result.textContent = JSON.stringify({ kind: 'redirect-error', error: String(error) })
            }
          }
        </script>`)
      return
    }

    if (request.url === '/frame') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end(`<!doctype html>
        <title>Extension Smoke Frame</title>
        <button id="frame-fetch">Fetch from frame</button>
        <pre id="frame-result">ready</pre>
        <script>
          document.querySelector('#frame-fetch').onclick = async () => {
            const response = await fetch('/api/echo')
            document.querySelector('#frame-result').textContent = await response.text()
          }
        </script>`)
      return
    }

    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      if (request.url.startsWith('/mock/echo')) {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(
          JSON.stringify({
            source: 'server',
            method: request.method,
            body: Buffer.concat(chunks).toString(),
            path: request.url,
            originalHeader: request.headers['x-original'],
            redirectedHeader: request.headers['x-redirected'],
            cookie: request.headers.cookie,
          })
        )
        return
      }
      const body = JSON.stringify({
        source: 'server',
        method: request.method,
        body: Buffer.concat(chunks).toString(),
      })
      response.writeHead(200, {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      })
      response.end(body)
    })
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ajax-proxy-extension-smoke-'))
  const contextOptions = {
    channel: process.env.BROWSER_EXECUTABLE_PATH ? undefined : 'chromium',
    executablePath: process.env.BROWSER_EXECUTABLE_PATH,
    headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  }
  let context

  try {
    context = await chromium.launchPersistentContext(userDataDir, contextOptions)

    const serviceWorker =
      context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'))
    const extensionId = new URL(serviceWorker.url()).host
    const panel = await context.newPage()
    panel.setDefaultTimeout(10000)

    await panel.goto(`chrome-extension://${extensionId}/panels/index.html`)
    await panel.locator('.switch-control .el-switch, .global-switch .el-switch').first().click()
    const page = await context.newPage()
    const secondPage = await context.newPage()
    await page.goto(`http://127.0.0.1:${port}/`)
    await secondPage.goto(`http://127.0.0.1:${port}/`)
    const activeTab = await panel.evaluate(() =>
      chrome.tabs.query({ active: true, lastFocusedWindow: true }).then((tabs) => tabs[0])
    )
    assert.equal(activeTab.title, 'Extension Smoke Page')
    await panel
      .locator('.response-container > .el-button, .response-container .table-toolbar > .el-button')
      .first()
      .click()

    const dialog = panel.locator('.response-modal-container .el-dialog__wrapper')
    await dialog.waitFor({ state: 'visible' })
    const fields = dialog.locator('.el-form-item')
    await fields.nth(0).locator('input:not([readonly])').fill('/api/echo')
    await fields.nth(1).locator('input:not([readonly])').fill('Playwright extension smoke')
    const responseJson = '{"source":"intercepted","details":{"ok":true},"items":[2,1]}'
    const expectedResponseJson = '{"source":"intercepted","details":{"ok":true},"items":[1,2]}'
    await dialog.locator('textarea.el-textarea__inner').fill(responseJson)
    await dialog.getByRole('button', { name: 'JSON Editor' }).click()

    const jsonDrawer = panel.locator('.json-editor-container .el-drawer__wrapper')
    await jsonDrawer.waitFor({ state: 'visible' })
    await jsonDrawer.locator('.jsoneditor-menu button.jsoneditor-modes').click()
    await jsonDrawer.locator('button.jsoneditor-type-modes[title="Switch to tree editor"]').click()
    await jsonDrawer.locator('button.jsoneditor-expand-all').click()
    await jsonDrawer.locator('.jsoneditor-field').filter({ hasText: 'details' }).waitFor()
    await jsonDrawer.locator('.jsoneditor-field').filter({ hasText: 'ok' }).waitFor()
    assert.equal(await jsonDrawer.locator('.jsoneditor-value.jsoneditor-boolean').count(), 1)
    assert.equal(await jsonDrawer.locator('.jsoneditor-value.jsoneditor-number').count(), 2)
    const numberValues = jsonDrawer.locator('.jsoneditor-value.jsoneditor-number')
    assert.deepEqual(await numberValues.allTextContents(), ['2', '1'])
    const firstArrayItem = numberValues
      .nth(0)
      .locator('xpath=ancestor::tr[.//button[contains(@class, "jsoneditor-dragarea")]][1]')
      .locator('.jsoneditor-dragarea')
    const secondArrayItem = numberValues
      .nth(1)
      .locator('xpath=ancestor::tr[.//button[contains(@class, "jsoneditor-dragarea")]][1]')
      .locator('.jsoneditor-dragarea')
    const secondArrayItemBounds = await secondArrayItem.boundingBox()
    await firstArrayItem.dragTo(secondArrayItem, {
      targetPosition: { x: 5, y: secondArrayItemBounds.height - 1 },
      steps: 8,
    })
    assert.deepEqual(await numberValues.allTextContents(), ['1', '2'])

    const detailsRow = jsonDrawer
      .locator('.jsoneditor-field')
      .filter({ hasText: /^details$/ })
      .locator('xpath=ancestor::tr[contains(@class, "jsoneditor-expandable")][1]')
    await detailsRow.locator('.jsoneditor-contextmenu-button').click()
    await jsonDrawer.locator('button.jsoneditor-insert').click()
    await jsonDrawer.locator('.jsoneditor-field.jsoneditor-empty').fill('temporary')
    await jsonDrawer.locator('.jsoneditor-value.jsoneditor-empty').fill('editable')
    await jsonDrawer
      .locator('.jsoneditor-field')
      .filter({ hasText: /^temporary$/ })
      .waitFor()
    await jsonDrawer.locator('button.jsoneditor-undo').click()
    assert.equal(
      await jsonDrawer
        .locator('.jsoneditor-field')
        .filter({ hasText: /^temporary$/ })
        .count(),
      0
    )
    await jsonDrawer.locator('button.jsoneditor-redo').click()
    await jsonDrawer
      .locator('.jsoneditor-field')
      .filter({ hasText: /^temporary$/ })
      .waitFor()
    const temporaryRow = jsonDrawer
      .locator('.jsoneditor-field')
      .filter({ hasText: /^temporary$/ })
      .locator(
        'xpath=ancestor::tr[.//button[contains(@class, "jsoneditor-contextmenu-button")]][1]'
      )
    await temporaryRow.locator('.jsoneditor-contextmenu-button').click()
    await jsonDrawer.locator('button.jsoneditor-remove').click()
    assert.equal(
      await jsonDrawer
        .locator('.jsoneditor-field')
        .filter({ hasText: /^temporary$/ })
        .count(),
      0
    )
    await jsonDrawer.locator('button.jsoneditor-collapse-all').click()

    await jsonDrawer.locator('.json-editor-drawer__footer button').click()
    await dialog.getByRole('button', { name: 'OK' }).click()
    await dialog.waitFor({ state: 'hidden' })
    await panel.getByText('/api/echo', { exact: true }).waitFor()

    const result = page.locator('#result')

    const childFrame = page.frameLocator('#child-frame')
    await childFrame.locator('#frame-fetch').click()
    await childFrame.locator('#frame-result').waitFor()
    await childFrame.locator('#frame-result').getByText('intercepted').waitFor()

    await page.locator('#fetch').click()
    await result.waitFor({ state: 'visible' })
    await page.waitForFunction(() =>
      document.querySelector('#result').textContent.includes('intercepted')
    )
    assert.deepEqual(JSON.parse(await result.textContent()), {
      kind: 'fetch',
      status: 200,
      url: `http://127.0.0.1:${port}/api/echo`,
      redirected: false,
      type: 'basic',
      contentLength: null,
      body: expectedResponseJson,
    })

    await secondPage.locator('#fetch').click()
    await secondPage.waitForFunction(() =>
      document.querySelector('#result').textContent.includes('intercepted')
    )
    assert.equal(
      JSON.parse(await secondPage.locator('#result').textContent()).body,
      expectedResponseJson
    )

    await secondPage.locator('#xhr').click()
    await secondPage.waitForFunction(() =>
      document.querySelector('#result').textContent.startsWith('{"kind":"xhr"')
    )
    assert.equal(
      JSON.parse(await secondPage.locator('#result').textContent()).body,
      expectedResponseJson
    )

    await page.locator('#xhr').click()
    await page.waitForFunction(() =>
      document.querySelector('#result').textContent.startsWith('{"kind":"xhr"')
    )
    assert.deepEqual(JSON.parse(await result.textContent()), {
      kind: 'xhr',
      status: 200,
      body: expectedResponseJson,
    })

    await panel.locator('input.el-radio-button__orig-radio[value="redirector"]').check({
      force: true,
    })
    await panel
      .locator('.request-container > .el-button, .request-container .table-toolbar > .el-button')
      .first()
      .click()
    const redirectDialog = panel.locator('.response-modal-container .el-dialog__wrapper')
    await redirectDialog.waitFor({ state: 'visible' })
    const redirectFields = redirectDialog.locator('.el-form-item')
    await redirectFields.nth(0).locator('input:not([readonly])').first().fill('/api/echo')
    await redirectFields.nth(1).locator('input:not([readonly])').first().fill('/mock/echo')
    await redirectFields.nth(0).locator('.el-select').last().click()
    await panel
      .locator('.el-select-dropdown:visible .el-select-dropdown__item')
      .filter({ hasText: /^POST$/ })
      .click()
    const redirectHeaders = redirectFields.nth(2)
    await redirectHeaders.getByRole('button', { name: /Append/ }).click()
    const redirectHeaderInputs = redirectHeaders.locator('input:not([readonly])')
    await redirectHeaderInputs.nth(0).fill('x-redirected')
    await redirectHeaderInputs.nth(1).fill('yes')
    await redirectDialog.getByRole('button', { name: 'OK' }).click()
    await redirectDialog.waitFor({ state: 'hidden' })
    await panel.getByText('/api/echo', { exact: true }).waitFor()
    await page.locator('#redirect-fetch').click()
    await page.waitForFunction(() =>
      /redirect-(fetch|error)/.test(document.querySelector('#result').textContent)
    )
    assert.deepEqual(JSON.parse(await result.textContent()), {
      kind: 'redirect-fetch',
      status: 200,
      url: `http://127.0.0.1:${port}/mock/echo`,
      body: {
        source: 'server',
        method: 'POST',
        body: 'redirected body',
        path: '/mock/echo',
        originalHeader: 'preserved',
        redirectedHeader: 'yes',
        cookie: 'redirect-smoke=present',
      },
    })

    await secondPage.locator('#redirect-fetch').click()
    await secondPage.waitForFunction(() =>
      document.querySelector('#result').textContent.startsWith('{"kind":"redirect-fetch"')
    )
    assert.equal(
      JSON.parse(await secondPage.locator('#result').textContent()).url,
      `http://127.0.0.1:${port}/mock/echo`
    )

    await context.close()
    context = await chromium.launchPersistentContext(userDataDir, contextOptions)
    const restartedWorker =
      context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'))
    assert.equal(new URL(restartedWorker.url()).host, extensionId)
    await restartedWorker.evaluate(() => chrome.storage.local.get(null))
    const restartedPage = await context.newPage()
    await restartedPage.goto(`http://127.0.0.1:${port}/`)
    await restartedPage.locator('#redirect-fetch').click()
    await restartedPage.waitForFunction(() =>
      document.querySelector('#result').textContent.startsWith('{"kind":"redirect-fetch"')
    )
    assert.equal(
      JSON.parse(await restartedPage.locator('#result').textContent()).url,
      `http://127.0.0.1:${port}/mock/echo`
    )

    console.log(
      'Unpacked extension Fetch, XHR, iframe, redirect, and service worker restart smoke passed'
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
