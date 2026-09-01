import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import staticPlugin from '@fastify/static'
import websocket from '@fastify/websocket'
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
const { initializeRuntime } = await import('../dist/server/runtime.cjs')
const { realtime } = initializeRuntime()

const app = Fastify()
await app.register(staticPlugin, { root: fileURLToPath(new URL('../dist/client/', import.meta.url)) })
await app.register(websocket, { options: { maxPayload: 16 * 1024 } })

app.get(
  '/api/realtime',
  {
    websocket: true,
    preValidation: async (request, reply) => {
      if (!realtime) return reply.code(503).send()
      const status = realtime.authorize(request.raw)
      return status ? reply.code(status).send() : undefined
    }
  },
  (socket, request) => realtime.connect(socket, request.raw)
)

app.setNotFoundHandler(async (request, reply) => {
  reply.hijack()
  await handler(request.raw, reply.raw)
})
await app.listen({ port: Number(process.env.PORT), host: process.env.HOST || '0.0.0.0' })

async function shutdown() {
  realtime.close()
  await app.close()
  process.exit(0)
}

process.once('SIGINT', () => void shutdown())
process.once('SIGTERM', () => void shutdown())
