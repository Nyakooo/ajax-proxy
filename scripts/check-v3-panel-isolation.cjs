const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const panelDir = path.join(root, 'packages/vue3-panels')
const panelPackage = JSON.parse(fs.readFileSync(path.join(panelDir, 'package.json'), 'utf8'))
const rootPackage = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const editorPrototypeConfig = fs.readFileSync(
  path.join(panelDir, 'vite.editor-prototype.config.mjs'),
  'utf8'
)
const errors = []
const forbiddenPackages = [
  'element-ui',
  'vue-template-compiler',
  '@proxy/vue-panels',
  '@proxy/code-editor',
  '@proxy/json-editor',
  '@proxy/v2-compatibility',
]
const prototypeOnlyPackages = [
  '@codemirror/commands',
  '@codemirror/lang-json',
  '@codemirror/language',
  '@codemirror/state',
  '@codemirror/view',
  'jsoneditor',
]

if (!/^\^?3\./.test(panelPackage.dependencies?.vue || '')) {
  errors.push('V3 panel must install a Vue 3 runtime.')
}
if (!panelPackage.dependencies?.primevue || !panelPackage.dependencies?.['@primeuix/themes']) {
  errors.push('V3 panel must own its PrimeVue 4 UI dependencies.')
}

for (const dependency of forbiddenPackages) {
  if (panelPackage.dependencies?.[dependency] || panelPackage.devDependencies?.[dependency]) {
    errors.push(`V3 panel must not depend on Vue 2 package ${dependency}`)
  }
}

for (const dependency of prototypeOnlyPackages) {
  if (panelPackage.dependencies?.[dependency]) {
    errors.push(
      `Editor comparison dependency ${dependency} must stay out of production dependencies.`
    )
  }
}

const prototypeOutput = editorPrototypeConfig.match(/outDir:\s*['"]([^'"]+)['"]/)?.[1]
const productionOutput = path.resolve(panelDir, 'dist')
const resolvedPrototypeOutput = prototypeOutput && path.resolve(panelDir, prototypeOutput)
if (
  !resolvedPrototypeOutput ||
  resolvedPrototypeOutput === productionOutput ||
  resolvedPrototypeOutput.startsWith(`${productionOutput}${path.sep}`)
) {
  errors.push('Editor prototype output must stay outside the production dist/ directory.')
}

const forbiddenImport =
  /(?:element-ui|vue-template-compiler|@proxy\/(?:vue-panels|code-editor|json-editor|v2-compatibility))/
function inspectSources(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      inspectSources(filePath)
    } else if (/\.(?:js|ts|vue)$/.test(entry.name)) {
      const content = fs.readFileSync(filePath, 'utf8')
      if (forbiddenImport.test(content)) {
        errors.push(
          `V3 panel source references a Vue 2-only dependency: ${path.relative(root, filePath)}`
        )
      }
    }
  }
}
inspectSources(path.join(panelDir, 'src'))

const productionPackScript = rootPackage.scripts?.pkg || ''
const productionPackSource = fs.readFileSync(path.join(root, 'scripts/pkg.cjs'), 'utf8')
if (!productionPackScript.includes('scripts/pkg.cjs')) {
  errors.push('Production pkg must use the audited package staging script.')
}
if (!productionPackSource.includes("source: 'packages/vue-panels/dist'")) {
  errors.push('Production pkg must continue copying the Vue 2 panel until an explicit cutover.')
}
if (!productionPackSource.includes("target: 'panels'")) {
  errors.push(
    'Production pkg must keep writing to the existing panels/ directory until an explicit cutover.'
  )
}
if (
  !productionPackSource.includes("source: 'packages/vue3-panels/dist'") ||
  !productionPackSource.includes("target: 'panels-v3'")
) {
  errors.push('Production pkg must stage the Vue 3 candidate panel separately under panels-v3/.')
}

const panelWorker = fs.readFileSync(
  path.join(root, 'packages/shell-chrome/src/service-worker/panel.ts'),
  'utf8'
)
if (!panelWorker.includes('panels/index.html')) {
  errors.push(
    'Production service worker must keep opening panels/index.html until an explicit cutover.'
  )
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join('\n'))
  process.exitCode = 1
} else {
  console.log(
    'Vue 3 panel isolation check passed; Vue 2 production and Vue 3 staging paths are separate.'
  )
}
