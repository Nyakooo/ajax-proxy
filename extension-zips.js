const fs = require('fs')
const path = require('path')
const archiver = require('archiver')
const IS_CI = !!(process.env.CIRCLECI || process.env.GITHUB_ACTIONS)
const ProgressBar = require('progress')
const PKG = require('./package.json')

const ROOT = __dirname
const SOURCE_DIR = path.join(ROOT, 'packages', 'shell-chrome')
const BUILD_DIR = path.join(SOURCE_DIR, 'build')
const ZIP_DIR = path.join(ROOT, 'zip')
const REQUIRED_FILES = [
  'manifest.json',
  'content.js',
  'document.js',
  'service_worker.js',
  'icons/128.png',
  'icons/48.png',
  'panels-v3/index.html',
  'panels-v3/popup.html',
  'v3-sandbox/sandbox.html',
  'v3-sandbox/sandbox.js',
]
const REQUIRED_DIRECTORIES = ['icons', 'panels-v3', 'v3-sandbox']
const INCLUDE_GLOBS = [
  'icons/**',
  'panels/**',
  'panels-v3/**',
  'v3-sandbox/**',
  'content.js',
  'document.js',
  'manifest.json',
  'service_worker.js',
]

function bytesToSize(bytes) {
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  if (bytes === 0) return '0 Byte'
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)))
  return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i]
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    throw new Error(`Cannot read ${label} at ${path.relative(ROOT, filePath)}: ${error.message}`)
  }
}

function walkFiles(directory, relativeTo = directory) {
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name)
    if (entry.isSymbolicLink()) {
      throw new Error(
        `Packaged assets cannot be symbolic links: ${path.relative(BUILD_DIR, filePath)}`
      )
    }
    if (entry.isDirectory()) {
      files.push(...walkFiles(filePath, relativeTo))
    } else if (entry.isFile()) {
      files.push(path.relative(relativeTo, filePath).split(path.sep).join('/'))
    }
  }
  return files
}

function resolveIncludedFiles() {
  const packageFiles = new Set()

  for (const pattern of INCLUDE_GLOBS) {
    if (pattern.endsWith('/**')) {
      const relativeDir = pattern.slice(0, -3)
      const directory = path.join(BUILD_DIR, relativeDir)
      if (!fs.existsSync(directory)) {
        // `panels/` was used by the retired panel; current builds use `panels-v3/`.
        if (relativeDir === 'panels') continue
        throw new Error(`Required extension directory is missing: ${relativeDir}/`)
      }
      if (!fs.statSync(directory).isDirectory()) {
        throw new Error(`Required extension path is not a directory: ${relativeDir}/`)
      }
      for (const file of walkFiles(directory, BUILD_DIR)) packageFiles.add(file)
      continue
    }

    const filePath = path.join(BUILD_DIR, pattern)
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      throw new Error(`Required extension file is missing: ${pattern}`)
    }
    packageFiles.add(pattern)
  }

  const files = [...packageFiles].sort()
  if (!files.length) throw new Error('No extension files were found to package.')
  return files
}

function assertVersionEquality(sourceManifest, buildManifest) {
  const versions = [
    ['root package.json', PKG.version],
    ['source manifest.json', sourceManifest.version],
    ['build manifest.json', buildManifest.version],
  ]
  const expected = versions[0][1]
  const mismatch = versions.find(([, version]) => version !== expected)
  if (mismatch) {
    throw new Error(
      `Extension version mismatch: ${versions.map(([label, version]) => `${label}=${version}`).join(', ')}`
    )
  }
}

function isExternalReference(reference) {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(reference)
}

function matchesManifestPattern(reference, files) {
  const escaped = reference
    .split('')
    .map((character) => {
      if (character === '*') return '.*'
      if (character === '?') return '[^/]'
      return character.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
    })
    .join('')
  const expression = new RegExp(`^${escaped}$`)
  return files.some((file) => expression.test(file))
}

