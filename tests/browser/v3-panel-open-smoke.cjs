const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { chromium } = require('playwright')

async function main() {
  const extensionPath = path.resolve(
    process.env.AJAX_PROXY_EXTENSION_PATH || 'packages/shell-chrome/build'
  )
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ajax-proxy-panel-open-'))
  let context
  try {
    context = await chromium.launchPersistentContext(profile, {
      channel: process.env.BROWSER_EXECUTABLE_PATH
        ? undefined
        : process.env.BROWSER_CHANNEL || 'chromium',
      executablePath: process.env.BROWSER_EXECUTABLE_PATH,
      headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    })
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'))
    const id = new URL(worker.url()).hostname
    const panelUrl = `chrome-extension://${id}/panels-v3/index.html`
    const popup = await context.newPage()
    await popup.goto(`chrome-extension://${id}/panels-v3/popup.html`)
    await popup.evaluate(async () => {
      await chrome.storage.local.set({
        'ajax-proxy:storage:v3-config': {
          format: 'ajax-proxy-backup',
          formatVersion: 9,
          settings: { globalEnabled: true, mode: 'interceptor', language: 'en' },
          disabledOrigins: [],
          tags: [],
          rules: [
            {
              id: 'open-panel-rule',
              enabled: true,
              match: { url: '/verify/panel-open', method: 'GET' },
              response: { enabled: true, replace: { body: { ok: true } } },
            },
          ],
        },
      })
    })
    const openButton = popup.getByRole('button', { name: 'Open full panel', exact: true })
    const [panel] = await Promise.all([
      context.waitForEvent('page', { timeout: 8000 }),
      openButton.click(),
    ])
    await panel.locator('h1').waitFor({ timeout: 8000 })
    assert.equal(panel.url(), panelUrl)

    async function assertVisiblePanel(type) {
      await worker.evaluate(
        async ({ url, type: windowType }) => {
          for (let attempt = 0; attempt < 100; attempt++) {
            const windows = await chrome.windows.getAll({})
            const tabs = (await chrome.tabs.query({})).filter(
              (tab) =>
                tab.url?.split('?')[0] === url &&
                windows.some((window) => window.id === tab.windowId && window.type === windowType)
            )
            if (tabs.length > 1) throw new Error(`Duplicate V3 ${windowType} panels`)
            if (tabs[0]?.active) {
              const window = windows.find((target) => target.id === tabs[0].windowId)
              if (
                window.focused &&
                window.state === 'normal' &&
                window.width > 0 &&
                window.height > 0
              )
                return
            }
            await new Promise((resolve) => setTimeout(resolve, 20))
          }
          throw new Error(`V3 ${windowType} panel was not activated in a visible window`)
        },
        { url: panelUrl, type }
      )
    }
    await assertVisiblePanel('popup')
    const pageCount = context.pages().length
    await popup.bringToFront()
    await openButton.click()
    await assertVisiblePanel('popup')
    assert.equal(context.pages().length, pageCount)
    const [tabPanel] = await Promise.all([
      context.waitForEvent('page', { timeout: 8000 }),
      popup.getByRole('button', { name: 'Open in tab', exact: true }).click(),
    ])
    await tabPanel.locator('h1').waitFor({ timeout: 8000 })
    await assertVisiblePanel('normal')
    await popup.getByRole('button', { name: 'Open in tab', exact: true }).click()
    await assertVisiblePanel('normal')
    assert.equal(context.pages().length, pageCount + 1)

    await popup.getByRole('button', { name: 'Edit rule: /verify/panel-open', exact: true }).click()
    await panel.locator('.response-rule-editor').waitFor({ timeout: 8000 })
    await assertVisiblePanel('popup')
    assert.equal(await tabPanel.locator('.response-rule-editor').count(), 0)
    console.log(
      'Independent V3 popup creation/reuse, explicit tab backup and isolated editor handoff passed'
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
