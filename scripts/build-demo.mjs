import { spawn } from 'node:child_process'
import { copyFile, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const source = fileURLToPath(new URL('../demo/page.astro', import.meta.url))
const target = fileURLToPath(new URL('../src/pages/demo.astro', import.meta.url))
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

await copyFile(source, target)

try {
  const exitCode = await new Promise((resolve, reject) => {
    const command = process.env.DASHMARK_SKIP_PREBUILD === 'true' ? ['run', '--ignore-scripts', 'build'] : ['run', 'build']
    const build = spawn(npm, command, { stdio: 'inherit' })
    build.once('error', reject)
    build.once('exit', (code) => resolve(code ?? 1))
  })
  process.exitCode = exitCode
} finally {
  await rm(target, { force: true })
}
