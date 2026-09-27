const assert = require('node:assert/strict')
const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')

const root = path.resolve(__dirname, '..')
const watcherScript = path.join(__dirname, 'build-shell-vite-prototype.cjs')
const extensionPath = path.join(root, 'packages/shell-chrome/build-vite-dev')
const watchedSource = path.join(root, 'packages/shell-chrome/src/document.ts')
const smokeScript = path.join(root, 'tests/browser/extension-smoke.cjs')

function waitForOutput(watcher, getOutput, predicate, description) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      clearInterval(poll)
      reject(new Error(`Timed out waiting for ${description}. Watcher output:\n${getOutput()}`))
    }, 120_000)
    const poll = setInterval(() => {
      if (predicate(getOutput())) {
        clearTimeout(timeout)
        clearInterval(poll)
        resolve()
        return
      }
      if (watcher.spawnError) {
        clearTimeout(timeout)
        clearInterval(poll)
        reject(watcher.spawnError)
        return
      }
      if (watcher.exitCode !== null || watcher.signalCode !== null) {
        clearTimeout(timeout)
        clearInterval(poll)
        reject(new Error(`Vite watcher exited before ${description}. Output:\n${getOutput()}`))
      }
    }, 50)
  })
}

function runExtensionSmoke() {
  const result = spawnSync(process.execPath, [smokeScript], {
    cwd: root,
    env: { ...process.env, AJAX_PROXY_EXTENSION_PATH: extensionPath },
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  assert.equal(result.status, 0, 'Vite watch output must pass the extension Fetch / XHR smoke')
}

async function stopWatcher(watcher) {
  if (watcher.closed) return
  await new Promise((resolve) => {
    const timeout = setTimeout(() => watcher.kill('SIGKILL'), 5000)
    watcher.once('close', () => {
      clearTimeout(timeout)
      watcher.closed = true
      resolve()
    })
    if (watcher.exitCode === null && watcher.signalCode === null) watcher.kill('SIGTERM')
  })
}

async function main() {
  const originalStats = fs.statSync(watchedSource)
  const originalSource = fs.readFileSync(watchedSource)
  const originalSourceHash = createHash('sha256').update(originalSource).digest('hex')
  let testAssignedMtime
  let watcherOutput = ''
  const watcher = spawn(process.execPath, [watcherScript, '--watch'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  watcher.closed = false
  watcher.on('close', () => {
    watcher.closed = true
  })
  watcher.on('error', (error) => {
    watcher.spawnError = error
  })
  for (const stream of [watcher.stdout, watcher.stderr]) {
    stream.setEncoding('utf8')
    stream.on('data', (chunk) => {
      watcherOutput += chunk
      process.stdout.write(chunk)
    })
  }

  try {
    await waitForOutput(
      watcher,
      () => watcherOutput,
      (output) => output.includes('Watching shell sources.'),
      'initial Vite shell build'
    )
    assert.ok(fs.existsSync(path.join(extensionPath, 'manifest.json')))
    runExtensionSmoke()

    const completedDocumentBuilds = (watcherOutput.match(/Rebuilt document\.js/g) ?? []).length
    const currentStats = fs.statSync(watchedSource)
    const currentHash = createHash('sha256').update(fs.readFileSync(watchedSource)).digest('hex')
    assert.equal(
      currentStats.mtimeMs,
      originalStats.mtimeMs,
      'Watched source changed while the Vite watcher was starting; refusing to alter its timestamp'
    )
    assert.equal(
      currentHash,
      originalSourceHash,
      'Watched source content changed while the Vite watcher was starting; refusing to alter its timestamp'
    )
    testAssignedMtime = new Date(Date.now() + 5000)
    fs.utimesSync(watchedSource, new Date(), testAssignedMtime)
    await waitForOutput(
      watcher,
      () => watcherOutput,
      (output) => (output.match(/Rebuilt document\.js/g) ?? []).length > completedDocumentBuilds,
      'document.js rebuild after a source change'
    )
    runExtensionSmoke()
    console.log('Vite watch rebuild and reloaded extension smoke passed')
  } finally {
    await stopWatcher(watcher)
    if (testAssignedMtime) {
      const currentStats = fs.statSync(watchedSource)
      const currentHash = createHash('sha256').update(fs.readFileSync(watchedSource)).digest('hex')
      if (
        currentStats.mtimeMs === testAssignedMtime.getTime() &&
        currentHash === originalSourceHash
      ) {
        fs.utimesSync(watchedSource, originalStats.atime, originalStats.mtime)
      }
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
