const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const packagesDir = path.join(root, 'packages')
const packageDirs = fs
  .readdirSync(packagesDir)
  .map((entry) => path.join(packagesDir, entry))
  .filter((directory) => fs.existsSync(path.join(directory, 'package.json')))
const packages = new Map(
  packageDirs.map((directory) => {
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'))
    return [manifest.name, { directory, manifest }]
  })
)
const failures = []
const graph = new Map([...packages.keys()].map((name) => [name, []]))
const forbiddenDependencies = new Map([
  [
    '@proxy/lib',
    new Set([
      '@proxy/shared-utils',
      '@proxy/v2-compatibility',
      '@proxy/shell-chrome',
      '@proxy/vue-panels',
      '@proxy/code-editor',
      '@proxy/json-editor',
    ]),
  ],
])

for (const [name, { manifest }] of packages) {
  for (const section of [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ]) {
    for (const dependency of Object.keys(manifest[section] ?? {})) {
      if (packages.has(dependency)) graph.get(name).push(dependency)
      if (forbiddenDependencies.get(name)?.has(dependency)) {
        failures.push(`${name}/package.json: forbidden dependency on ${dependency}`)
      }
    }
  }
}

const visited = new Set()
const active = new Set()
function visit(name, trail = []) {
  if (active.has(name)) {
    failures.push(`Workspace dependency cycle: ${[...trail, name].join(' -> ')}`)
    return
  }
  if (visited.has(name)) return
  active.add(name)
  for (const dependency of graph.get(name)) visit(dependency, [...trail, name])
  active.delete(name)
  visited.add(name)
}
for (const name of packages.keys()) visit(name)

const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue', '.mjs', '.cjs'])
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (
      entry.name === 'node_modules' ||
      entry.name === 'lib' ||
      entry.name === 'types' ||
      entry.name === 'build' ||
      entry.name === 'dist'
    )
      continue
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) walk(target)
    else if (sourceExtensions.has(path.extname(entry.name))) inspectSource(target)
  }
}

function inspectSource(file) {
  const relativeFile = path.relative(root, file).split(path.sep).join('/')
  const packageEntry = [...packages.entries()].find(([, value]) =>
    file.startsWith(`${value.directory}${path.sep}`)
  )
  if (!packageEntry) return
  const [owner, { manifest }] = packageEntry
  const source = fs.readFileSync(file, 'utf8')
  const specifierPattern =
    /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\()\s*['"](@proxy\/[^'"]+)['"]/g
  for (const match of source.matchAll(specifierPattern)) {
    const specifier = match[1]
    const parts = specifier.split('/')
    const dependency = parts.slice(0, 2).join('/')
    const subpath = parts.slice(2)
    if (!packages.has(dependency)) {
      failures.push(`${relativeFile}: references unknown workspace package ${dependency}`)
      continue
    }
    const declared = [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ].some((section) => Object.hasOwn(manifest[section] ?? {}, dependency))
    if (!declared)
      failures.push(
        `${relativeFile}: ${dependency} is imported but not declared in ${owner}/package.json`
      )
    if (forbiddenDependencies.get(owner)?.has(dependency)) {
      failures.push(`${relativeFile}: ${owner} must not import ${dependency}`)
    }
    if (
      subpath.length > 0 &&
      !(dependency === '@proxy/json-editor' && subpath.join('/') === 'lib/index.css')
    ) {
      failures.push(
        `${relativeFile}: deep workspace import "${specifier}" bypasses ${dependency}'s public entry`
      )
    }
  }
}

for (const { directory } of packages.values()) {
  const sourceDirectory = path.join(directory, 'src')
  if (fs.existsSync(sourceDirectory)) walk(sourceDirectory)
}

if (failures.length > 0) {
  console.error('Package boundary check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log(
    `Package boundary check passed (${packages.size} workspace packages; dependency graph is acyclic).`
  )
}
