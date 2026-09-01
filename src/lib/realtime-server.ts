import type { IncomingMessage, Server } from 'node:http'
import type { Duplex } from 'node:stream'
import WebSocket, { WebSocketServer } from 'ws'
import { isAuthorized } from './auth'
import type { AppConfig } from './config'
import { canViewMetric } from './docker'
import { getDiscoveryCoordinator } from './discovery-coordinator'
import { getLatestMetricUsage, getMetricHistory, getResourceMetricHistory } from './metrics'
import type { ContainerResources, CustomMetric, MetricsResponse, ResourceMetricSample, UptimeMetric } from './status'
import type { UptimeBucket, UptimeRange } from './realtime-client'

const PATHNAME = '/api/realtime'
const MAX_CLIENT_MESSAGE_BYTES = 16 * 1024
const MAX_METRIC_SUBSCRIPTIONS = 32
const MAX_OUTBOUND_EVENTS = 64
const MAX_OUTBOUND_BYTES = 1024 * 1024
const SOCKET_LIFETIME_MS = 60 * 60 * 1000
const UPTIME_RANGES: { range: UptimeRange; durationMs: number; bucketCount: number }[] = [
  { range: '24h', durationMs: 24 * 60 * 60 * 1_000, bucketCount: 24 },
  { range: '7d', durationMs: 7 * 24 * 60 * 60 * 1_000, bucketCount: 21 },
  { range: '30d', durationMs: 30 * 24 * 60 * 60 * 1_000, bucketCount: 30 }
]

type ClientMessage = { type: 'subscribe_status' } | { type: 'subscribe_metrics'; cardId: string } | { type: 'unsubscribe_metrics'; cardId: string }

type RealtimeSocket = {
  socket: WebSocket
  headers: Headers
  metrics: Set<string>
  statusSubscribed: boolean
  pendingEvents: number
  pendingBytes: number
  closed: boolean
  lifetime: ReturnType<typeof setTimeout>
}

export type RealtimePublisher = {
  publishStatusDelta(cardId: string, status: unknown): Promise<void>
  publishMetricsDelta(cardId: string): Promise<void>
}

type RealtimeUptimeMetric = Omit<UptimeMetric, 'observations'> & { buckets: Record<UptimeRange, UptimeBucket[]> }
type RealtimeMetricsResponse = Omit<MetricsResponse, 'uptimeMetrics'> & { uptimeMetrics?: RealtimeUptimeMetric[] }
type CachedMetricsSnapshot = {
  resource: ContainerResources | null
  history: ResourceMetricSample[]
  historyPeriodMs: number
  pending: boolean
  customMetrics: CustomMetric[]
  uptimeMetrics: RealtimeUptimeMetric[]
  metricErrors?: MetricsResponse['metricErrors']
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

export function sameOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin
  if (!origin) return true
  const forwarded = forwardedParameters(firstForwardedValue(request.headers.forwarded))
  const host = forwarded.host ?? firstForwardedValue(request.headers['x-forwarded-host']) ?? request.headers.host
  if (!host) return false
  const protocol = (forwarded.proto ?? firstForwardedValue(request.headers['x-forwarded-proto']))?.toLowerCase() === 'https' ? 'https:' : 'http:'
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

function parseMessage(value: unknown): ClientMessage | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const message = value as Record<string, unknown>
  if (message.type === 'subscribe_status' && Object.keys(message).length === 1) return { type: message.type }
  if (
    (message.type === 'subscribe_metrics' || message.type === 'unsubscribe_metrics') &&
    typeof message.cardId === 'string' &&
    message.cardId.length > 0 &&
    message.cardId.length <= 256 &&
    Object.keys(message).length === 2
  ) {
    return { type: message.type, cardId: message.cardId }
  }
  return undefined
}

function visibleResource<T extends ContainerResources>(resource: T, visible: (metric: string) => boolean): T {
  return {
    ...resource,
    cpuPercent: visible('cpu') ? resource.cpuPercent : undefined,
    memoryUsage: visible('memory') ? resource.memoryUsage : undefined,
    memoryLimit: visible('memory') ? resource.memoryLimit : undefined,
    receivedBytesPerSecond: visible('network') ? resource.receivedBytesPerSecond : undefined,
    sentBytesPerSecond: visible('network') ? resource.sentBytesPerSecond : undefined,
    networkRatePending: visible('network') ? resource.networkRatePending : undefined
  }
}

