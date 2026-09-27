const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const net = require('node:net')
const path = require('node:path')
const { chromium } = require('playwright')

const root = path.resolve(__dirname, '../..')
const channel = process.env.BROWSER_CHANNEL || 'chromium'
const executablePath = process.env.BROWSER_EXECUTABLE_PATH
const label = process.env.BROWSER_LABEL || channel

async function reservePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
  return port
}

async function waitForPreview(previewProcess, url) {
  let processError
  previewProcess.once('error', (error) => {
    processError = error
  })

  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (processError) throw processError
    if (previewProcess.exitCode !== null) {
      throw new Error(`Vite preview exited early with code ${previewProcess.exitCode}`)
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(500) })
      if (response.ok) return
    } catch (error) {
      if (error.name !== 'TypeError' && error.name !== 'TimeoutError') throw error
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error('Timed out waiting for the V3 panel preview server')
}

async function stopPreview(previewProcess) {
  if (previewProcess.exitCode !== null) return

  try {
    if (process.platform === 'win32') previewProcess.kill('SIGTERM')
    else process.kill(-previewProcess.pid, 'SIGTERM')
  } catch (error) {
    if (error.code !== 'ESRCH') throw error
  }

  await Promise.race([
    new Promise((resolve) => previewProcess.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ])

  if (previewProcess.exitCode === null) {
    try {
      if (process.platform === 'win32') previewProcess.kill('SIGKILL')
      else process.kill(-previewProcess.pid, 'SIGKILL')
    } catch (error) {
      if (error.code !== 'ESRCH') throw error
    }
  }
}

async function assertPageFits(page, width, locale) {
  const layout = await page.evaluate(() => {
    const selectors = [
      '.shell',
      '.topbar',
      '.sidebar',
      '.content',
      '.content-heading',
      '.toolbar',
      '.search-box',
      '.rule-list',
      '.rule-row',
      '.rule-actions',
    ]
    const boxes = selectors.flatMap((selector) => {
      const element = document.querySelector(selector)
      if (!element) return []
      const { left, right } = element.getBoundingClientRect()
      return [
        {
          selector,
          left,
          right,
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
        },
      ]
    })
    const childOverflows = ['.topbar', '.content-heading', '.toolbar', '.rule-row'].flatMap(
      (selector) => {
        const parent = document.querySelector(selector)
        if (!parent) return []
        const parentRect = parent.getBoundingClientRect()
        return [...parent.children].flatMap((child) => {
          const rect = child.getBoundingClientRect()
          return rect.width > 0 &&
            (rect.left < parentRect.left - 1 || rect.right > parentRect.right + 1)
            ? [`${selector} > ${child.className || child.tagName}`]
            : []
        })
      }
    )

    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      boxes,
      childOverflows,
    }
  })

  assert.equal(layout.viewportWidth, width)
  assert.ok(
    Math.max(layout.documentWidth, layout.bodyWidth) <= width,
    `${width}px ${locale} page has horizontal document overflow: ${JSON.stringify(layout)}`
  )
  assert.deepEqual(
    layout.childOverflows,
    [],
    `${width}px ${locale} primary controls exceed their containers: ${JSON.stringify(layout)}`
  )
  for (const box of layout.boxes) {
    assert.ok(
      box.left >= -1 && box.right <= width + 1,
      `${width}px ${locale} ${box.selector} is outside the viewport: ${JSON.stringify(box)}`
    )
    assert.ok(
      box.scrollWidth <= box.clientWidth + 1,
      `${width}px ${locale} ${box.selector} has internal horizontal overflow: ${JSON.stringify(box)}`
    )
  }
}

async function main() {
  const port = await reservePort()
  const previewUrl = `http://127.0.0.1:${port}/`
  const previewProcess = spawn(
    'pnpm',
    [
      '-C',
      'packages/vue3-panels',
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--strictPort',
    ],
    { cwd: root, detached: process.platform !== 'win32', stdio: 'ignore' }
  )
  let browser

  try {
    await waitForPreview(previewProcess, previewUrl)
    browser = await chromium.launch({
      channel: executablePath ? undefined : channel,
      executablePath,
      headless: true,
    })

    for (const width of [400, 360]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      const pageErrors = []
      page.on('pageerror', (error) => pageErrors.push(error.message))

      const response = await page.goto(previewUrl, { waitUntil: 'networkidle' })
      assert.equal(response?.status(), 200)
      await page.locator('.rule-row').nth(2).waitFor()
      assert.equal(await page.locator('.rule-row').count(), 3)
      await assertPageFits(page, width, 'zh-CN')

      const search = page.locator('.search-box input')
      assert.ok(await search.isVisible())
      await search.fill('catalog')
      assert.equal(await page.locator('.rule-row').count(), 1)
      await search.fill('')
      assert.equal(await page.locator('.rule-row').count(), 3)

      await page.locator('.language-toggle button[aria-label="English"]').click()
      await assertPageFits(page, width, 'en')

      await page.locator('.content-heading > button').click()
      await page.getByRole('dialog').getByRole('button', { name: 'Create intercept rule' }).click()
      const dialog = page.locator('.response-rule-editor[role="dialog"]')
      await dialog.waitFor({ state: 'visible' })
      assert.match(await dialog.locator('h2').innerText(), /Create JSON response rule/)
      const dialogBox = await dialog.boundingBox()
      assert.ok(dialogBox, 'Response rule dialog should have a visible bounding box')
      assert.ok(dialogBox.x >= 0 && dialogBox.x + dialogBox.width <= width)
      assert.ok(dialogBox.width >= 280, `Dialog is too narrow at ${width}px: ${dialogBox.width}px`)

      const matchUrl = dialog.locator('.editor-field input').first()
      assert.ok(await matchUrl.isVisible())
      await matchUrl.fill('/responsive-layout-smoke')
      assert.equal(await matchUrl.inputValue(), '/responsive-layout-smoke')
      await page.keyboard.press('Escape')
      await dialog.waitFor({ state: 'detached' })

      assert.deepEqual(pageErrors, [], `${width}px page errors: ${pageErrors.join('; ')}`)
      await page.close()
    }

    console.log(`${label} V3 panel 400px / 360px responsive smoke passed`)
  } finally {
    await browser?.close()
    await stopPreview(previewProcess)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
