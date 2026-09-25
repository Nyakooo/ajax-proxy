const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')

const root = path.resolve(__dirname, '..')
const sourcePath = path.join(root, 'docs/brand/ajax-proxy-mark.svg')
const outputDir = path.join(root, 'packages/shell-chrome/icons')
const previewPath = path.join(root, 'docs/brand/v3-icon-matrix.png')

function svgForSize(source, state, size) {
  return source
    .replace('data-state="active"', `data-state="${state}"`)
    .replace('width="128" height="128"', `width="${size}" height="${size}"`)
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true })
  const source = fs.readFileSync(sourcePath, 'utf8')
  const browser = await chromium.launch({ channel: 'chromium', headless: true })

  try {
    const page = await browser.newPage({ viewport: { width: 128, height: 128 } })
    const rendered = new Map()
    for (const [state, suffix] of [
      ['active', ''],
      ['inactive', 'g'],
    ]) {
      for (const size of [16, 24, 48, 128]) {
        await page.setViewportSize({ width: size, height: size })
        await page.setContent(
          `<style>html,body{margin:0;padding:0;background:transparent}</style>${svgForSize(source, state, size)}`
        )
        const png = await page.locator('svg').screenshot({ type: 'png', omitBackground: true })
        if (size === 48 || size === 128)
          fs.writeFileSync(path.join(outputDir, `${size}${suffix}.png`), png)
        rendered.set(`${state}-${size}`, png.toString('base64'))
      }
    }

    const previewPage = await browser.newPage({
      viewport: { width: 780, height: 290 },
      deviceScaleFactor: 1,
    })
    const samples = [
      { label: '16 px', size: 16 },
      { label: '24 px', size: 24 },
      { label: '48 px', size: 48 },
      { label: '128 px', size: 128 },
      { label: 'inactive 48 px', size: 48, state: 'inactive' },
    ]
    const cards = samples
      .map(({ label, size, state = 'active' }) => {
        const icon = rendered.get(`${state}-${size}`)
        return `<figure><div class="sample" style="width:${Math.max(150, size + 24)}px;height:150px"><img style="width:${size}px;height:${size}px" src="data:image/png;base64,${icon}" /></div><figcaption>${label}</figcaption></figure>`
      })
      .join('')
    await previewPage.setContent(
      `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:18px;background:#f3f7f6;color:#17343a;font:14px system-ui,sans-serif}main{display:flex;align-items:flex-end;gap:12px}figure{margin:0;text-align:center}.sample{display:flex;align-items:center;justify-content:center;background:#fff;border:1px solid #dbe5e3;border-radius:12px}figcaption{padding-top:8px}</style><main>${cards}</main>`
    )
    await previewPage.screenshot({ path: previewPath, fullPage: true })
    await previewPage.close()
  } finally {
    await browser.close()
  }

  for (const size of [48, 128]) {
    for (const suffix of ['', 'g']) {
      const png = fs.readFileSync(path.join(outputDir, `${size}${suffix}.png`))
      const dimensions = [png.readUInt32BE(16), png.readUInt32BE(20)]
      if (dimensions[0] !== size || dimensions[1] !== size) {
        throw new Error(
          `icons/${size}${suffix}.png has unexpected dimensions ${dimensions.join('x')}`
        )
      }
    }
  }

  console.log('Rendered Ajax Proxy active/inactive icons (48/128 px) and 16/24/48/128 px preview.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
