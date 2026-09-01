import fs from 'node:fs'
import http from 'node:http'
import yaml from 'js-yaml'

function yamlPort() {
  try {
    const configFile = process.env.CONFIG_FILE || '/data/config.yml'
    const config = yaml.load(fs.readFileSync(configFile, 'utf-8'))
    const port = config?.settings?.port
    return Number.isInteger(port) && port > 0 && port <= 65_535 ? String(port) : undefined
  } catch {
    return undefined
  }
}

process.env.PORT = yamlPort() ?? process.env.PORT ?? '4321'
const { handler } = await import('../dist/server/entry.mjs')
const realtime = globalThis.__dashmarkRealtime
const server = http.createServer(handler)

realtime?.attach(server)

function shutdown() {
  realtime?.close()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 10_000).unref()
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
server.listen(Number(process.env.PORT), process.env.HOST || '0.0.0.0')
