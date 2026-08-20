import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { startMockDocker } from './mock-docker-server.mjs'

const require = createRequire(import.meta.url)
const astroEntry = resolve(dirname(require.resolve('astro/package.json')), 'bin', 'astro.mjs')

function startAstroDev(dockerHost) {
  return spawn(process.execPath, [astroEntry, 'dev'], {
    env: {
      ...process.env,
      DOCKER_HOST: dockerHost,
      // Force foreground mode. Astro otherwise auto-backgrounds when it detects an
      // AI agent environment, which detaches the process and breaks cleanup here.
      ASTRO_DEV_BACKGROUND: '1',
      MOCK_AUTH: 'true',
      MOCK_USER_NAME: 'John Doe',
      MOCK_USER_USERNAME: 'john',
      MOCK_USER_EMAIL: 'john@example.com',
      MOCK_USER_GROUPS: 'admins,media,family'
    },
    stdio: 'inherit'
  })
}

async function main() {
  const { server, url } = await startMockDocker()
  const astro = startAstroDev(url)

  console.log('Dashmark dev server running with mock Docker API')
  console.log('Press Ctrl+C to stop')

  let shuttingDown = false
  function shutdown() {
    if (shuttingDown) return
    shuttingDown = true
    console.log('\nShutting down...')
    astro.kill('SIGTERM')
    server.close(() => process.exit(0))
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
