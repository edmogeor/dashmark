import { once } from 'node:events'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import WebSocket from 'ws'
import { afterEach, describe, expect, it, vi } from 'vitest'

const getDiscoveredCards = vi.hoisted(() => vi.fn(async () => ({ cards: [] })))
const watchContainerEvents = vi.hoisted(() => vi.fn(() => () => {}))

vi.mock('@/lib/docker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/docker')>()),
  getDiscoveredCards,
  watchContainerEvents
}))

import { getConfig } from '@/lib/config'
import { getRealtimeServer, sameOrigin } from '@/lib/realtime-server'

function headers(headers: IncomingMessage['headers']): Pick<IncomingMessage, 'headers'> {
  return { headers }
}

const httpServers = new Set<Server>()
const sockets = new Set<WebSocket>()

async function connect(): Promise<{ socket: WebSocket; messages: unknown[] }> {
  const httpServer = createServer()
  getRealtimeServer(getConfig()).attachDevServer(httpServer)
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
  httpServers.add(httpServer)
  const address = httpServer.address()
  if (!address || typeof address === 'string') throw new Error('Expected a TCP listener')

  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/api/realtime`)
  const messages: unknown[] = []
  socket.on('message', (data) => messages.push(JSON.parse(data.toString())))
  sockets.add(socket)
  await once(socket, 'open')
  return { socket, messages }
}

async function nextMessage(messages: unknown[]): Promise<unknown> {
  await vi.waitFor(() => expect(messages).not.toHaveLength(0))
  return messages.shift()
}

afterEach(async () => {
  for (const socket of sockets) socket.terminate()
  sockets.clear()
  globalThis.__dashmarkRealtime?.close()
  globalThis.__dashmarkRealtime = undefined
  globalThis.__dashmarkDiscoveryCoordinator?.clear()
  globalThis.__dashmarkDiscoveryCoordinator = undefined
  await Promise.all([...httpServers].map((server) => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))))
  httpServers.clear()
  vi.clearAllMocks()
})

describe('realtime origin validation', () => {
  it('accepts a direct same-origin request', () => {
    expect(sameOrigin(headers({ host: 'dash.example.test', origin: 'http://dash.example.test' }))).toBe(true)
  })

  it('rejects a cross-origin request', () => {
    expect(sameOrigin(headers({ host: 'dash.example.test', origin: 'https://other.example.test' }))).toBe(false)
  })

  it('uses standard forwarded headers from a TLS-terminating proxy', () => {
    expect(
      sameOrigin(
        headers({
          host: 'dashmark:4321',
          origin: 'https://dash.example.test',
          forwarded: 'for=192.0.2.1;host=dash.example.test;proto=https'
        })
      )
    ).toBe(true)
  })

  it('uses X-Forwarded headers when standard Forwarded is unavailable', () => {
    expect(
      sameOrigin(
        headers({
          host: 'dashmark:4321',
          origin: 'https://dash.example.test',
          'x-forwarded-host': 'dash.example.test:443',
          'x-forwarded-proto': 'WSS'
        })
      )
    ).toBe(true)
  })
})

describe('realtime client protocol', () => {
  it('accepts an exact status subscription and sends its snapshot', async () => {
    const { socket, messages } = await connect()

    expect(await nextMessage(messages)).toEqual({ type: 'status_snapshot', version: 1, statuses: {} })
    socket.send(JSON.stringify({ type: 'subscribe_status' }))
    expect(await nextMessage(messages)).toEqual({ type: 'status_snapshot', version: 2, statuses: {} })
  })

  it('closes the socket when a message has an unexpected protocol field', async () => {
    const { socket, messages } = await connect()
    await nextMessage(messages)
    const closed = once(socket, 'close')
    socket.send(JSON.stringify({ type: 'subscribe_status', cardId: 'default:app' }))

    expect((await closed)[0]).toBe(1008)
  })

  it('closes the socket with unsupported-data for binary frames', async () => {
    const { socket, messages } = await connect()
    await nextMessage(messages)
    const closed = once(socket, 'close')
    socket.send(Buffer.from('subscribe_status'))

    expect((await closed)[0]).toBe(1003)
  })
})
