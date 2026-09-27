const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { chromium } = require('playwright')
const V3_BACKUP_VERSION = 8

async function main() {
  const extensionPath = path.resolve(
    process.env.AJAX_PROXY_EXTENSION_PATH || 'packages/shell-chrome/build-vite'
  )
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionPath, 'manifest.json'), 'utf8'))
  assert.equal(manifest.action.default_popup, 'panels-v3/popup.html')
  assert.ok(manifest.commands._execute_action)
  assert.ok(manifest.commands.open_panel)
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ajax-proxy-unified-rules-'))
  let context
  try {
    context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      headless: true,
      colorScheme: 'dark',
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    })
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'))
    const id = new URL(worker.url()).hostname
    const rules = Array.from({ length: 35 }, (_, index) => ({
      id: `verify-rule-${index}`,
      enabled: true,
      pinned: index < 30,
      match: { url: `/verify/${String(index).padStart(2, '0')}`, method: 'GET' },
      ...(index % 2
        ? { request: { enabled: true, redirect: { url: '/target' } } }
        : { response: { enabled: true, replace: { body: { index } } } }),
    }))
    await worker.evaluate(
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
    const panel = await context.newPage()
    await panel.goto(`chrome-extension://${id}/panels-v3/index.html`)
    await panel.locator('.rule-row').nth(19).waitFor()
    assert.equal(await panel.locator('.rule-row').count(), 20)
    assert.equal(await panel.locator('.sidebar .nav-item').count(), 1)
    await panel.getByRole('button', { name: 'Next', exact: true }).click()
    assert.equal(await panel.locator('.rule-row').count(), 15)
    await panel.locator('.search-box input').fill('method:GET pinned:true')
    const previous = panel.getByRole('button', { name: 'Previous', exact: true })
    if ((await previous.isVisible()) && (await previous.isEnabled())) await previous.click()
    assert.equal(await panel.locator('.rule-row').count(), 20)
    await panel.locator('.search-box input').fill('/verify/34')
    assert.equal(await panel.locator('.rule-row').count(), 1)

    const popup = await context.newPage()
    await popup.goto(`chrome-extension://${id}/panels-v3/popup.html`)
    await popup.locator('.rule-card').nth(34).waitFor()
    assert.equal(await popup.locator('.rule-card').count(), 35)
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
    await popup.screenshot({ path: '/tmp/ajax-proxy-popup-unified.png' })
    assert.ok(
      await popup.locator('html').evaluate((element) => element.classList.contains('app-dark'))
    )
    await popup.getByRole('combobox', { name: 'Theme', exact: true }).selectOption('light')
    await panel.waitForFunction(() => !document.documentElement.classList.contains('app-dark'))
    await popup.waitForFunction(() => !document.documentElement.classList.contains('app-dark'))
    await popup.getByRole('searchbox').fill('pinned:true type:redirect')
    assert.equal(await popup.locator('.rule-card').count(), 15)
    await popup.getByRole('searchbox').fill('/verify/34')
    const row = popup.locator('.rule-card')
    await row.locator('.rule-switch').click()
    await worker.evaluate(async () => {
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
    const [editorPage] = await Promise.all([
      context.waitForEvent('page', { timeout: 8000 }).catch(async (error) => {
        console.error(
          'Popup editor handoff:',
          await popup.locator('body').innerText(),
          context.pages().map((page) => page.url())
        )
        throw error
      }),
      row.getByRole('button', { name: 'Edit rule: /verify/34', exact: true }).click(),
    ])
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
    await row.getByRole('button', { name: 'Delete rule: /verify/34', exact: true }).click()
    await popup
      .getByRole('group', { name: 'Delete this rule?' })
      .getByRole('button', { name: 'Delete', exact: true })
      .click()
    await popup.getByText('No matching rules', { exact: true }).waitFor()
    console.log(
      'Unified rules pagination, 30 pinned rules, popup scrolling/search/toggle/pin/delete and editor handoff passed'
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
