const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { chromium } = require('playwright')
const V3_BACKUP_VERSION = 10

async function main() {
  const extensionPath = path.resolve(
    process.env.AJAX_PROXY_EXTENSION_PATH || 'packages/shell-chrome/build'
  )
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionPath, 'manifest.json'), 'utf8'))
  assert.equal(manifest.action.default_popup, 'panels-v3/popup.html')
  assert.ok(manifest.commands._execute_action)
  assert.ok(manifest.commands.open_panel)
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ajax-proxy-unified-rules-'))
  let context
  try {
    context = await chromium.launchPersistentContext(profile, {
      channel: process.env.BROWSER_EXECUTABLE_PATH
        ? undefined
        : process.env.BROWSER_CHANNEL || 'chromium',
      executablePath: process.env.BROWSER_EXECUTABLE_PATH,
      headless: true,
      colorScheme: 'dark',
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    })
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'))
    const id = new URL(worker.url()).hostname
    const storagePage = await context.newPage()
    await storagePage.goto(`chrome-extension://${id}/panels-v3/index.html`)
    const rules = Array.from({ length: 46 }, (_, index) => ({
      id: `verify-rule-${index}`,
      enabled: true,
      pinned: index < 30,
      match: { url: `/verify/${String(index).padStart(2, '0')}`, method: 'GET' },
      ...(index === 45
        ? {
            request: { enabled: true, redirect: { url: '/target' } },
            response: { enabled: true, replace: { body: { index } } },
          }
        : index % 2
          ? { request: { enabled: true, redirect: { url: '/target' } } }
          : { response: { enabled: true, replace: { body: { index } } } }),
    }))
    await storagePage.evaluate(
      async (config) => chrome.storage.local.set({ 'ajax-proxy:storage:v3-config': config }),
      {
        format: 'ajax-proxy-backup',
        formatVersion: V3_BACKUP_VERSION,
        settings: { globalEnabled: true, mode: 'interceptor', language: 'en' },
        disabledOrigins: [],
        tags: [],
        rules,
      }
    )
    await storagePage.close()
    let panel = await context.newPage()
    await panel.goto(`chrome-extension://${id}/panels-v3/index.html`)
    await panel.locator('.rule-row').nth(19).waitFor()
    assert.equal(await panel.locator('.rule-row').count(), 20)
    assert.equal(await panel.locator('.sidebar .nav-item').count(), 2)
    assert.match(await panel.locator('h1').innerText(), /Response rules/)
    await panel.getByRole('button', { name: 'Next', exact: true }).click()
    assert.equal(await panel.locator('.rule-row').count(), 4)
    await panel.locator('.search-box input').fill('method:GET pinned:true')
    const previous = panel.getByRole('button', { name: 'Previous', exact: true })
    if ((await previous.isVisible()) && (await previous.isEnabled())) await previous.click()
    assert.equal(await panel.locator('.rule-row').count(), 15)
    await panel.locator('.search-box input').fill('/verify/34')
    assert.equal(await panel.locator('.rule-row').count(), 1)
    await panel.locator('.sidebar .nav-item').nth(1).click()
    assert.match(await panel.locator('h1').innerText(), /Redirect rules/)
    await panel.locator('.search-box input').fill('')
    assert.equal(await panel.locator('.rule-row').count(), 20)
    await panel.locator('.search-box input').fill('/verify/45')
    assert.equal(await panel.locator('.rule-row').count(), 1)

    const popup = await context.newPage()
    await popup.goto(`chrome-extension://${id}/panels-v3/popup.html`)
    await popup.locator('.rule-card').nth(45).waitFor()
    assert.equal(await popup.locator('.rule-card').count(), 46)
    // Chrome starts an action popup with a tiny viewport before measuring its document.
    // Its intrinsic size must not depend on that viewport (100vh collapses the popup).
    await popup.setViewportSize({ width: 400, height: 39 })
    assert.equal(
      await popup.locator('.popup').evaluate((el) => el.getBoundingClientRect().height),
      560
    )
    assert.equal(
      await popup.locator('html').evaluate((el) => el.getBoundingClientRect().height),
      560
    )
    await popup.setViewportSize({ width: 400, height: 560 })
    assert.ok(
      await popup
        .locator('.popup-footer')
        .evaluate((el) => el.getBoundingClientRect().bottom <= 560)
    )
    assert.ok(await popup.locator('.brand-row').evaluate((el) => el.scrollWidth <= el.clientWidth))
    const headerBefore = await popup.locator('.popup-header').boundingBox()
    await popup.locator('.rule-scroll').evaluate((element) => {
      element.scrollTop = 10000
    })
    const headerAfter = await popup.locator('.popup-header').boundingBox()
    assert.equal(headerBefore.y, headerAfter.y)
    assert.ok(await popup.locator('.rule-scroll').evaluate((element) => element.scrollTop > 0))
    await popup.locator('.rule-scroll').evaluate((element) => {
      element.scrollTop = 0
    })
    await panel.close()
    const [fullPanel] = await Promise.all([
      context.waitForEvent('page', { timeout: 8000 }),
      popup.getByRole('button', { name: 'Open full panel', exact: true }).click(),
    ])
    await fullPanel.locator('.rule-row').nth(19).waitFor({ timeout: 8000 })
    assert.equal(await fullPanel.locator('.rule-row').count(), 20)
    assert.match(await fullPanel.locator('h1').innerText(), /Response rules/)
    panel = fullPanel
    const assertVisiblePanel = (url) =>
      worker.evaluate(async (targetUrl) => {
        for (let attempt = 0; attempt < 100; attempt++) {
          const tabs = (await chrome.tabs.query({})).filter((tab) => tab.url === targetUrl)
          if (tabs.length > 1) throw new Error('Duplicate V3 panel tabs')
          if (tabs[0]?.active) {
            const window = await chrome.windows.get(tabs[0].windowId)
            if (window.type === 'popup' && window.focused && window.state === 'normal') return
          }
          await new Promise((resolve) => setTimeout(resolve, 20))
        }
        throw new Error('V3 panel was not activated in a visible independent popup window')
      }, url)
    await assertVisiblePanel(panel.url())
    const pageCount = context.pages().length
    await popup.bringToFront()
    await popup.getByRole('button', { name: 'Open full panel', exact: true }).click()
    await assertVisiblePanel(panel.url())
    assert.equal(context.pages().length, pageCount)
    await popup.screenshot({ path: '/tmp/ajax-proxy-popup-unified.png' })
    assert.ok(
      await popup.locator('html').evaluate((element) => element.classList.contains('app-dark'))
    )
    await popup.getByRole('combobox', { name: 'Theme', exact: true }).selectOption('light')
    await panel.waitForFunction(() => !document.documentElement.classList.contains('app-dark'))
    await popup.waitForFunction(() => !document.documentElement.classList.contains('app-dark'))
    await popup.getByRole('searchbox').fill('pinned:true type:redirect')
    assert.equal(await popup.locator('.rule-card').count(), 15)
    await popup.getByRole('searchbox').fill('')
    const actionFilter = popup.getByRole('combobox', { name: 'Rule type', exact: true })
    await actionFilter.selectOption('response')
    assert.equal(await popup.locator('.rule-card').count(), 24)
    await actionFilter.selectOption('redirect')
    assert.equal(await popup.locator('.rule-card').count(), 23)
    await popup.getByRole('searchbox').fill('/verify/45')
    const combinedRuleRow = popup.locator('.rule-card')
    await combinedRuleRow
      .getByRole('button', { name: 'Edit rule: /verify/45', exact: true })
      .click()
    const redirectEditor = panel.locator('.redirect-rule-editor')
    await redirectEditor.waitFor({ state: 'visible' })
    const matchUrlInput = redirectEditor.locator('label.editor-field').first().locator('input')
    const targetUrlInput = redirectEditor.getByLabel('Redirect target URL')
    assert.equal(await matchUrlInput.inputValue(), '/verify/45')
    assert.equal(await targetUrlInput.inputValue(), '/target')
    await panel.keyboard.press('Escape')
    await redirectEditor.waitFor({ state: 'visible' })
    assert.equal(await matchUrlInput.inputValue(), '/verify/45')
    assert.equal(await targetUrlInput.inputValue(), '/target')
    await panel.locator('.editor-backdrop').click({ position: { x: 5, y: 5 } })
    await redirectEditor.waitFor({ state: 'visible' })
    assert.equal(await matchUrlInput.inputValue(), '/verify/45')
    assert.equal(await targetUrlInput.inputValue(), '/target')
    await panel.locator('.redirect-rule-editor .editor-close').click()
    await redirectEditor.waitFor({ state: 'hidden' })
    await actionFilter.selectOption('response')
    await combinedRuleRow
      .getByRole('button', { name: 'Edit rule: /verify/45', exact: true })
      .click()
    await panel.locator('.response-rule-editor').waitFor({ state: 'visible' })
    await panel.locator('.response-rule-editor .editor-close').click()
    await actionFilter.selectOption('all')
    await popup.getByRole('searchbox').fill('/verify/34')
    const row = popup.locator('.rule-card')
    await row.locator('.rule-switch').click()
    await panel.evaluate(async () => {
      const key = 'ajax-proxy:storage:v3-config'
      for (let attempt = 0; attempt < 100; attempt++) {
        const config = (await chrome.storage.local.get(key))[key]
        if (!config.rules.find((rule) => rule.id === 'verify-rule-34').enabled) return
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
      throw new Error('Popup rule toggle was not persisted')
    })
    await row.getByRole('button', { name: 'Pin rule', exact: true }).click()
    await row.getByRole('button', { name: 'Unpin rule', exact: true }).waitFor()
    await row.getByRole('button', { name: 'Edit rule: /verify/34', exact: true }).click()
    const editorPage = panel
    await editorPage
      .locator('.response-rule-editor')
      .waitFor({ timeout: 8000 })
      .catch(async (error) => {
        console.error(
          'Editor page:',
          editorPage.url(),
          await editorPage.locator('body').innerText()
        )
        throw error
      })
    assert.equal(
      await editorPage
        .locator('.response-rule-editor label.editor-field')
        .first()
        .locator('input')
        .inputValue(),
      '/verify/34'
    )
    await editorPage.locator('.response-rule-editor .editor-close').click()
    await panel.reload()
    await panel.locator('.rule-row').nth(19).waitFor()

    const selectedRows = panel.locator('.rule-row')
    await selectedRows.nth(0).locator('.rule-selection input').check()
    await selectedRows.nth(1).locator('.rule-selection input').check()
    const bulkActions = panel.locator('.bulk-actions')
    await bulkActions.waitFor()
    const bulkButtonMetrics = await bulkActions.locator('.p-button').evaluateAll((buttons) =>
      buttons.map((button) => ({
        fontSize: getComputedStyle(button).fontSize,
        height: button.getBoundingClientRect().height,
      }))
    )
    assert.ok(
      bulkButtonMetrics.every(({ fontSize, height }) => fontSize === '11px' && height <= 30)
    )
    panel.once('dialog', async (dialog) => await dialog.accept())
    await bulkActions.getByRole('button', { name: 'Delete selected', exact: true }).click()
    await panel.evaluate(async () => {
      const key = 'ajax-proxy:storage:v3-config'
      for (let attempt = 0; attempt < 100; attempt++) {
        const config = (await chrome.storage.local.get(key))[key]
        if (config.rules.length === 44) return
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
      throw new Error('Bulk delete did not persist exactly two selected rules')
    })
    await bulkActions.waitFor({ state: 'detached' })
    await row.getByRole('button', { name: 'Delete rule: /verify/34', exact: true }).click()
    await popup
      .getByRole('group', { name: 'Delete this rule?' })
      .getByRole('button', { name: 'Delete', exact: true })
      .click()
    await popup.getByText('No matching rules', { exact: true }).waitFor()
    assert.equal(await popup.locator('.rule-scroll').getAttribute('aria-label'), 'Rules')
    await panel.evaluate(async () => {
      const key = 'ajax-proxy:storage:v3-config'
      const config = (await chrome.storage.local.get(key))[key]
      config.settings.language = 'zh-CN'
      await chrome.storage.local.set({ [key]: config })
    })
    await popup.reload()
    await popup.locator('.rule-scroll').waitFor()
    assert.equal(await popup.locator('.rule-scroll').getAttribute('aria-label'), '规则')
    console.log(
      'Independent popup creation/reuse, localized accessible labels, separate response/redirect views, popup action filtering, 30 pinned rules, combined-rule editing, compact bulk actions and bulk deletion passed'
    )
  } finally {
    await context?.close()
    fs.rmSync(profile, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