function assertLocalReference(reference, owner, baseDirectory, files, allowPattern = false) {
  if (typeof reference !== 'string' || !reference.trim()) {
    throw new Error(`Invalid local asset reference in ${owner}: ${String(reference)}`)
  }
  if (isExternalReference(reference)) return

  const cleanReference = decodeURIComponent(reference.split(/[?#]/, 1)[0])
  if (!cleanReference) return
  if (allowPattern && /[*?]/.test(cleanReference)) {
    const extensionRelativePattern = path
      .relative(BUILD_DIR, path.resolve(baseDirectory, cleanReference))
      .split(path.sep)
      .join('/')
    if (!matchesManifestPattern(extensionRelativePattern, files)) {
      throw new Error(`Manifest asset pattern has no packaged files: ${owner} -> ${reference}`)
    }
    return
  }

  const assetPath = path.resolve(baseDirectory, cleanReference)
  const relative = path.relative(BUILD_DIR, assetPath)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Local asset escapes the extension output: ${owner} -> ${reference}`)
  }
  if (!fs.existsSync(assetPath) || !fs.statSync(assetPath).isFile()) {
    throw new Error(`Local asset is missing: ${owner} -> ${reference}`)
  }
  const packageRelative = relative.split(path.sep).join('/')
  if (!files.includes(packageRelative)) {
    throw new Error(`Local asset is not included in the ZIP: ${owner} -> ${reference}`)
  }
}

function collectManifestReferences(manifest) {
  const action = manifest.action ?? manifest.browser_action ?? {}
  const icons = manifest.icons ?? {}
  const actionIcons = action.default_icon
  return [
    action.default_popup,
    ...(typeof actionIcons === 'string' ? [actionIcons] : Object.values(actionIcons ?? {})),
    manifest.background?.service_worker,
    ...(manifest.content_scripts ?? []).flatMap((script) => script.js ?? []),
    ...(manifest.content_scripts ?? []).flatMap((script) => script.css ?? []),
    ...(manifest.sandbox?.pages ?? []),
    ...(manifest.web_accessible_resources ?? []).flatMap((resource) => resource.resources ?? []),
    ...Object.values(icons),
  ].filter(Boolean)
}

function htmlReferences(content) {
  const references = []
  for (const match of content.matchAll(/\b(?:src|href|poster|xlink:href)\s*=\s*(["'])(.*?)\1/gi)) {
    references.push(match[2])
  }
  for (const match of content.matchAll(/\bsrcset\s*=\s*(["'])(.*?)\1/gi)) {
    for (const candidate of match[2].split(',')) {
      const reference = candidate.trim().split(/\s+/, 1)[0]
      if (reference) references.push(reference)
    }
  }
  return references
}

function cssReferences(content) {
  const references = []
  for (const match of content.matchAll(/url\(\s*(?:(["'])(.*?)\1|([^)]*?))\s*\)/gi)) {
    references.push((match[2] ?? match[3] ?? '').trim())
  }
  for (const match of content.matchAll(/@import\s+(["'])(.*?)\1/gi)) {
    references.push(match[2])
  }
  return references
}

function validatePackage() {
  const sourceManifest = readJson(path.join(SOURCE_DIR, 'manifest.json'), 'source manifest')
  const buildManifestPath = path.join(BUILD_DIR, 'manifest.json')
  const buildManifest = readJson(buildManifestPath, 'build manifest')
  assertVersionEquality(sourceManifest, buildManifest)

  const files = resolveIncludedFiles()
  for (const directory of REQUIRED_DIRECTORIES) {
    if (!files.some((file) => file.startsWith(`${directory}/`))) {
      throw new Error(`Required extension directory has no packaged files: ${directory}/`)
    }
  }
  for (const file of REQUIRED_FILES) {
    if (!files.includes(file)) throw new Error(`Required extension file is missing: ${file}`)
    if (fs.statSync(path.join(BUILD_DIR, file)).size === 0) {
      throw new Error(`Required extension file is empty: ${file}`)
    }
  }

  for (const reference of collectManifestReferences(buildManifest)) {
    assertLocalReference(reference, 'manifest.json', BUILD_DIR, files, true)
  }

  for (const file of files) {
    if (!/\.(?:html|css)$/i.test(file)) continue
    const absolutePath = path.join(BUILD_DIR, file)
    const contents = fs.readFileSync(absolutePath, 'utf8')
    const references = file.endsWith('.css')
      ? cssReferences(contents)
      : [...htmlReferences(contents), ...cssReferences(contents)]
    for (const reference of references) {
      assertLocalReference(reference, file, path.dirname(absolutePath), files)
    }
  }

  return files
}

async function writeZip(fileName, files) {
  fs.mkdirSync(ZIP_DIR, { recursive: true })
  const zipPath = path.join(ZIP_DIR, fileName)
  const stagingPath = `${zipPath}.tmp-${process.pid}`
  const packageDir = BUILD_DIR
  const output = fs.createWriteStream(stagingPath)
  const archive = archiver('zip', { zlib: { level: 9 } })
  const expectedEntries = new Set(files)
  const archivedEntries = new Set()

  let status
  let bar
  if (!IS_CI) {
    status = {
      total: files.length,
      written: 0,
      cFile: '...',
      cSize: '0 Bytes',
      tBytes: 0,
      tSize: '0 Bytes',
    }
    bar = new ProgressBar(`${fileName} @ :tSize [:bar] :current/:total :percent +:cFile@:cSize`, {
      width: 18,
      incomplete: ' ',
      total: status.total,
    })
    bar.tick(0, status)
  }

  await new Promise((resolve, reject) => {
    let settled = false
    const fail = (error) => {
      if (settled) return
      settled = true
      archive.abort()
      output.destroy()
      reject(error instanceof Error ? error : new Error(String(error)))
    }

    archive.on('entry', (entry) => {
      if (entry.stats?.isDirectory()) return
      const name = entry.name.split(path.sep).join('/')
      if (archivedEntries.has(name)) {
        fail(new Error(`Duplicate ZIP entry: ${name}`))
        return
      }
      archivedEntries.add(name)
      if (status) {
        status.written++
        status.cFile = name.length > 14 ? '...' + name.slice(name.length - 11) : name
        status.cSize = bytesToSize(entry.stats.size)
        status.tBytes += entry.stats.size
        status.tSize = bytesToSize(status.tBytes)
        bar.tick(1, status)
      }
    })
    archive.on('warning', fail)
    archive.on('error', fail)
    output.on('error', fail)
    output.on('close', () => {
      if (settled) return
      const missing = [...expectedEntries].filter((name) => !archivedEntries.has(name))
      const unexpected = [...archivedEntries].filter((name) => !expectedEntries.has(name))
      if (missing.length || unexpected.length) {
        fail(
          new Error(
            `ZIP contents do not match the validated build (missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'})`
          )
        )
        return
      }
      const outputSize = fs.statSync(stagingPath).size
      if (outputSize === 0 || outputSize !== archive.pointer()) {
        fail(
          new Error(
            `ZIP output is incomplete: ${outputSize} bytes written, ${archive.pointer()} bytes expected`
          )
        )
        return
      }
      settled = true
      resolve()
    })

    archive.pipe(output)
    for (const file of files) archive.file(path.join(packageDir, file), { name: file })
    const finalizeResult = archive.finalize()
    if (finalizeResult && typeof finalizeResult.catch === 'function') finalizeResult.catch(fail)
  }).catch((error) => {
    try {
      fs.rmSync(stagingPath, { force: true })
    } catch {
      // Preserve the original packaging error.
    }
    throw error
  })

  try {
    fs.renameSync(stagingPath, zipPath)
  } catch (error) {
    try {
      fs.rmSync(stagingPath, { force: true })
    } catch {
      // Preserve the original replacement error.
    }
    throw new Error(
      `Could not replace ${path.relative(ROOT, zipPath)} with the validated ZIP: ${error.message}`
    )
  }
}

async function main() {
  const files = validatePackage()
  const fileName = `ajax-proxy-${PKG.version}.zip`
  await writeZip(fileName, files)
  console.log(
    `Created ${path.relative(ROOT, path.join(ZIP_DIR, fileName))} with ${files.length} validated files.`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
