const { spawnSync } = require('node:child_process')

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' })
  if (result.status !== 0) {
    process.stderr.write(result.stderr)
    process.exit(result.status ?? 1)
  }
  return result.stdout.split(/\r?\n/).filter(Boolean)
}

const changed = git(['diff', '--name-only', 'HEAD', '--', 'packages/']).filter((file) =>
  /^packages\/[^/]+\/types\/.*\.d\.ts$/.test(file)
)
const untracked = git(['ls-files', '--others', '--exclude-standard', '--', 'packages/']).filter(
  (file) => /^packages\/[^/]+\/types\/.*\.d\.ts$/.test(file)
)

if (changed.length > 0 || untracked.length > 0) {
  console.error('Generated declaration files are out of sync with their TypeScript sources:')
  for (const file of [...changed, ...untracked]) console.error(`- ${file}`)
  process.exitCode = 1
} else {
  console.log('Generated declaration files match the committed TypeScript sources.')
}
