const { spawnSync } = require('node:child_process')
const { createWriteStream, existsSync, mkdirSync } = require('node:fs')
const { appendFile } = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { Readable } = require('node:stream')
const { pipeline } = require('node:stream/promises')

const version = process.argv[2]
if (!/^\d+\.\d+\.\d+\.\d+-\d+$/.test(version ?? '')) {
  throw new Error('Pass an exact Microsoft Edge Debian package version')
}
if (process.platform !== 'linux' || process.arch !== 'x64') {
  throw new Error('The Edge for Testing package is available only on Linux x64')
}

async function main() {
  const cacheRoot = path.join(os.homedir(), '.cache', 'ajax-proxy-edge-for-testing')
  const installRoot = path.join(cacheRoot, version)
  const archive = path.join(cacheRoot, `microsoft-edge-stable_${version}_amd64.deb`)
  const binary = path.join(installRoot, 'opt/microsoft/msedge/msedge')
  const packageName = version.replace(/-\d+$/, '')
  const url = `https://packages.microsoft.com/repos/edge/pool/main/m/microsoft-edge-stable/microsoft-edge-stable_${version}_amd64.deb`

  mkdirSync(cacheRoot, { recursive: true })
  if (!existsSync(binary)) {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Microsoft Edge package returned ${response.status}`)
    await pipeline(Readable.fromWeb(response.body), createWriteStream(archive))

    const extract = spawnSync('dpkg-deb', ['-x', archive, installRoot], { stdio: 'inherit' })
    if (extract.status !== 0) throw new Error(`dpkg-deb failed with ${extract.status}`)
  }

  if (!existsSync(binary)) throw new Error(`Microsoft Edge binary was not extracted at ${binary}`)
  const browserVersion = spawnSync(binary, ['--version'], { encoding: 'utf8' })
  if (browserVersion.status !== 0 || !browserVersion.stdout.includes(packageName)) {
    throw new Error(`Unexpected Microsoft Edge binary version: ${browserVersion.stdout}`)
  }

  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `executable-path=${binary}\n`)
    await appendFile(process.env.GITHUB_OUTPUT, `version=${packageName}\n`)
  }
  console.log(`${packageName}\t${binary}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
