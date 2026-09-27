const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { chromium } = require('playwright')

async function main() {
  const extensionPath = path.resolve(
    process.env.AJAX_PROXY_EXTENSION_PATH || 'packages/shell-chrome/build-vite'
  )
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ajax-proxy-panel-open-'))
  let context
  try {
    context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    })
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'))
    const id = new URL(worker.url()).hostname
    const panelUrl = `chrome-extension://${id}/panels-v3/index.html`
    await worker.evaluate(async () => {
      await chrome.storage.local.set({
        'ajax-proxy:storage:v3-config': {
          format: 'ajax-proxy-backup',
          formatVersion: 8,
          settings: { globalEnabled: true, mode: 'interceptor', language: 'en' },
          disabledOrigins: [],
          tags: [],
          rules: [],
        },
      })
    })
    const popup = await context.newPage()
    await popup.goto(`chrome-extension://${id}/panels-v3/popup.html`)
    const openButton = popup.getByRole('button', { name: 'Open full panel', exact: true })
    const [panel] = await Promise.all([
      context.waitForEvent('page', { timeout: 8000 }),
      openButton.click(),
    ])
    await panel.locator('h1').waitFor({ timeout: 8000 })
    assert.equal(panel.url(), panelUrl)

    async function assertVisiblePanel() {
      await worker.evaluate(async (url) => {
        for (let attempt = 0; attempt < 100; attempt++) {
          const tabs = (await chrome.tabs.query({})).filter((tab) => tab.url === url)
          if (tabs.length > 1) throw new Error('Duplicate V3 panel tabs')
          if (tabs[0]?.active) {
            const window = await chrome.windows.get(tabs[0].windowId)
            if (window.type === 'normal' && window.focused && window.state !== 'minimized') return
          }
          await new Promise((resolve) => setTimeout(resolve, 20))
        }
        throw new Error('V3 panel was not activated in a visible normal browser window')
      }, panelUrl)
    }
    await assertVisiblePanel()
    const pageCount = context.pages().length
    await popup.bringToFront()
    await openButton.click()
    await assertVisiblePanel()
    assert.equal(context.pages().length, pageCount)
    console.log('V3 popup opens, activates and reuses a panel tab in a focused normal window')
  } finally {
    await context?.close()
    fs.rmSync(profile, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
