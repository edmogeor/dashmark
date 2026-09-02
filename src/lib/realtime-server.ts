import type { IncomingMessage, Server } from 'node:http'
import type { Duplex } from 'node:stream'
import WebSocket, { WebSocketServer } from 'ws'
import { isAuthorized } from './auth'
import type { AppConfig } from './config'
import { canViewMetric } from './docker'
import { getDiscoveryCoordinator } from './discovery-coordinator'
import { getLatestMetricUsage } from './metrics'
import type { UptimeBucket } from './uptime-buckets'
import { UPTIME_RANGES, type UptimeRange } from './uptime-ranges'
import { metricsSnapshot, uptimeBucketsByRange, type MetricsSnapshots } from './realtime-metrics-snapshot'
import { parseClientMessage } from './realtime-protocol'
import { createSocketLifecycle, type RealtimeSocket } from './realtime-socket-lifecycle'

const PATHNAME = '/api/realtime'
const MAX_CLIENT_MESSAGE_BYTES = 16 * 1024
const MAX_METRIC_SUBSCRIPTIONS = 32

export type RealtimePublisher = {
  publishStatusDelta(cardId: string, status: unknown): Promise<void>
  publishMetricsDelta(cardId: string): Promise<void>
}

export type RealtimeServer = RealtimePublisher & {
  authorize(request: IncomingMessage): number | undefined
  connect(socket: WebSocket, request: IncomingMessage): void
  attachDevServer(server: Server): void
  close(): void
}

declare global {
  // The explicit runtime initializer exposes this shared instance to Fastify and Astro.
  var __dashmarkRealtime: RealtimeServer | undefined
}

function requestHeaders(request: IncomingMessage): Headers {
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) headers.set(name, value.join(', '))
    else if (value) headers.set(name, value)
  }
  return headers
}

function firstForwardedValue(value: string | string[] | undefined): string | undefined {
  const header = Array.isArray(value) ? value[0] : value
  return header?.split(',')[0]?.trim()
}

function forwardedParameters(value: string | undefined): { host?: string; proto?: string } {
  if (!value) return {}
  return Object.fromEntries(
    value.split(';').flatMap((parameter) => {
      const [name, ...parts] = parameter.trim().split('=')
      const entry = parts.join('=').replace(/^"|"$/g, '')
      const key = name?.toLowerCase()
      return (key === 'host' || key === 'proto') && entry ? [[key, entry]] : []
    })
  )
}

function originProtocol(value: string | undefined): 'http:' | 'https:' {
  return value?.toLowerCase() === 'https' || value?.toLowerCase() === 'wss' ? 'https:' : 'http:'
}

export function sameOrigin(request: Pick<IncomingMessage, 'headers'>): boolean {
  const origin = request.headers.origin
  if (!origin) return true
  const forwarded = forwardedParameters(firstForwardedValue(request.headers.forwarded))
  const host = forwarded.host ?? firstForwardedValue(request.headers['x-forwarded-host']) ?? request.headers.host
  if (!host) return false
  const protocol = originProtocol(forwarded.proto ?? firstForwardedValue(request.headers['x-forwarded-proto']))
  try {
    return new URL(origin).origin === new URL(`${protocol}//${host}`).origin
  } catch {
    return false
  }
}

function reject(socket: Duplex, status: number, reason: string): void {
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
  socket.destroy()
}

