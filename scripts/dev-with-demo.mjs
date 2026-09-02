import http from 'node:http'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { demoContainers, startMockDocker } from './mock-docker-server.mjs'
import { startMockMetricServer } from './mock-metric-server.mjs'

const require = createRequire(import.meta.url)
const astroEntry = resolve(dirname(require.resolve('astro/package.json')), 'bin', 'astro.mjs')
const TRUSTED_HEADERS = ['x-authentik-name', 'x-authentik-username', 'x-authentik-email', 'x-authentik-groups', 'x-dashmark-token']

function port(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535 ? parsed : fallback
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close((error) => (error ? reject(error) : resolve(address.port)))
    })
  })
}

function waitForServer(targetPort) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 15_000
    const check = () => {
      const request = http.get({ hostname: '127.0.0.1', port: targetPort, path: '/' }, (response) => {
        response.resume()
        resolve()
      })
      request.on('error', () => {
        if (Date.now() >= deadline) return reject(new Error('Astro development server did not start'))
        setTimeout(check, 100)
      })
      request.setTimeout(500, () => request.destroy())
    }
    check()
  })
}

function proxyHeaders(headers, identity) {
  const forwarded = { ...headers }
  for (const name of TRUSTED_HEADERS) delete forwarded[name]
  return { ...forwarded, ...identity }
}

function upstreamRequestOptions(request, targetPort, identity) {
  return {
    hostname: '127.0.0.1',
    port: targetPort,
    method: request.method,
    path: request.url,
    headers: proxyHeaders(request.headers, identity)
  }
}

function startMockProxy(targetPort, publicPort, identity) {
  const server = http.createServer((request, response) => {
    const upstream = http.request(upstreamRequestOptions(request, targetPort, identity), (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers)
      upstreamResponse.pipe(response)
    })
    upstream.on('error', () => {
      if (!response.headersSent) response.writeHead(502)
      response.end('Dashmark development server is unavailable')
    })
    request.pipe(upstream)
  })

  server.on('upgrade', (request, socket, head) => {
    const upstream = http.request(upstreamRequestOptions(request, targetPort, identity))
    upstream.on('upgrade', (upstreamResponse, upstreamSocket, upstreamHead) => {
      const headers = Object.entries(upstreamResponse.headers)
        .flatMap(([name, value]) => (Array.isArray(value) ? value.map((item) => `${name}: ${item}`) : value ? [`${name}: ${value}`] : []))
        .join('\r\n')
      socket.write(`HTTP/1.1 ${upstreamResponse.statusCode} ${upstreamResponse.statusMessage}\r\n${headers}\r\n\r\n`)
      if (upstreamHead.length > 0) socket.write(upstreamHead)
      socket.on('error', () => upstreamSocket.destroy())
      upstreamSocket.on('error', () => socket.destroy())
      upstreamSocket.pipe(socket).pipe(upstreamSocket)
    })
    upstream.on('error', () => socket.destroy())
    if (head.length > 0) upstream.write(head)
    upstream.end()
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(publicPort, '127.0.0.1', () => resolve(server))
  })
}

function close(server) {
  server.closeAllConnections?.()
  return new Promise((resolve) => server.close(() => resolve()))
}

function startAstroDev(dockerHosts, backendPort) {
  return spawn(process.execPath, [astroEntry, 'dev', '--host', '127.0.0.1'], {
    env: {
      ...process.env,
      PORT: String(backendPort),
      DOCKER_HOSTS: dockerHosts,
      ASTRO_DEV_BACKGROUND: '0',
      AUTH_TOKEN: 'mock-development-token',
      ENABLE_ACCESS_CONTROL: 'true',
      STATUS_BADGE_ACCESS: process.env.STATUS_BADGE_ACCESS ?? 'admins,media,family',
      METRICS_DATABASE_PATH: process.env.METRICS_DATABASE_PATH ?? resolve('.astro', 'metrics.db')
    },
    stdio: 'inherit'
  })
}

async function main() {
  const publicPort = port(process.env.DASHMARK_DEV_PORT ?? process.env.PORT, 4321)
  const backendPort = await availablePort()
  const { server: metricServer, url: metricUrl } = await startMockMetricServer()
  const containers = demoContainers.map((container) => ({
    ...container,
    Labels: {
      ...container.Labels,
      ...(container.Id === 'plex123' ? { 'dashmark.metrics_source.gatus': metricUrl } : {}),
      ...(container.Id === 'nzbget123' ? { 'dashmark.metrics_source.nzbget': metricUrl } : {})
    }
  }))
  const splitIndex = Math.ceil(containers.length / 2)
  const [{ server: homeServer, url: homeUrl }, { server: vpsServer, url: vpsUrl }] = await Promise.all([
    startMockDocker(containers.slice(0, splitIndex)),
    startMockDocker(containers.slice(splitIndex))
  ])
  const astro = startAstroDev(`home=${homeUrl},vps=${vpsUrl}`, backendPort)
  await waitForServer(backendPort)
  const proxy = await startMockProxy(backendPort, publicPort, {
    'x-authentik-name': process.env.MOCK_USER_NAME ?? 'John Doe',
    'x-authentik-username': process.env.MOCK_USER_USERNAME ?? 'john',
    'x-authentik-email': process.env.MOCK_USER_EMAIL ?? 'john@example.com',
    'x-authentik-groups': process.env.MOCK_USER_GROUPS ?? 'admins,media,family',
    'x-dashmark-token': 'mock-development-token'
  })

  console.log(`Dashmark dev server running at http://127.0.0.1:${publicPort}`)
  console.log('Press Ctrl+C to stop')

  let shuttingDown = false
  async function shutdown() {
    if (shuttingDown) return
    shuttingDown = true
    console.log('\nShutting down...')
    astro.kill('SIGTERM')
    setTimeout(() => astro.kill('SIGKILL'), 2_000).unref()
    await Promise.all([close(proxy), close(homeServer), close(vpsServer), close(metricServer)])
  }

  astro.on('exit', () => void shutdown())
  process.on('SIGINT', () => void shutdown())
  process.on('SIGTERM', () => void shutdown())
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
