/* global JSONEditor */

const assert = require('node:assert/strict')
const path = require('node:path')
const { chromium } = require('playwright')

const jsonEditorRoot = path.resolve(__dirname, '../../packages/json-editor/node_modules/jsoneditor')
const jsonEditorScript = path.join(jsonEditorRoot, 'dist/jsoneditor.min.js')
const jsonEditorStyles = path.join(jsonEditorRoot, 'dist/jsoneditor.min.css')

async function main() {
  const browser = await chromium.launch({ headless: true })

  try {
    const page = await browser.newPage()
    await page.setContent('<div id="editor" style="height: 480px"></div>')
    await page.addStyleTag({ path: jsonEditorStyles })
    await page.addScriptTag({ path: jsonEditorScript })
    await page.evaluate(() => {
      window.jsonEditor = new JSONEditor(
        document.querySelector('#editor'),
        {
          mode: 'code',
          onError: () => {},
        },
        { sample: true }
      )
    })

    const code = page.locator('.ace_text-input')
    await code.fill('{"sample":}')
    const errorLine = page.locator('.ace_gutter-cell.ace_error')
    await errorLine.waitFor()
    assert.equal((await errorLine.innerText()).trim(), '1')
    console.log('JSON editor syntax error line reporting smoke passed')
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
