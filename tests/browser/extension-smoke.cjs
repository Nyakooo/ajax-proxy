const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { chromium } = require('playwright')

const extensionPath = path.resolve(__dirname, '../../packages/shell-chrome/build')
const manifest = JSON.parse(fs.readFileSync(path.join(extensionPath, 'manifest.json'), 'utf8'))

assert.ok(
  manifest.web_accessible_resources?.some((entry) =>
    entry.resources.includes('v3-sandbox/sandbox.html')
  ),
  'only the function sandbox host page should be web accessible'
)
assert.ok(
  manifest.content_scripts.some(
    (script) =>
      script.js.includes('document.js') &&
      script.world === 'MAIN' &&
      script.run_at === 'document_start' &&
      script.all_frames === true
  )
)

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
            const events = []
            for (const type of ['loadstart', 'readystatechange', 'progress', 'load', 'loadend']) {
              request.addEventListener(type, function (event) {
                events.push({
                  type: event.type,
                  thisIsRequest: this === request,
                  targetIsRequest: event.target === request,
                  currentTargetIsRequest: event.currentTarget === request,
                })
              })
            }
            let onloadCalled = false
            request.onload = () => {
              onloadCalled = true
            }
            request.addEventListener('loadend', () => {
              result.textContent = JSON.stringify({
                kind: 'xhr', status: request.status, body: request.responseText, onloadCalled, events
              })
            })
            request.open('POST', '/api/echo')
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
    headless: process.env.EXTENSION_SMOKE_HEADLESS !== '0',
    acceptDownloads: true,
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
    page.on('pageerror', (error) => console.error('Extension smoke page error:', error))
    page.on('console', (message) => {
      if (message.type() === 'error')
        console.error('Extension smoke console error:', message.text())
    })
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
    const regexMatcher = '/api/(echo|items)$'
    await fields.nth(0).locator('input:not([readonly])').fill(regexMatcher)
    await fields.nth(0).locator('.el-select').first().click()
    await panel
      .locator('.el-select-dropdown:visible .el-select-dropdown__item')
      .filter({ hasText: /^Regex$/ })
      .click()
    await fields.nth(1).locator('input:not([readonly])').fill('Playwright extension smoke')
    const responseJson = '{"source":"intercepted","details":{"ok":true},"items":[1,2]}'
    const expectedResponseJson = responseJson
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
    assert.deepEqual(await numberValues.allTextContents(), ['1', '2'])
    await jsonDrawer.locator('button.jsoneditor-collapse-all').click()

    await jsonDrawer.locator('.json-editor-drawer__footer button').click()
    await dialog.getByRole('button', { name: 'OK' }).click()
    await dialog.waitFor({ state: 'hidden' })
    await panel.getByText(regexMatcher, { exact: true }).waitFor()
    await panel.locator('.response-container .el-table__body-wrapper').getByText('Regex').waitFor()

    const result = page.locator('#result')

    const unmatchedRegexResponse = await page.evaluate(async () => {
      const response = await fetch('/api/nope')
      return response.json()
    })
    assert.deepEqual(unmatchedRegexResponse, {
      source: 'server',
      method: 'GET',
      body: '',
    })

    const childFrame = page.frameLocator('#child-frame')
    await childFrame.locator('#frame-fetch').click()
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
    const xhrResult = JSON.parse(await result.textContent())
    assert.equal(xhrResult.kind, 'xhr')
    assert.equal(xhrResult.status, 200)
    assert.equal(xhrResult.body, expectedResponseJson)
    assert.equal(xhrResult.onloadCalled, true)
    assert.ok(xhrResult.events.some((event) => event.type === 'progress'))
    assert.ok(xhrResult.events.some((event) => event.type === 'loadstart'))
    assert.ok(xhrResult.events.some((event) => event.type === 'loadend'))
    assert.ok(xhrResult.events.every((event) => event.thisIsRequest))
    assert.ok(xhrResult.events.every((event) => event.targetIsRequest))
    assert.ok(xhrResult.events.every((event) => event.currentTargetIsRequest))
    assert.ok(
      xhrResult.events.findIndex((event) => event.type === 'readystatechange') <
        xhrResult.events.findIndex((event) => event.type === 'load')
    )

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

    const v3ResponseBody = { source: 'v3-intercepted', ok: true }
    await panel.evaluate(({ key, backup }) => chrome.storage.local.set({ [key]: backup }), {
      key: 'ajax-proxy:storage:v3-config',
      backup: {
        format: 'ajax-proxy-backup',
        formatVersion: 3,
        settings: { globalEnabled: true, mode: 'interceptor', language: 'en' },
        tags: [],
        rules: [
          {
            id: 'v3-extension-smoke',
            enabled: true,
            match: { url: '/api/echo', method: 'POST' },
            request: {
              enabled: true,
              redirect: { url: `http://127.0.0.1:${port}/mock/echo` },
            },
            response: {
              enabled: true,
              replace: { status: 202, body: v3ResponseBody },
            },
          },
        ],
      },
    })
    await page.reload()
    const legacyHitState = await serviceWorker.evaluate(
      async (key) => (await chrome.storage.local.get(key))[key],
      'ajax-proxy:storage:intercept-list'
    )
    assert.equal(await page.evaluate(() => XMLHttpRequest.UNSENT), 0)
    const v3FetchResult = await page.evaluate(async () => {
      const response = await fetch('/api/echo', { method: 'POST', body: 'v3 fetch' })
      return { status: response.status, url: response.url, body: await response.json() }
    })
    assert.deepEqual(v3FetchResult, {
      status: 202,
      url: `http://127.0.0.1:${port}/mock/echo`,
      body: v3ResponseBody,
    })
    const v3XhrResult = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const request = new XMLHttpRequest()
          request.onload = () =>
            resolve({
              status: request.status,
              url: request.responseURL,
              body: JSON.parse(request.responseText),
            })
          request.open('POST', '/api/echo')
          request.send('v3 xhr')
        })
    )
    assert.deepEqual(v3XhrResult, {
      status: 202,
      url: `http://127.0.0.1:${port}/mock/echo`,
      body: v3ResponseBody,
    })
    let v3Counters = {}
    for (let attempt = 0; attempt < 40; attempt += 1) {
      v3Counters = await serviceWorker.evaluate(
        async (key) => (await chrome.storage.local.get(key))[key] || {},
        'ajax-proxy:storage:v3-hits'
      )
      if (v3Counters['v3-extension-smoke'] === 2) break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    assert.deepEqual(v3Counters, { 'v3-extension-smoke': 2 })
    assert.deepEqual(
      await serviceWorker.evaluate(
        async (key) => (await chrome.storage.local.get(key))[key],
        'ajax-proxy:storage:intercept-list'
      ),
      legacyHitState
    )
    assert.equal(await serviceWorker.evaluate(() => chrome.action.getBadgeText({})), '+2')

    const runtimeFunctionCode =
      "return { status: 209, body: { source: 'v3-function', requestBody: request.body, response: JSON.parse(response.body) } }"
    const functionRule = {
      id: 'v3-function-extension-smoke',
      enabled: true,
      match: { url: '/api/function', method: 'POST' },
      response: { enabled: true, replace: { code: runtimeFunctionCode } },
    }
    await serviceWorker.evaluate(
      async ({ key, rule }) => {
        const config = (await chrome.storage.local.get(key))[key]
        await chrome.storage.local.set({ [key]: { ...config, rules: [...config.rules, rule] } })
      },
      { key: 'ajax-proxy:storage:v3-config', rule: functionRule }
    )
    await page.reload()
    await page.waitForFunction(() =>
      Boolean(document.getElementById('ajax-proxy-v3-function-sandbox'))
    )
    const functionFetchResult = await page.evaluate(async () => {
      const response = await fetch('/api/function', { method: 'POST', body: 'function request' })
      return { status: response.status, body: await response.json() }
    })
    assert.deepEqual(functionFetchResult, {
      status: 209,
      body: {
        source: 'v3-function',
        requestBody: 'function request',
        response: { source: 'server', method: 'POST', body: 'function request' },
      },
    })
    const functionXhrResult = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const request = new XMLHttpRequest()
          request.onload = () =>
            resolve({ status: request.status, body: JSON.parse(request.responseText) })
          request.open('POST', '/api/function')
          request.send('function request')
        })
    )
    assert.deepEqual(functionXhrResult, {
      status: 200,
      body: { source: 'server', method: 'POST', body: 'function request' },
    })

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

    const v3Panel = await context.newPage()
    v3Panel.setDefaultTimeout(10000)
    v3Panel.on('pageerror', (error) => console.error('V3 panel smoke page error:', error))
    v3Panel.on('console', (message) => {
      if (message.type() === 'error') console.error('V3 panel smoke console error:', message.text())
    })
    let codeMirrorLoaded = false
    v3Panel.on('request', (request) => {
      if (request.resourceType() === 'script' && request.url().includes('CodeMirrorJsonEditor-')) {
        codeMirrorLoaded = true
      }
    })
    await v3Panel.goto(`chrome-extension://${extensionId}/panels-v3/index.html`)
    assert.equal(
      codeMirrorLoaded,
      false,
      'CodeMirror must stay unloaded before opening a rule editor'
    )
    const englishButton = v3Panel.getByRole('button', { name: 'English' })
    if ((await englishButton.getAttribute('aria-pressed')) !== 'true') {
      await englishButton.click()
      await v3Panel.reload()
    }
    await v3Panel.getByRole('button', { name: 'Create intercept rule' }).click()
    const responseEditor = v3Panel.getByRole('dialog')
    await responseEditor
      .locator('.cm-content[contenteditable="true"]')
      .waitFor()
      .catch(async (error) => {
        console.error(
          'V3 response editor body at CodeMirror wait failure:',
          await v3Panel.locator('body').innerText()
        )
        await v3Panel.screenshot({ path: '/tmp/ajax-proxy-v3-panel-debug.png' })
        throw error
      })
    assert.equal(codeMirrorLoaded, true, 'Opening a response rule editor should load CodeMirror')
    await responseEditor.locator('label.editor-field').nth(0).locator('input').fill('/api/v3-ui')
    await responseEditor.locator('.editor-field-row select').nth(1).selectOption('POST')
    await responseEditor.locator('.editor-field-row input[type="number"]').fill('203')
    const responseBody = responseEditor.locator(
      '.response-json-input .cm-content[contenteditable="true"]'
    )
    await responseBody.fill('{\n  "name": 1,\n  bad\n}')
    await responseEditor.getByRole('button', { name: 'Save' }).click()
    await v3Panel.getByRole('alert').getByText('Invalid JSON at line 3, column 3.').waitFor()
    await responseEditor.getByRole('button', { name: 'Object' }).click()
    assert.match(await responseBody.innerText(), /"id": 123/)
    await v3Panel.getByRole('alert').waitFor({ state: 'detached' })
    await responseBody.fill(JSON.stringify({ source: 'v3-ui', ok: true }))
    const legacyStateBeforeV3Ui = await restartedWorker.evaluate(
      async (key) => (await chrome.storage.local.get(key))[key],
      'ajax-proxy:storage:intercept-list'
    )
    await responseEditor.getByRole('button', { name: 'Save' }).click()
    await v3Panel
      .getByText('/api/v3-ui', { exact: true })
      .waitFor()
      .catch(async (error) => {
        console.error('V3 response rule save UI:', await v3Panel.locator('body').innerText())
        await v3Panel.screenshot({ path: '/tmp/ajax-proxy-v3-tag-debug.png' })
        throw error
      })

    let v3UiConfig
    let v3UiRule
    for (let attempt = 0; attempt < 40; attempt += 1) {
      v3UiConfig = await restartedWorker.evaluate(
        async (key) => (await chrome.storage.local.get(key))[key],
        'ajax-proxy:storage:v3-config'
      )
      v3UiRule = v3UiConfig.rules.find((rule) => rule.match.url === '/api/v3-ui')
      if (v3UiRule) break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    assert.ok(v3UiRule, 'V3 panel should persist the response rule through its runtime message API')
    assert.deepEqual(v3UiRule.match, { url: '/api/v3-ui', type: 'normal', method: 'POST' })
    assert.deepEqual(v3UiRule.response, {
      enabled: true,
      replace: { status: 203, body: { source: 'v3-ui', ok: true } },
    })
    assert.deepEqual(
      await restartedWorker.evaluate(
        async (key) => (await chrome.storage.local.get(key))[key],
        'ajax-proxy:storage:intercept-list'
      ),
      legacyStateBeforeV3Ui
    )

    await v3Panel.reload()
    await v3Panel.getByText('/api/v3-ui', { exact: true }).waitFor()
    const beforeV3UiHit = await restartedWorker.evaluate(
      async ({ key, ruleId }) => ((await chrome.storage.local.get(key))[key] || {})[ruleId] || 0,
      { key: 'ajax-proxy:storage:v3-hits', ruleId: v3UiRule.id }
    )
    const v3UiFetchResult = await restartedPage.evaluate(async () => {
      const response = await fetch('/api/v3-ui', { method: 'POST', body: 'from UI rule' })
      return { status: response.status, body: await response.json() }
    })
    assert.deepEqual(v3UiFetchResult, {
      status: 203,
      body: { source: 'v3-ui', ok: true },
    })
    let v3UiHitCount = beforeV3UiHit
    for (let attempt = 0; attempt < 40; attempt += 1) {
      v3UiHitCount = await restartedWorker.evaluate(
        async ({ key, ruleId }) => ((await chrome.storage.local.get(key))[key] || {})[ruleId] || 0,
        { key: 'ajax-proxy:storage:v3-hits', ruleId: v3UiRule.id }
      )
      if (v3UiHitCount === beforeV3UiHit + 1) break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    assert.equal(v3UiHitCount, beforeV3UiHit + 1)

    await v3Panel.getByText('Most recent match across tabs').waitFor()
    await v3Panel.getByText(/Matched request: POST http:\/\/127\.0\.0\.1:\d+\/api\/v3-ui/).waitFor()
    await v3Panel.getByText('Matched', { exact: true }).waitFor()
    const v3UiRuleRow = v3Panel.locator('.rule-row').filter({ hasText: '/api/v3-ui' })
    await v3UiRuleRow
      .locator('.hit-count strong')
      .getByText(String(beforeV3UiHit + 1))
      .waitFor()

    v3Panel.on('dialog', (dialog) => dialog.accept())
    await v3Panel.getByRole('button', { name: 'Create intercept rule' }).click()
    const functionEditor = v3Panel.getByRole('dialog')
    await functionEditor.locator('label.editor-field').nth(0).locator('input').fill('/api/function')
    await functionEditor.locator('.editor-field-row select').nth(1).selectOption('POST')
    await functionEditor.locator('input[name="response-mode"][value="function"]').check({
      force: true,
    })
    const functionCode =
      "return { status: 209, body: { source: 'v3-function-ui', requestBody: request.body, response: JSON.parse(response.body) } }"
    await functionEditor
      .locator('.response-function-input .cm-content[contenteditable="true"]')
      .fill(functionCode)
    await functionEditor.locator('.function-enabled input').check({ force: true })
    await functionEditor.getByRole('button', { name: 'Save' }).click()
    await functionEditor.waitFor({ state: 'hidden' })

    let functionUiRule
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const currentConfig = await restartedWorker.evaluate(
        async (key) => (await chrome.storage.local.get(key))[key],
        'ajax-proxy:storage:v3-config'
      )
      functionUiRule = currentConfig.rules.find((rule) => rule.match.url === '/api/function')
      if (functionUiRule) break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    assert.ok(functionUiRule, 'V3 panel should persist a function response rule')
    assert.equal(functionUiRule.response.enabled, true)
    assert.deepEqual(functionUiRule.response.replace, { code: functionCode })

    await restartedPage.waitForFunction(() =>
      Boolean(document.getElementById('ajax-proxy-v3-function-sandbox'))
    )
    const functionUiFetchResult = await restartedPage.evaluate(async () => {
      const response = await fetch('/api/function', { method: 'POST', body: 'function request' })
      return { status: response.status, body: await response.json() }
    })
    assert.deepEqual(functionUiFetchResult, {
      status: 209,
      body: {
        source: 'v3-function-ui',
        requestBody: 'function request',
        response: { source: 'server', method: 'POST', body: 'function request' },
      },
    })
    const functionUiXhrResult = await restartedPage.evaluate(
      () =>
        new Promise((resolve) => {
          const request = new XMLHttpRequest()
          request.onload = () =>
            resolve({
              status: request.status,
              body: JSON.parse(request.responseText),
            })
          request.open('POST', '/api/function')
          request.send('function request')
        })
    )
    assert.deepEqual(functionUiXhrResult, {
      status: 200,
      body: { source: 'server', method: 'POST', body: 'function request' },
    })

    const disabledFilterRule = {
      id: 'v3-disabled-filter-smoke',
      enabled: false,
      match: { url: '/api/disabled-filter', method: 'GET' },
      response: { enabled: true, replace: { body: { source: 'disabled-filter' } } },
    }
    const dualActionRule = {
      id: 'v3-disabled-response-with-redirect-smoke',
      enabled: true,
      match: { url: '/api/dual-action', method: 'GET' },
      request: { enabled: true, redirect: { url: '/mock/echo' } },
      response: {
        enabled: true,
        replace: { code: "return { body: { source: 'disabled' } }" },
      },
    }
    await restartedWorker.evaluate(
      async ({ key, rules }) => {
        const config = (await chrome.storage.local.get(key))[key]
        await chrome.storage.local.set({
          [key]: { ...config, rules: [...config.rules, ...rules] },
        })
      },
      { key: 'ajax-proxy:storage:v3-config', rules: [disabledFilterRule, dualActionRule] }
    )
    await v3Panel.reload()
    await v3Panel.getByText('/api/disabled-filter', { exact: true }).waitFor()

    const backupConfigBefore = await restartedWorker.evaluate(
      async (key) => (await chrome.storage.local.get(key))[key],
      'ajax-proxy:storage:v3-config'
    )
    await v3Panel.getByRole('button', { name: 'Backup / Restore' }).click()
    const backupDialog = v3Panel.getByRole('dialog')
    const [backupDownload] = await Promise.all([
      v3Panel.waitForEvent('download'),
      backupDialog.getByRole('button', { name: 'Export JSON backup' }).click(),
    ])
    const exportedBackup = JSON.parse(fs.readFileSync(await backupDownload.path(), 'utf8'))
    assert.equal(exportedBackup.format, 'ajax-proxy-backup')
    assert.equal(exportedBackup.formatVersion, 3)
    assert.deepEqual(exportedBackup.rules, backupConfigBefore.rules)
    assert.equal('hitCounters' in exportedBackup, false)

    const backupInput = backupDialog.getByTestId('backup-json-input')
    await backupInput.fill('{ invalid json')
    await backupDialog.getByRole('button', { name: 'Validate backup' }).click()
    await backupDialog.getByRole('alert').waitFor()
    assert.deepEqual(
      await restartedWorker.evaluate(
        async (key) => (await chrome.storage.local.get(key))[key],
        'ajax-proxy:storage:v3-config'
      ),
      backupConfigBefore,
      'invalid backup JSON must not change the active V3 configuration'
    )

    await backupInput.fill(JSON.stringify(exportedBackup))
    await backupDialog.getByRole('button', { name: 'Validate backup' }).click()
    const functionRuleCount = exportedBackup.rules.filter(
      (rule) => typeof rule.response?.replace?.code === 'string'
    ).length
    await backupDialog
      .getByText(`Found ${functionRuleCount} function response rules`, { exact: true })
      .waitFor()
    await backupDialog.getByRole('button', { name: 'Confirm restore' }).click()
    await backupDialog.waitFor({ state: 'hidden' })

    let restoredBackup
    for (let attempt = 0; attempt < 40; attempt += 1) {
      restoredBackup = await restartedWorker.evaluate(
        async (key) => (await chrome.storage.local.get(key))[key],
        'ajax-proxy:storage:v3-config'
      )
      if (
        restoredBackup.rules.every(
          (rule) => !rule.response?.replace?.code || !rule.response.enabled
        )
      )
        break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    assert.ok(
      restoredBackup.rules
        .filter((rule) => rule.response?.replace?.code)
        .every((rule) => rule.response.enabled === false),
      'imported function response rules must remain disabled'
    )
    const dualActionRow = v3Panel.locator('.rule-row').filter({ hasText: '/api/dual-action' })
    await dualActionRow.waitFor()
    await dualActionRow.getByRole('button', { name: 'Delete' }).click()
    let configAfterDelete
    for (let attempt = 0; attempt < 40; attempt += 1) {
      configAfterDelete = await restartedWorker.evaluate(
        async (key) => (await chrome.storage.local.get(key))[key],
        'ajax-proxy:storage:v3-config'
      )
      const dualRule = configAfterDelete.rules.find((rule) => rule.id === dualActionRule.id)
      if (dualRule && !dualRule.response) break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    const preservedRedirectRule = configAfterDelete.rules.find(
      (rule) => rule.id === dualActionRule.id
    )
    assert.ok(preservedRedirectRule.request, 'deleting the disabled response keeps the redirect')
    assert.equal(preservedRedirectRule.response, undefined)

    const importedFunctionRows = v3Panel.locator('.rule-row').filter({ hasText: '/api/function' })
    await importedFunctionRows.first().waitFor()
    assert.equal(
      await importedFunctionRows.count(),
      backupConfigBefore.rules.filter((rule) => rule.match.url === '/api/function').length
    )
    await importedFunctionRows.first().locator('.action-disabled').getByText('Disabled').waitFor()
    await importedFunctionRows.first().getByRole('button', { name: 'Edit' }).click()
    const importedFunctionEditor = v3Panel.locator('.response-rule-editor[role="dialog"]')
    await importedFunctionEditor.locator('.response-function-input .cm-content').waitFor()
    assert.equal(
      await importedFunctionEditor
        .locator('.function-enabled input')
        .evaluate((input) => input.checked),
      false,
      'the imported function must remain disabled when opened for review'
    )
    await importedFunctionEditor.getByRole('button', { name: 'Cancel' }).click()

    const v3RuleSearch = v3Panel.getByPlaceholder('Search URL, method, or note')
    await v3RuleSearch.fill('/api/function')
    assert.equal(
      await v3Panel.locator('.rule-row').count(),
      backupConfigBefore.rules.filter((rule) => rule.match.url === '/api/function').length
    )
    await v3RuleSearch.fill('')

    await v3Panel.getByRole('button', { name: 'Filter', exact: true }).click()
    const ruleFilterPopover = v3Panel.locator('.rule-filter-popover')
    await ruleFilterPopover.waitFor()
    await ruleFilterPopover.locator('input[name="rule-status-filter"][value="enabled"]').check()
    assert.equal(
      await v3Panel.locator('.rule-row').count(),
      configAfterDelete.rules.filter((rule) => rule.response && rule.enabled).length
    )
    assert.equal(
      await v3Panel
        .locator('.rule-row')
        .nth(1)
        .getByRole('button', { name: /Raise the priority/ })
        .isEnabled(),
      false,
      'priority changes stay disabled while a filter is active'
    )
    await ruleFilterPopover.locator('input[name="rule-status-filter"][value="disabled"]').check()
    assert.equal(await v3Panel.locator('.rule-row').count(), 1)
    await v3Panel.getByText('/api/disabled-filter', { exact: true }).waitFor()
    await ruleFilterPopover.locator('input[name="rule-match-type-filter"][value="regex"]').check()
    await v3Panel.getByText('No matching rules', { exact: true }).waitFor()
    assert.equal(await v3Panel.locator('.rule-row').count(), 0)
    await ruleFilterPopover.getByRole('button', { name: 'Clear filters' }).click()
    assert.equal(
      await v3Panel.locator('.rule-row').count(),
      configAfterDelete.rules.filter((rule) => rule.response).length
    )
    await ruleFilterPopover.getByRole('button', { name: 'Close filters' }).click()

    await v3Panel.getByRole('button', { name: 'Tags', exact: true }).click()
    const ruleTagPopover = v3Panel.locator('.rule-tag-filter-popover')
    await ruleTagPopover.getByRole('button', { name: 'Manage tags' }).click()
    const ruleTagsDialog = v3Panel.getByRole('dialog', { name: 'Manage rule tags' })
    await ruleTagsDialog.getByLabel('New tag name').fill('Smoke label')
    await ruleTagsDialog.getByRole('button', { name: 'Add tag' }).click()
    const tagNameInputs = ruleTagsDialog.locator('.rule-tags-list input')
    await tagNameInputs.first().waitFor()
    assert.equal(await tagNameInputs.first().inputValue(), 'Smoke label')
    await ruleTagsDialog.getByLabel('New tag name').fill('Secondary label')
    await ruleTagsDialog.getByRole('button', { name: 'Add tag' }).click()
    await tagNameInputs.nth(1).waitFor()
    assert.equal(await tagNameInputs.nth(1).inputValue(), 'Secondary label')
    await ruleTagsDialog.getByRole('button', { name: 'Done', exact: true }).click()

    const taggedRuleRow = v3Panel.locator('.rule-row').filter({ hasText: '/api/v3-ui' })
    await taggedRuleRow.getByRole('button', { name: 'Edit' }).click()
    const taggedRuleEditor = v3Panel.locator('.response-rule-editor[role="dialog"]')
    await taggedRuleEditor
      .locator('.rule-tag-picker label')
      .filter({ hasText: 'Smoke label' })
      .locator('input')
      .check()
    await taggedRuleEditor
      .locator('.rule-tag-picker label')
      .filter({ hasText: 'Secondary label' })
      .locator('input')
      .check()
    await taggedRuleEditor.getByRole('button', { name: 'Save' }).click()
    let taggedRule
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const currentConfig = await restartedWorker.evaluate(
        async (key) => (await chrome.storage.local.get(key))[key],
        'ajax-proxy:storage:v3-config'
      )
      taggedRule = currentConfig.rules.find((rule) => rule.match.url === '/api/v3-ui')
      if (taggedRule?.tagIds?.length) break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    assert.equal(taggedRule.tagIds.length, 2, 'the editor persists both selected tag references')
    await v3Panel.reload()
    await taggedRuleRow.locator('.rule-tag-chip').getByText('Smoke label').waitFor()
    await taggedRuleRow.locator('.rule-tag-chip').getByText('Secondary label').waitFor()

    await v3Panel.getByRole('button', { name: 'Tags', exact: true }).click()
    await ruleTagPopover
      .locator('label')
      .filter({ hasText: 'Smoke label' })
      .locator('input')
      .check()
    assert.equal(await v3Panel.locator('.rule-row').count(), 1)
    await v3Panel.getByText('/api/v3-ui', { exact: true }).waitFor()
    await v3Panel.getByRole('button', { name: 'Tag: Smoke label' }).click()
    await v3Panel.getByRole('button', { name: 'Filter', exact: true }).click()
    await v3Panel
      .locator('.rule-filter-popover')
      .getByRole('button', { name: 'Clear filters' })
      .click()
    assert.ok((await v3Panel.locator('.rule-row').count()) > 1)
    await v3Panel
      .locator('.rule-filter-popover')
      .getByRole('button', { name: 'Close filters' })
      .click()

    await taggedRuleRow.first().getByRole('button', { name: 'Duplicate' }).click()
    let configAfterDuplicate
    let duplicatedTaggedRule
    for (let attempt = 0; attempt < 40; attempt += 1) {
      configAfterDuplicate = await restartedWorker.evaluate(
        async (key) => (await chrome.storage.local.get(key))[key],
        'ajax-proxy:storage:v3-config'
      )
      duplicatedTaggedRule = configAfterDuplicate.rules.find(
        (rule) => rule.match.url === '/api/v3-ui' && rule.id !== taggedRule.id
      )
      if (duplicatedTaggedRule) break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    const sourceRuleIndex = configAfterDuplicate.rules.findIndex(
      (rule) => rule.id === taggedRule.id
    )
    const duplicateRuleIndex = configAfterDuplicate.rules.findIndex(
      (rule) => rule.id === duplicatedTaggedRule.id
    )
    assert.equal(duplicateRuleIndex, sourceRuleIndex + 1, 'the copy follows its source rule')
    assert.equal(duplicatedTaggedRule.enabled, false, 'a copied rule starts disabled')
    assert.deepEqual(duplicatedTaggedRule.tagIds, taggedRule.tagIds)
    assert.deepEqual(duplicatedTaggedRule.response, taggedRule.response)
    assert.equal(
      await restartedWorker.evaluate(
        async ({ key, ruleId }) => ((await chrome.storage.local.get(key))[key] || {})[ruleId] || 0,
        { key: 'ajax-proxy:storage:v3-hits', ruleId: duplicatedTaggedRule.id }
      ),
      0,
      'a copied rule does not copy hit counters'
    )

    const sourceRuleCheckbox = v3Panel.getByRole('checkbox', {
      name: `Select rule /api/v3-ui (${taggedRule.id})`,
    })
    const duplicateRuleCheckbox = v3Panel.getByRole('checkbox', {
      name: `Select rule /api/v3-ui (${duplicatedTaggedRule.id})`,
    })
    await sourceRuleCheckbox.check()
    await duplicateRuleCheckbox.check()
    await v3Panel.getByText('2 rules selected', { exact: true }).waitFor()
    const configBeforeBulkUpdate = configAfterDuplicate
    await v3Panel.getByRole('button', { name: 'Enable selected', exact: true }).click()
    let configAfterBulkEnable
    for (let attempt = 0; attempt < 40; attempt += 1) {
      configAfterBulkEnable = await restartedWorker.evaluate(
        async (key) => (await chrome.storage.local.get(key))[key],
        'ajax-proxy:storage:v3-config'
      )
      if (
        configAfterBulkEnable.rules
          .filter((rule) => [taggedRule.id, duplicatedTaggedRule.id].includes(rule.id))
          .every((rule) => rule.enabled)
      )
        break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    const selectedRulesAfterBulkEnable = configAfterBulkEnable.rules.filter((rule) =>
      [taggedRule.id, duplicatedTaggedRule.id].includes(rule.id)
    )
    assert.equal(selectedRulesAfterBulkEnable.length, 2)
    assert.ok(selectedRulesAfterBulkEnable.every((rule) => rule.enabled))
    for (const updatedRule of selectedRulesAfterBulkEnable) {
      const originalRule = configBeforeBulkUpdate.rules.find((rule) => rule.id === updatedRule.id)
      assert.deepEqual(updatedRule.request, originalRule.request)
      assert.deepEqual(updatedRule.response, originalRule.response)
    }
    assert.deepEqual(
      configAfterBulkEnable.rules
        .filter((rule) => ![taggedRule.id, duplicatedTaggedRule.id].includes(rule.id))
        .map((rule) => [rule.id, rule.enabled]),
      configBeforeBulkUpdate.rules
        .filter((rule) => ![taggedRule.id, duplicatedTaggedRule.id].includes(rule.id))
        .map((rule) => [rule.id, rule.enabled]),
      'bulk enable leaves unselected rules unchanged'
    )
    await sourceRuleCheckbox.check()
    await duplicateRuleCheckbox.check()
    await v3Panel.getByText('2 rules selected', { exact: true }).waitFor()
    await v3Panel.getByRole('button', { name: 'Disable selected', exact: true }).click()
    let configAfterBulkDisable
    for (let attempt = 0; attempt < 40; attempt += 1) {
      configAfterBulkDisable = await restartedWorker.evaluate(
        async (key) => (await chrome.storage.local.get(key))[key],
        'ajax-proxy:storage:v3-config'
      )
      if (
        configAfterBulkDisable.rules
          .filter((rule) => [taggedRule.id, duplicatedTaggedRule.id].includes(rule.id))
          .every((rule) => !rule.enabled)
      )
        break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    const selectedRulesAfterBulkDisable = configAfterBulkDisable.rules.filter((rule) =>
      [taggedRule.id, duplicatedTaggedRule.id].includes(rule.id)
    )
    assert.ok(selectedRulesAfterBulkDisable.every((rule) => !rule.enabled))
    for (const updatedRule of selectedRulesAfterBulkDisable) {
      const enabledRule = configAfterBulkEnable.rules.find((rule) => rule.id === updatedRule.id)
      assert.deepEqual(updatedRule.request, enabledRule.request)
      assert.deepEqual(updatedRule.response, enabledRule.response)
    }
    await v3Panel.getByRole('group', { name: 'Bulk rule actions' }).waitFor({ state: 'detached' })

    await v3Panel.locator('.sidebar .nav-item').nth(1).click()
    await v3Panel.getByRole('button', { name: 'Create redirect rule' }).click()
    const taggedRedirectEditor = v3Panel.locator('.rule-editor[role="dialog"]')
    await taggedRedirectEditor
      .locator('label.editor-field')
      .nth(0)
      .locator('input')
      .fill('/api/tagged-redirect')
    await taggedRedirectEditor
      .locator('label.editor-field')
      .nth(3)
      .locator('input')
      .fill('/mock/echo')
    await taggedRedirectEditor
      .locator('.rule-tag-picker label')
      .filter({ hasText: 'Smoke label' })
      .locator('input')
      .check()
    await taggedRedirectEditor
      .locator('.rule-tag-picker label')
      .filter({ hasText: 'Secondary label' })
      .locator('input')
      .check()
    await taggedRedirectEditor.getByRole('button', { name: 'Save' }).click()
    let taggedRedirectRule
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const currentConfig = await restartedWorker.evaluate(
        async (key) => (await chrome.storage.local.get(key))[key],
        'ajax-proxy:storage:v3-config'
      )
      taggedRedirectRule = currentConfig.rules.find(
        (rule) => rule.match.url === '/api/tagged-redirect'
      )
      if (taggedRedirectRule?.tagIds?.length) break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    assert.equal(
      taggedRedirectRule.tagIds.length,
      2,
      'the redirect editor persists both selected tag references'
    )

    await v3Panel.getByRole('button', { name: 'Tags', exact: true }).click()
    await v3Panel
      .locator('.rule-tag-filter-popover')
      .getByRole('button', { name: 'Manage tags' })
      .click()
    const manageTagsDialog = v3Panel.getByRole('dialog', { name: 'Manage rule tags' })
    const smokeTagRow = manageTagsDialog.locator('li').filter({ hasText: 'Smoke label' })
    await smokeTagRow.getByRole('button', { name: 'Delete' }).click()
    await manageTagsDialog.getByRole('button', { name: 'Done', exact: true }).click()
    const configAfterTagDelete = await restartedWorker.evaluate(
      async (key) => (await chrome.storage.local.get(key))[key],
      'ajax-proxy:storage:v3-config'
    )
    assert.equal(configAfterTagDelete.tags.length, 1)
    assert.ok(
      configAfterTagDelete.rules
        .filter((rule) =>
          [taggedRule.id, taggedRedirectRule.id, duplicatedTaggedRule.id].includes(rule.id)
        )
        .every(
          (rule) => rule.tagIds?.length === 1 && ![taggedRule.tagIds[0]].includes(rule.tagIds[0])
        ),
      "deleting one tag preserves every rule's remaining association"
    )
    await v3Panel.getByRole('button', { name: 'Tags', exact: true }).click()
    await v3Panel
      .locator('.rule-tag-filter-popover')
      .getByRole('button', { name: 'Manage tags' })
      .click()
    const lastTagDialog = v3Panel.getByRole('dialog', { name: 'Manage rule tags' })
    await lastTagDialog.locator('li').getByRole('button', { name: 'Delete' }).click()
    await lastTagDialog.getByRole('button', { name: 'Done', exact: true }).click()
    const configAfterAllTagsDelete = await restartedWorker.evaluate(
      async (key) => (await chrome.storage.local.get(key))[key],
      'ajax-proxy:storage:v3-config'
    )
    assert.equal(configAfterAllTagsDelete.tags.length, 0)
    assert.equal(
      configAfterAllTagsDelete.rules.some((rule) =>
        rule.tagIds?.some((id) => [taggedRule.tagIds[0], taggedRedirectRule.tagIds[0]].includes(id))
      ),
      false,
      'deleting a tag removes its references from all rules'
    )

    await restartedPage.reload()
    await restartedPage.waitForFunction(
      () => !document.getElementById('ajax-proxy-v3-function-sandbox')
    )
    const restoredFunctionResult = await restartedPage.evaluate(async () => {
      const response = await fetch('/api/function', { method: 'POST', body: 'function request' })
      return { status: response.status, body: await response.json() }
    })
    assert.deepEqual(restoredFunctionResult, {
      status: 200,
      body: { source: 'server', method: 'POST', body: 'function request' },
    })

    console.log(
      'Unpacked extension V2 and V3 panel persistence, JSON and function Fetch interception, XHR, iframe, redirect, and service worker restart smoke passed'
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
