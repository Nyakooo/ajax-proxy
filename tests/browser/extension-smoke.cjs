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
    await v3Panel.getByText('/api/v3-ui', { exact: true }).waitFor()

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
