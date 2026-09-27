const fs = require('node:fs')
const path = require('node:path')
const { createWriteStream } = require('node:fs')
const archiver = require('archiver')

const root = path.resolve(__dirname, '..')
const extensionRoot = path.join(root, 'packages/shell-chrome')
const outputDir = path.join(extensionRoot, 'build-vite')
const entries = [
  { file: 'content', source: 'src/content.ts', globalName: 'AjaxProxyContent' },
  { file: 'document', source: 'src/document.ts', globalName: 'AjaxProxyDocument' },
  {
    file: 'service_worker',
    source: 'src/service-worker/index.ts',
    globalName: 'AjaxProxyServiceWorker',
  },
]

async function copyStaticAssets() {
  fs.copyFileSync(path.join(extensionRoot, 'manifest.json'), path.join(outputDir, 'manifest.json'))
  fs.cpSync(path.join(extensionRoot, 'icons'), path.join(outputDir, 'icons'), {
    recursive: true,
  })
  fs.cpSync(path.join(extensionRoot, 'src/v3-sandbox'), path.join(outputDir, 'v3-sandbox'), {
    recursive: true,
  })

  for (const [source, target] of [
    ['packages/vue-panels/dist', 'panels'],
    ['packages/vue3-panels/dist', 'panels-v3'],
  ]) {
    const panelOutput = path.join(root, source)
    if (!fs.existsSync(path.join(panelOutput, 'index.html'))) {
      throw new Error(`Panel build is missing: ${path.relative(root, panelOutput)}/index.html`)
    }
    fs.cpSync(panelOutput, path.join(outputDir, target), { recursive: true })
  }
}

function validateManifestAssets() {
  const manifest = JSON.parse(fs.readFileSync(path.join(outputDir, 'manifest.json'), 'utf8'))
  const references = [
    manifest.background?.service_worker,
    ...(manifest.content_scripts ?? []).flatMap((contentScript) => contentScript.js ?? []),
    ...(manifest.sandbox?.pages ?? []),
    ...(manifest.web_accessible_resources ?? []).flatMap((resource) => resource.resources ?? []),
    ...Object.values(manifest.icons ?? {}),
  ].filter(Boolean)

  for (const reference of references) {
    if (!fs.existsSync(path.join(outputDir, reference))) {
      throw new Error(`Manifest asset is missing from Vite output: ${reference}`)
    }
  }

  const classicScripts = [
    manifest.background?.service_worker,
    ...(manifest.content_scripts ?? [])
      .filter((script) => script.run_at === 'document_start')
      .flatMap((script) => script.js ?? []),
  ].filter(Boolean)
  for (const file of classicScripts) {
    const content = fs.readFileSync(path.join(outputDir, file), 'utf8')
    if (/^\s*(?:import|export)\s/m.test(content)) {
      throw new Error(
        `document_start and service worker scripts must remain classic bundles: ${file}`
      )
    }
  }

  for (const htmlFile of ['v3-sandbox/sandbox.html', 'panels/index.html', 'panels-v3/index.html']) {
    const htmlPath = path.join(outputDir, htmlFile)
    const html = fs.readFileSync(htmlPath, 'utf8')
    const localReferences = [...html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)]
      .map((match) => match[1])
      .filter((reference) => !/^(?:[a-z]+:|\/\/|#|data:)/i.test(reference))

    for (const reference of localReferences) {
      const assetPath = path.resolve(path.dirname(htmlPath), reference)
      if (!assetPath.startsWith(`${outputDir}${path.sep}`) || !fs.existsSync(assetPath)) {
        throw new Error(
          `HTML asset is missing or escapes the extension output: ${htmlFile} -> ${reference}`
        )
      }
    }
  }
}

async function createPrototypeZip() {
  const zipDir = path.join(root, 'zip')
  const zipPath = path.join(zipDir, 'ajax-proxy-vite-prototype.zip')
  fs.mkdirSync(zipDir, { recursive: true })

  await new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath)
    const archive = archiver('zip', { zlib: { level: 9 } })
    output.on('close', resolve)
    output.on('error', reject)
    archive.on('error', reject)
    archive.pipe(output)
    archive.directory(outputDir, false)
    archive.finalize()
  })

  console.log(`Vite prototype ZIP: ${path.relative(root, zipPath)}`)
}

async function main() {
  const { build } = await import('vite')
  fs.rmSync(outputDir, { recursive: true, force: true })
  fs.mkdirSync(outputDir, { recursive: true })

  for (const entry of entries) {
    await build({
      configFile: false,
      root: extensionRoot,
      mode: 'production',
      base: './',
      publicDir: false,
      logLevel: 'info',
      plugins: [
        {
          name: `verify-${entry.file}-classic-bundle`,
          generateBundle(outputOptions, bundle) {
            const chunks = Object.values(bundle).filter((item) => item.type === 'chunk')
            if (
              chunks.length !== 1 ||
              chunks[0].fileName !== `${entry.file}.js` ||
              outputOptions.format !== 'iife' ||
              chunks[0].imports.length > 0 ||
              chunks[0].dynamicImports.length > 0
            ) {
              throw new Error(
                `${entry.file} did not produce one self-contained classic IIFE bundle`
              )
            }
          },
        },
      ],
      build: {
        outDir: outputDir,
        emptyOutDir: false,
        target: 'chrome141',
        minify: 'esbuild',
        cssCodeSplit: false,
        lib: {
          entry: path.join(extensionRoot, entry.source),
          name: entry.globalName,
          formats: ['iife'],
          fileName: () => `${entry.file}.js`,
        },
        rollupOptions: {
          output: {
            inlineDynamicImports: true,
          },
        },
      },
    })
    console.log(`Verified ${entry.file}.js: single IIFE bundle`)
  }

  await copyStaticAssets()
  validateManifestAssets()
  console.log('Verified manifest paths and static extension assets')
  await createPrototypeZip()
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
