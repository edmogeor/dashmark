import WebSocket from 'ws'
import { REALTIME_MAX_OUTBOUND_EVENTS, REALTIME_MAX_OUTBOUND_BYTES, REALTIME_SOCKET_LIFETIME_MS } from './constants'

export type MetricSubscription = { incremental: boolean; ready: boolean; cursor?: { timestamp: number; signature: string }; releasePriority?: () => void }

export type RealtimeSocket = {
  socket: WebSocket
  headers: Headers
  metrics: Map<string, MetricSubscription>
  statusSubscribed: boolean
  pendingEvents: number
  pendingBytes: number
  outboundByteLimit: number
  closed: boolean
  lifetime: ReturnType<typeof setTimeout>
}

type SocketLifecycleOptions = {
  onMessage(client: RealtimeSocket, value: string): void
  onConnect(client: RealtimeSocket): void
  onClose?(client: RealtimeSocket): void
}

export function createSocketLifecycle({ onMessage, onConnect, onClose }: SocketLifecycleOptions) {
  const clients = new Set<RealtimeSocket>()
  const closeClient = (client: RealtimeSocket, code = 1000): void => {
    if (client.closed) return
    client.closed = true
    clearTimeout(client.lifetime)
    clients.delete(client)
    onClose?.(client)
    client.socket.close(code)
  }
  const send = (client: RealtimeSocket, message: object, allowLargeSnapshot = false, onSent?: (success: boolean) => void): boolean => {
    if (client.closed || client.socket.readyState !== WebSocket.OPEN) return false
    const data = JSON.stringify(message)
    const bytes = Buffer.byteLength(data)
    // Allow one full history plus the normal update budget, never multiple queued large snapshots.
    if (allowLargeSnapshot && bytes > REALTIME_MAX_OUTBOUND_BYTES && client.pendingBytes <= REALTIME_MAX_OUTBOUND_BYTES) client.outboundByteLimit = bytes + REALTIME_MAX_OUTBOUND_BYTES
    if (client.pendingEvents >= REALTIME_MAX_OUTBOUND_EVENTS || client.pendingBytes + bytes > client.outboundByteLimit) {
      closeClient(client, 1008)
      return false
    }
    client.pendingEvents++
    client.pendingBytes += bytes
    client.socket.send(data, (error) => {
      client.pendingEvents--
      client.pendingBytes -= bytes
      if (client.pendingEvents === 0) client.outboundByteLimit = REALTIME_MAX_OUTBOUND_BYTES
      onSent?.(!error && !client.closed)
    })
    return true
  }
  const sendSnapshot = (client: RealtimeSocket, message: object): Promise<boolean> =>
    new Promise((resolve) => {
      if (!send(client, message, true, resolve)) resolve(false)
    })
  const connect = (socket: WebSocket, headers: Headers): void => {
    const client: RealtimeSocket = {
      socket,
      headers,
      metrics: new Map(),
      statusSubscribed: true,
      pendingEvents: 0,
      pendingBytes: 0,
      outboundByteLimit: REALTIME_MAX_OUTBOUND_BYTES,
      closed: false,
      lifetime: setTimeout(() => closeClient(client, 1001), REALTIME_SOCKET_LIFETIME_MS)
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

  return { clients, closeClient, send, sendSnapshot, connect }
}
