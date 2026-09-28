const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const extensionPath = path.resolve(
  process.env.AJAX_PROXY_EXTENSION_PATH || 'packages/shell-chrome/build'
)
const manifestPath = path.join(extensionPath, 'manifest.json')
assert.ok(fs.existsSync(manifestPath), `production manifest is missing: ${manifestPath}`)

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
assert.equal(manifest.action?.default_popup, 'panels-v3/popup.html')
assert.equal(manifest.background?.service_worker, 'service_worker.js')
assert.ok(manifest.commands?._execute_action)

const requiredFiles = [
  'content.js',
  'document.js',
  'service_worker.js',
  'panels-v3/index.html',
  'panels-v3/popup.html',
  'v3-sandbox/sandbox.html',
  'icons/48.png',
]
for (const file of requiredFiles) {
  assert.ok(fs.existsSync(path.join(extensionPath, file)), `production asset is missing: ${file}`)
}

const worker = fs.readFileSync(path.join(extensionPath, manifest.background.service_worker), 'utf8')
assert.ok(
  worker.includes('panels-v3/index.html'),
  'service worker must open the V3 panel by default'
)
assert.ok(
  fs.statSync(path.join(extensionPath, 'panels-v3/assets')).isDirectory(),
  'production V3 panel assets must be bundled into the extension output'
)
assert.ok(
  !fs.existsSync(path.join(extensionPath, 'panels')),
  'production output must not include the retired Vue 2 panel'
)

console.log('Production Vite extension layout smoke passed')
