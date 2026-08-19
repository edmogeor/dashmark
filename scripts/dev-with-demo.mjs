import { spawn } from 'node:child_process'
import { startMockDocker } from './mock-docker-server.mjs'

function startAstroDev(dockerHost) {
  return spawn('npx', ['astro', 'dev'], {
    env: { ...process.env, DOCKER_HOST: dockerHost },
    stdio: 'inherit'
  })
}

async function main() {
  const { server, url } = await startMockDocker()
  const astro = startAstroDev(url)

  console.log('Dashmark dev server running with mock Docker API')
  console.log('Press Ctrl+C to stop')

  const shutdown = () => {
    console.log('\nShutting down...')
    astro.kill('SIGTERM')
    server.close(() => process.exit(0))
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
  astro.on('exit', () => server.close(() => process.exit(0)))
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