function uptimeBuckets(metric: UptimeMetric, durationMs: number, bucketCount: number, now = Date.now()): UptimeBucket[] {
  const bucketMs = durationMs / bucketCount
  const end = Math.floor(now / bucketMs) * bucketMs + bucketMs
  const start = end - durationMs
  return Array.from({ length: bucketCount }, (_, index) => {
    const bucketStart = start + index * bucketMs
    const bucketEnd = bucketStart + bucketMs
    const observations = metric.observations.filter((observation) => observation.timestamp >= bucketStart && observation.timestamp < bucketEnd)
    const successes = observations.filter((observation) => observation.status === 'up').length
    const failures = observations.filter((observation) => observation.status === 'down').length
    const responseTimes = observations.flatMap((observation) => (observation.responseTimeMs === undefined ? [] : [observation.responseTimeMs]))
    return {
      start: bucketStart,
      end: bucketEnd,
      status: failures > 0 && successes > 0 ? 'mixed' : failures > 0 ? 'down' : successes > 0 ? 'up' : 'unknown',
      successes,
      failures,
      ...(responseTimes.length > 0 ? { slowestResponseTimeMs: Math.max(...responseTimes) } : {})
    }
  })
}

function uptimeBucketsByRange(metric: UptimeMetric): Record<UptimeRange, UptimeBucket[]> {
  return Object.fromEntries(UPTIME_RANGES.map(({ range, durationMs, bucketCount }) => [range, uptimeBuckets(metric, durationMs, bucketCount)])) as Record<UptimeRange, UptimeBucket[]>
}

function cachedMetricsSnapshot(config: AppConfig, cardId: string, historyPeriodMs: number, snapshots: Map<string, Map<number, CachedMetricsSnapshot>>): CachedMetricsSnapshot {
  const cached = snapshots.get(cardId)?.get(historyPeriodMs)
  if (cached) return cached
  const usage = getLatestMetricUsage(cardId)
  const snapshot: CachedMetricsSnapshot = {
    resource: usage?.resource ?? null,
    history: getResourceMetricHistory(config, cardId, historyPeriodMs),
    historyPeriodMs,
    pending: usage === undefined,
    customMetrics: usage?.customMetrics.map((metric) => ('unit' in metric ? { ...metric, history: getMetricHistory(config, cardId, metric.key, historyPeriodMs), historyPeriodMs } : metric)) ?? [],
    uptimeMetrics: (usage?.uptimeMetrics ?? []).map((metric) => ({ key: metric.key, label: metric.label, current: metric.current, buckets: uptimeBucketsByRange(metric) })),
    ...(usage?.metricErrors ? { metricErrors: usage.metricErrors } : {})
  }
  const cardSnapshots = snapshots.get(cardId) ?? new Map<number, CachedMetricsSnapshot>()
  cardSnapshots.set(historyPeriodMs, snapshot)
  snapshots.set(cardId, cardSnapshots)
  return snapshot
}

function metricsSnapshot(config: AppConfig, headers: Headers, cardId: string, snapshots: Map<string, Map<number, CachedMetricsSnapshot>>, includeUptime = true): RealtimeMetricsResponse | undefined {
  const access = getDiscoveryCoordinator(config).getMetricAccess(headers, cardId)
  if (!access) return undefined
  const visible = (metric: string) => canViewMetric(config, headers, access.metricsAccess, metric)
  const historyPeriodMs = access.historyPeriodMs ?? config.metricsHistoryPeriodMs
  const snapshot = cachedMetricsSnapshot(config, cardId, historyPeriodMs, snapshots)
  const customMetrics: CustomMetric[] = snapshot.customMetrics.filter((metric) => visible(metric.key))
  return {
    resource: snapshot.resource ? visibleResource(snapshot.resource, visible) : null,
    history: snapshot.history.map((sample) => visibleResource<ResourceMetricSample>(sample, visible)),
    historyPeriodMs,
    pending: snapshot.pending,
    customMetrics,
    ...(includeUptime
      ? {
          uptimeMetrics: snapshot.uptimeMetrics?.filter((metric) => visible(metric.key))
        }
      : {}),
    metricErrors: (snapshot.metricErrors ?? access.metricErrors ?? []).filter((error) => visible(error.key))
  }
}

function createRealtimeServer(config: AppConfig): RealtimeServer {
  const clients = new Set<RealtimeSocket>()
  const devWebSockets = new WebSocketServer({ noServer: true, maxPayload: MAX_CLIENT_MESSAGE_BYTES })
  const coordinator = getDiscoveryCoordinator(config)
  coordinator.start()
  const publishedUptimeBuckets = new Map<string, Record<UptimeRange, UptimeBucket[]>>()
  const metricSnapshots = new Map<string, Map<number, CachedMetricsSnapshot>>()
  let version = 0

  const nextVersion = () => ++version
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
    let message: ClientMessage | undefined
    try {
      message = parseMessage(JSON.parse(value))
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
    const client: RealtimeSocket = {
      socket,
      headers: requestHeaders(request),
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
      void handleMessage(client, data.toString())
    })
    socket.on('close', () => closeClient(client))
    socket.on('error', () => closeClient(client))
    void sendStatusSnapshot(client)
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
