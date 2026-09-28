const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const { version } = require('../package.json')

const buildDir = path.resolve(__dirname, '../packages/shell-chrome/build')
const zipPath = path.resolve(__dirname, `../zip/ajax-proxy-${version}.zip`)
const totals = {
  js: { files: 0, rawBytes: 0, gzipBytes: 0 },
  css: { files: 0, rawBytes: 0, gzipBytes: 0 },
}

function visit(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      visit(filePath)
      continue
    }

    const kind = path.extname(entry.name).slice(1)
    if (kind !== 'js' && kind !== 'css') continue

    const content = fs.readFileSync(filePath)
    totals[kind].files += 1
    totals[kind].rawBytes += content.length
    totals[kind].gzipBytes += zlib.gzipSync(content, { level: 9 }).length
  }
}

if (!fs.existsSync(buildDir)) {
  throw new Error(`Build output not found: ${buildDir}. Run pnpm build first.`)
}
if (!fs.existsSync(zipPath)) {
  throw new Error(`Release ZIP not found: ${zipPath}. Run pnpm zip first.`)
}

visit(buildDir)
const format = (bytes) => `${bytes} B (${(bytes / 1024).toFixed(1)} KiB)`
console.log(`ZIP: ${format(fs.statSync(zipPath).size)} (${path.relative(process.cwd(), zipPath)})`)
for (const kind of ['js', 'css']) {
  const { files, rawBytes, gzipBytes } = totals[kind]
  console.log(
    `${kind.toUpperCase()}: ${files} files; raw ${format(rawBytes)}; per-file gzip ${format(gzipBytes)}`
  )
}
