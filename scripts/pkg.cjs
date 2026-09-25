const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const extensionBuild = path.join(root, 'packages/shell-chrome/build')
const panels = [
  { source: 'packages/vue-panels/dist', target: 'panels' },
  { source: 'packages/vue3-panels/dist', target: 'panels-v3' },
]

for (const panel of panels) {
  const source = path.join(root, panel.source)
  const target = path.join(extensionBuild, panel.target)
  if (!fs.existsSync(path.join(source, 'index.html'))) {
    throw new Error(`Panel build is missing: ${path.relative(root, source)}/index.html`)
  }

  fs.rmSync(target, { recursive: true, force: true })
  fs.cpSync(source, target, { recursive: true })
  console.log(`Packaged ${path.relative(root, source)} -> ${path.relative(root, target)}`)
}
