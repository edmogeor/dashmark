import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { demoContainers, startMockDocker } from './mock-docker-server.mjs'

const require = createRequire(import.meta.url)
const astroEntry = resolve(dirname(require.resolve('astro/package.json')), 'bin', 'astro.mjs')

function startAstroDev(dockerHosts) {
  const env = {
    ...process.env,
    DOCKER_HOSTS: dockerHosts,
    // Keep Astro attached so this wrapper retains the mock Docker server until
    // the development server exits.
    ASTRO_DEV_BACKGROUND: '0',
    MOCK_AUTH: 'true',
    MOCK_USER_NAME: 'John Doe',
    MOCK_USER_USERNAME: 'john',
    MOCK_USER_EMAIL: 'john@example.com',
    MOCK_USER_GROUPS: process.env.MOCK_USER_GROUPS ?? 'admins,media,family',
    STATUS_BADGE_ACCESS: process.env.STATUS_BADGE_ACCESS ?? 'admins,media,family'
  }
  return spawn(process.execPath, [astroEntry, 'dev'], {
    env,
    stdio: 'inherit'
  })
}

async function main() {
  const splitIndex = Math.ceil(demoContainers.length / 2)
  const [{ server: homeServer, url: homeUrl }, { server: vpsServer, url: vpsUrl }] = await Promise.all([
    startMockDocker(demoContainers.slice(0, splitIndex)),
    startMockDocker(demoContainers.slice(splitIndex))
  ])
  const astro = startAstroDev(`home=${homeUrl},vps=${vpsUrl}`)

  console.log('Dashmark dev server running with mock Docker API')
  console.log('Press Ctrl+C to stop')

  let shuttingDown = false
  function shutdown() {
    if (shuttingDown) return
    shuttingDown = true
    console.log('\nShutting down...')
    astro.kill('SIGTERM')
    homeServer.close(() => vpsServer.close(() => process.exit(0)))
    setTimeout(() => process.exit(0), 2000).unref()
  }

  astro.on('exit', () => shutdown())
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
