const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const extensionRoot = path.join(root, 'packages/shell-chrome')
const watchMode = process.argv.includes('--watch')
const outputDir = path.join(extensionRoot, watchMode ? 'build-vite-dev' : 'build')
const watchers = []
let closeWatchersPromise
let shutdownRequested = false
const entries = [
  { file: 'content', source: 'src/content.ts', globalName: 'AjaxProxyContent' },
  { file: 'document', source: 'src/document.ts', globalName: 'AjaxProxyDocument' },
  {
    file: 'service_worker',
    source: 'src/service-worker/index.ts',
    globalName: 'AjaxProxyServiceWorker',
  },
]

function closeWatchers() {
  if (!closeWatchersPromise) {
    closeWatchersPromise = Promise.allSettled(
      watchers.map((watcher) => Promise.resolve().then(() => watcher.close()))
    ).then((results) => {
      const rejected = results.find((result) => result.status === 'rejected')
      if (rejected) throw rejected.reason
    })
  }
  return closeWatchersPromise
}

async function handleShutdownSignal(signal) {
  shutdownRequested = true
  try {
    await closeWatchers()
  } catch (error) {
    console.error(`Failed to close Vite watchers after ${signal}:`, error)
    process.exitCode = 1
  }
}

if (watchMode) {
  process.once('SIGINT', () => void handleShutdownSignal('SIGINT'))
  process.once('SIGTERM', () => void handleShutdownSignal('SIGTERM'))
}

async function copyStaticAssets() {
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'manifest.json'), 'utf8'))
  manifest.action.default_popup = 'panels-v3/popup.html'
  manifest.commands._execute_action = { description: 'Open quick rules popup' }
  fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
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
    manifest.action?.default_popup,
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

  const serviceWorker = fs.readFileSync(
    path.join(outputDir, manifest.background.service_worker),
    'utf8'
  )
  if (!serviceWorker.includes('panels-v3/index.html')) {
    throw new Error('Vite service worker must open the V3 panel by default')
  }

  for (const htmlFile of [
    'v3-sandbox/sandbox.html',
    'panels/index.html',
    'panels-v3/index.html',
    'panels-v3/popup.html',
  ]) {
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

async function main() {
  const { build } = await import('vite')
  fs.rmSync(outputDir, { recursive: true, force: true })
  fs.mkdirSync(outputDir, { recursive: true })

  for (const entry of entries) {
    if (shutdownRequested) return
    let resolveInitialBuild
    let rejectInitialBuild
    let initialBuildCompleted = false
    const initialBuild = watchMode
      ? new Promise((resolve, reject) => {
          resolveInitialBuild = resolve
          rejectInitialBuild = reject
        })
      : undefined
    const watcherOrOutput = await build({
      configFile: false,
      root: extensionRoot,
      mode: watchMode ? 'development' : 'production',
      base: './',
      publicDir: false,
      logLevel: 'info',
      define:
        entry.file === 'service_worker'
          ? { __AJAX_PROXY_PANEL_PATH__: JSON.stringify('panels-v3/index.html') }
          : {},
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
        watch: watchMode ? {} : null,
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

    if (watchMode) {
      if (!watcherOrOutput || typeof watcherOrOutput.on !== 'function') {
        throw new Error(`Vite did not start a watcher for ${entry.file}.js`)
      }
      const watcher = watcherOrOutput
      watchers.push(watcher)
      if (shutdownRequested) {
        await watcher.close()
        return
      }
      watcher.on('event', (event) => {
        if (event.code === 'BUNDLE_START') {
          console.log(`Rebuilding ${entry.file}.js…`)
        } else if (event.code === 'BUNDLE_END') {
          console.log(`Rebuilt ${entry.file}.js`)
          initialBuildCompleted = true
          resolveInitialBuild()
        } else if (event.code === 'ERROR') {
          if (!initialBuildCompleted) {
            rejectInitialBuild(event.error)
          } else {
            console.error(
              `Vite rebuild failed for ${entry.file}.js; watcher remains active for the next source change:`,
              event.error
            )
          }
        }
      })
      await initialBuild
    } else {
      console.log(`Verified ${entry.file}.js: single IIFE bundle`)
    }
  }

  if (shutdownRequested) return
  await copyStaticAssets()
  validateManifestAssets()
  console.log(`Verified Vite extension build: ${path.relative(root, outputDir)}`)
  if (!watchMode) {
    return
  }

  console.log(
    `Watching shell sources. Reload the unpacked extension and page after each rebuild: ${path.relative(root, outputDir)}`
  )
}

main().catch(async (error) => {
  console.error(error)
  try {
    await closeWatchers()
  } catch (closeError) {
    console.error('Failed to close Vite watchers:', closeError)
  }
  process.exitCode = 1
})
