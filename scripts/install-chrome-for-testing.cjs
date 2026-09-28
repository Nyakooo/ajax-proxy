const { spawnSync } = require('node:child_process')
const { createWriteStream, existsSync, mkdirSync } = require('node:fs')
const { appendFile } = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { Readable } = require('node:stream')
const { pipeline } = require('node:stream/promises')

const requestedVersion = process.argv[2]
if (!/^\d+(?:\.\d+){0,3}$/.test(requestedVersion ?? '')) {
  throw new Error('Pass a Chrome major version or full version')
}

const platformMap = {
  'darwin-arm64': 'mac-arm64',
  'darwin-x64': 'mac-x64',
  'linux-x64': 'linux64',
}
const platform = platformMap[`${process.platform}-${process.arch}`]
if (!platform)
  throw new Error(`Chrome for Testing is unavailable for ${os.platform()} ${os.arch()}`)

async function main() {
  const indexResponse = await fetch(
    'https://googlechromelabs.github.io/chrome-for-testing/known-good-versions-with-downloads.json'
  )
  if (!indexResponse.ok)
    throw new Error(`Chrome for Testing index returned ${indexResponse.status}`)
  const index = await indexResponse.json()
  const release = index.versions
    .filter((entry) =>
      requestedVersion.includes('.')
        ? entry.version === requestedVersion
        : entry.version.startsWith(`${requestedVersion}.`)
    )
    .reverse()
    .find((entry) => entry.downloads?.chrome?.some((download) => download.platform === platform))
  if (!release) throw new Error(`No Chrome for Testing ${requestedVersion} build for ${platform}`)

  const download = release.downloads.chrome.find((entry) => entry.platform === platform)
  const cacheRoot = path.join(os.homedir(), '.cache', 'ajax-proxy-chrome-for-testing')
  const releaseRoot = path.join(cacheRoot, release.version)
  const archive = path.join(cacheRoot, `${release.version}-${platform}.zip`)
  mkdirSync(cacheRoot, { recursive: true })

  const binary = platform.startsWith('mac-')
    ? path.join(
        releaseRoot,
        `chrome-${platform}`,
        'Google Chrome for Testing.app',
        'Contents',
        'MacOS',
        'Google Chrome for Testing'
      )
    : path.join(releaseRoot, `chrome-${platform}`, 'chrome')

  if (!existsSync(binary)) {
    const response = await fetch(download.url)
    if (!response.ok) throw new Error(`Chrome archive returned ${response.status}`)
    await pipeline(Readable.fromWeb(response.body), createWriteStream(archive))

    const unzip = spawnSync('unzip', ['-q', '-o', archive, '-d', releaseRoot], { stdio: 'inherit' })
    if (unzip.status !== 0) throw new Error(`unzip failed with ${unzip.status}`)
  }

  if (!existsSync(binary)) throw new Error(`Chrome binary was not extracted at ${binary}`)
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `executable-path=${binary}\n`)
    await appendFile(process.env.GITHUB_OUTPUT, `version=${release.version}\n`)
  }
  console.log(`${release.version}\t${binary}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
