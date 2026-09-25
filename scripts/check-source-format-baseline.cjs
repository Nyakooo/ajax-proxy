const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const baselinePath = path.join(root, 'docs', 'V3-FORMAT-BASELINE.txt')
const prettierBin = path.join(root, 'node_modules', '.bin', 'prettier')
const result = spawnSync(prettierBin, ['--list-different', 'packages/**/*.{js,ts,vue}'], {
  cwd: root,
  encoding: 'utf8',
})

if (result.error) throw result.error
if (result.status !== 0 && result.status !== 1) {
  process.stderr.write(result.stderr)
  process.exit(result.status ?? 1)
}

const isTrackedSource = (file) => file && !file.includes('/types/')
const actual = new Set(result.stdout.split(/\r?\n/).filter(isTrackedSource))
const baseline = new Set(
  fs.readFileSync(baselinePath, 'utf8').split(/\r?\n/).filter(isTrackedSource)
)
const newFiles = [...actual].filter((file) => !baseline.has(file))

if (newFiles.length > 0) {
  console.error('Formatting baseline regressed in files not yet recorded:')
  for (const file of newFiles) console.error(`- ${file}`)
  process.exitCode = 1
} else {
  console.log(
    `Package formatting baseline passed (${actual.size} legacy files remain; ` +
      `${baseline.size - actual.size} baseline files are now formatted).`
  )
}
