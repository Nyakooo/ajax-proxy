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
]
const requiredEditorPackages = [
  '@codemirror/commands',
  '@codemirror/lang-json',
  '@codemirror/language',
  '@codemirror/state',
  '@codemirror/view',
]
const prototypeOnlyPackages = ['jsoneditor']

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

for (const dependency of requiredEditorPackages) {
  if (!panelPackage.dependencies?.[dependency]) {
    errors.push(`Production V3 editor dependency ${dependency} must be declared in dependencies.`)
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
  /(?:element-ui|vue-template-compiler|@proxy\/(?:vue-panels|code-editor|json-editor))/
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
if (
  !productionPackSource.includes("source: 'packages/vue3-panels/dist'") ||
  !productionPackSource.includes("target: 'panels-v3'")
) {
  errors.push('Production pkg must stage the V3 panel under panels-v3/.')
}
if (
  productionPackSource.includes('packages/vue-panels/dist') ||
  productionPackSource.includes("target: 'panels'")
) {
  errors.push('Production pkg must not include the retired Vue 2 panel.')
}

const panelWorker = fs.readFileSync(
  path.join(root, 'packages/shell-chrome/src/service-worker/panel.ts'),
  'utf8'
)
if (!panelWorker.includes("const panelPath = 'panels-v3/index.html'")) {
  errors.push('Production service worker must default to panels-v3/index.html.')
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join('\n'))
  process.exitCode = 1
} else {
  console.log('V3 panel isolation check passed; production packages only the V3 panel.')
}