function createRealtimeServer(config: AppConfig): RealtimeServer {
  const devWebSockets = new WebSocketServer({ noServer: true, maxPayload: MAX_CLIENT_MESSAGE_BYTES })
  const coordinator = getDiscoveryCoordinator(config)
  coordinator.start()
  const publishedUptimeBuckets = new Map<string, Record<UptimeRange, UptimeBucket[]>>()
  const metricSnapshots: MetricsSnapshots = new Map()
  let version = 0

  const nextVersion = () => ++version
  const sendStatusSnapshot = async (client: RealtimeSocket): Promise<void> => {
    await coordinator.ready()
    const result = coordinator.getStatusSnapshot(client.headers)
    if (!client.closed) send(client, { type: 'status_snapshot', version: nextVersion(), statuses: result.statuses })
  }
  const sendMetricsSnapshot = async (client: RealtimeSocket, cardId: string): Promise<boolean> => {
    await coordinator.ready()
    const metrics = metricsSnapshot(config, client.headers, cardId, metricSnapshots)
    if (!metrics || client.closed) return false
    send(client, { type: 'metrics_snapshot', version: nextVersion(), cardId, metrics })
    return true
  }
  const handleMessage = async (client: RealtimeSocket, value: string): Promise<void> => {
    let message
    try {
      message = parseClientMessage(JSON.parse(value))
    } catch {}
    if (!message) return closeClient(client, 1008)
    if (message.type === 'subscribe_status') {
      client.statusSubscribed = true
      await sendStatusSnapshot(client)
      return
    }
    if (message.type === 'unsubscribe_metrics') {
      client.metrics.delete(message.cardId)
      return
    }
    if (!client.metrics.has(message.cardId) && client.metrics.size >= MAX_METRIC_SUBSCRIPTIONS) return closeClient(client, 1008)
    if (await sendMetricsSnapshot(client, message.cardId)) client.metrics.add(message.cardId)
  }
  const {
    clients,
    closeClient,
    connect: connectSocket,
    send
  } = createSocketLifecycle({
    onMessage: (client, value) => void handleMessage(client, value),
    onConnect: (client) => void sendStatusSnapshot(client)
  })
  coordinator.onStatusChange((cardId, status) => {
    void publishStatusDelta(cardId, status)
  })
  coordinator.onMetricsChange((cardId) => {
    void publishMetricsDelta(cardId)
  })
  coordinator.onCardsChange((cardIds) => {
    for (const cardId of metricSnapshots.keys()) if (!cardIds.has(cardId)) metricSnapshots.delete(cardId)
    for (const key of publishedUptimeBuckets.keys()) if (!cardIds.has(key.slice(0, key.indexOf('\0')))) publishedUptimeBuckets.delete(key)
  })
  const publishStatusDelta = async (cardId: string, status: unknown): Promise<void> => {
    for (const client of [...clients].filter((candidate) => candidate.statusSubscribed)) {
      const visible = coordinator.getStatusSnapshot(client.headers)
      if (Object.hasOwn(visible.statuses, cardId)) send(client, { type: 'status_delta', version: nextVersion(), cardId, status })
    }
  }
  const publishMetricsDelta = async (cardId: string): Promise<void> => {
    metricSnapshots.delete(cardId)
    const usage = getLatestMetricUsage(cardId)
    const changedBuckets: { key: string; range: UptimeRange; bucket: UptimeBucket }[] = []
    let bucketWindowRolled = false
    for (const metric of usage?.uptimeMetrics ?? []) {
      const bucketKey = `${cardId}\0${metric.key}`
      const buckets = uptimeBucketsByRange(metric)
      const previous = publishedUptimeBuckets.get(bucketKey)
      for (const { range } of UPTIME_RANGES) {
        const previousRange = previous?.[range]
        const currentRange = buckets[range]
        if (previousRange && previousRange[0]?.start === currentRange[0]?.start) {
          for (let index = 0; index < currentRange.length; index++) {
            if (JSON.stringify(previousRange[index]) !== JSON.stringify(currentRange[index])) changedBuckets.push({ key: metric.key, range, bucket: currentRange[index]! })
          }
        } else if (previousRange) {
          bucketWindowRolled = true
        }
      }
      publishedUptimeBuckets.set(bucketKey, buckets)
    }
    await Promise.all(
      [...clients]
        .filter((client) => client.metrics.has(cardId))
        .map(async (client) => {
          const metrics = metricsSnapshot(config, client.headers, cardId, metricSnapshots, bucketWindowRolled)
          if (metrics) send(client, { type: 'metrics_delta', version: nextVersion(), cardId, metrics })
          const access = coordinator.getMetricAccess(client.headers, cardId)
          for (const { key, range, bucket } of changedBuckets) {
            if (access && canViewMetric(config, client.headers, access.metricsAccess, key)) send(client, { type: 'uptime_bucket_delta', version: nextVersion(), cardId, key, range, bucket })
          }
        })
    )
  }
  const authorize = (request: IncomingMessage): number | undefined => {
    if (!sameOrigin(request)) return 403
    const headers = requestHeaders(request)
    const authRequest = new Request(`http://${request.headers.host ?? 'localhost'}${request.url ?? '/'}`, { headers })
    return isAuthorized(authRequest, config.authToken) ? undefined : 401
  }
  const connect = (socket: WebSocket, request: IncomingMessage): void => {
    connectSocket(socket, requestHeaders(request))
  }
  const attachDevServer = (server: Server): void => {
    const handleUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      if (new URL(request.url ?? '/', 'http://localhost').pathname !== PATHNAME) return
      const status = authorize(request)
      if (status) return reject(socket, status, status === 401 ? 'Unauthorized' : 'Forbidden')
      devWebSockets.handleUpgrade(request, socket, head, (webSocket) => connect(webSocket, request))
    }
    server.prependListener('upgrade', handleUpgrade)
  }
  return {
    authorize,
    connect,
    attachDevServer,
    close: () => {
      for (const client of clients) closeClient(client, 1001)
    },
    publishStatusDelta,
    publishMetricsDelta
  }
}

export function getRealtimeServer(config: AppConfig): RealtimeServer {
  return (globalThis.__dashmarkRealtime ??= createRealtimeServer(config))
}
