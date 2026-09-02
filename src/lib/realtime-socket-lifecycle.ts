import WebSocket from 'ws'

const MAX_OUTBOUND_EVENTS = 64
const MAX_OUTBOUND_BYTES = 1024 * 1024
const SOCKET_LIFETIME_MS = 60 * 60 * 1000

export type RealtimeSocket = {
  socket: WebSocket
  headers: Headers
  metrics: Set<string>
  statusSubscribed: boolean
  pendingEvents: number
  pendingBytes: number
  closed: boolean
  lifetime: ReturnType<typeof setTimeout>
}

type SocketLifecycleOptions = {
  onMessage(client: RealtimeSocket, value: string): void
  onConnect(client: RealtimeSocket): void
}

export function createSocketLifecycle({ onMessage, onConnect }: SocketLifecycleOptions) {
  const clients = new Set<RealtimeSocket>()
  const closeClient = (client: RealtimeSocket, code = 1000): void => {
    if (client.closed) return
    client.closed = true
    clearTimeout(client.lifetime)
    clients.delete(client)
    client.socket.close(code)
  }
  const send = (client: RealtimeSocket, message: object): boolean => {
    if (client.closed || client.socket.readyState !== WebSocket.OPEN) return false
    const data = JSON.stringify(message)
    const bytes = Buffer.byteLength(data)
    if (client.pendingEvents >= MAX_OUTBOUND_EVENTS || client.pendingBytes + bytes > MAX_OUTBOUND_BYTES) {
      closeClient(client, 1008)
      return false
    }
    client.pendingEvents++
    client.pendingBytes += bytes
    client.socket.send(data, () => {
      client.pendingEvents--
      client.pendingBytes -= bytes
    })
    return true
  }
  const connect = (socket: WebSocket, headers: Headers): void => {
    const client: RealtimeSocket = {
      socket,
      headers,
      metrics: new Set(),
      statusSubscribed: true,
      pendingEvents: 0,
      pendingBytes: 0,
      closed: false,
      lifetime: setTimeout(() => closeClient(client, 1001), SOCKET_LIFETIME_MS)
    }
    client.lifetime.unref()
    clients.add(client)
    socket.on('message', (data, isBinary) => {
      if (isBinary) return closeClient(client, 1003)
      onMessage(client, data.toString())
    })
    socket.on('close', () => closeClient(client))
    socket.on('error', () => closeClient(client))
    onConnect(client)
  }

  return { clients, closeClient, send, connect }
}
