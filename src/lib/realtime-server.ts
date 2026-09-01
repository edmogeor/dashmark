import { createHash } from 'node:crypto'
import type { IncomingMessage, Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { isAuthorized } from './auth'
import type { AppConfig } from './config'
import { canViewMetric } from './docker'
import { getDiscoveryCoordinator } from './discovery-coordinator'
import { getLatestMetricUsage, getMetricHistory, getResourceMetricHistory } from './metrics'
import type { ContainerResources, CustomMetric, MetricsResponse, ResourceMetricSample, UptimeMetric, UptimeStatus } from './status'

const PATHNAME = '/api/realtime'
const MAX_CLIENT_MESSAGE_BYTES = 16 * 1024
const MAX_METRIC_SUBSCRIPTIONS = 32
const MAX_OUTBOUND_EVENTS = 64
const MAX_OUTBOUND_BYTES = 1024 * 1024
const SOCKET_LIFETIME_MS = 60 * 60 * 1000
const UPTIME_BUCKET_DURATION_MS = 30 * 24 * 60 * 60 * 1000
const UPTIME_BUCKET_COUNT = 120

type ClientMessage = { type: 'subscribe_status' } | { type: 'subscribe_metrics'; cardId: string } | { type: 'unsubscribe_metrics'; cardId: string }

type RealtimeSocket = {
  socket: Duplex
  headers: Headers
  metrics: Set<string>
  statusSubscribed: boolean
  pendingEvents: number
  pendingBytes: number
  closed: boolean
  buffer: Buffer
  lifetime: ReturnType<typeof setTimeout>
}

export type RealtimePublisher = {
  publishStatusDelta(cardId: string, status: unknown): Promise<void>
  publishMetricsDelta(cardId: string): Promise<void>
  publishUptimeBucketDelta(cardId: string, key: string, bucket: unknown): Promise<void>
}

type UptimeBucket = {
  start: number
  end: number
  status: UptimeStatus | 'mixed'
  successes: number
  failures: number
  slowestResponseTimeMs?: number
}

type RealtimeUptimeMetric = Omit<UptimeMetric, 'observations'> & { buckets: UptimeBucket[] }
type RealtimeMetricsResponse = Omit<MetricsResponse, 'uptimeMetrics'> & { uptimeMetrics?: RealtimeUptimeMetric[] }

export type RealtimeServer = RealtimePublisher & {
  attach(server: Server): void
  close(): void
}

declare global {
  // The Node runtime entry attaches this instance to its HTTP server after loading Astro.
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

function sameOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin
  if (!origin) return true
  const host = request.headers.host
  if (!host) return false
  const forwardedProtocol = request.headers['x-forwarded-proto']?.toString().split(',')[0]?.trim()
  const protocol = forwardedProtocol === 'https' ? 'https:' : 'http:'
  try {
    return new URL(origin).origin === `${protocol}//${host}`
  } catch {
    return false
  }
}

function reject(socket: Duplex, status: number, reason: string): void {
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
  socket.destroy()
}

function websocketAccept(key: string): string {
  return createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64')
}

function isUpgradeRequest(request: IncomingMessage): boolean {
  const key = request.headers['sec-websocket-key']
  return Boolean(
    request.method === 'GET' &&
    request.headers.upgrade?.toLowerCase() === 'websocket' &&
    request.headers.connection
      ?.toLowerCase()
      .split(',')
      .map((part) => part.trim())
      .includes('upgrade') &&
    request.headers['sec-websocket-version'] === '13' &&
    typeof key === 'string' &&
    Buffer.from(key, 'base64').length === 16
  )
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

function frame(opcode: number, payload: string): Buffer {
  const body = Buffer.from(payload)
  if (body.length < 126) return Buffer.concat([Buffer.from([0x80 | opcode, body.length]), body])
  if (body.length <= 65_535) {
    const header = Buffer.alloc(4)
    header[0] = 0x80 | opcode
    header[1] = 126
    header.writeUInt16BE(body.length, 2)
    return Buffer.concat([header, body])
  }
  const header = Buffer.alloc(10)
  header[0] = 0x80 | opcode
  header[1] = 127
  header.writeBigUInt64BE(BigInt(body.length), 2)
  return Buffer.concat([header, body])
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

function uptimeBuckets(metric: UptimeMetric, now = Date.now()): UptimeBucket[] {
  const bucketMs = UPTIME_BUCKET_DURATION_MS / UPTIME_BUCKET_COUNT
  const end = Math.floor(now / bucketMs) * bucketMs + bucketMs
  const start = end - UPTIME_BUCKET_DURATION_MS
  return Array.from({ length: UPTIME_BUCKET_COUNT }, (_, index) => {
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

async function metricsSnapshot(config: AppConfig, headers: Headers, cardId: string, includeUptime = true): Promise<RealtimeMetricsResponse | undefined> {
  const access = getDiscoveryCoordinator(config).getMetricAccess(headers, cardId)
  if (!access) return undefined
  const usage = getLatestMetricUsage(cardId)
  const visible = (metric: string) => canViewMetric(config, headers, access.metricsAccess, metric)
  const historyPeriodMs = access.historyPeriodMs ?? config.metricsHistoryPeriodMs
  const customMetrics: CustomMetric[] =
    usage?.customMetrics
      .filter((metric) => visible(metric.key))
      .map((metric) => ('unit' in metric ? { ...metric, history: getMetricHistory(config, cardId, metric.key, historyPeriodMs), historyPeriodMs } : metric)) ?? []
  return {
    resource: usage?.resource ? visibleResource(usage.resource, visible) : null,
    history: getResourceMetricHistory(config, cardId, historyPeriodMs).map((sample) => visibleResource<ResourceMetricSample>(sample, visible)),
    historyPeriodMs,
    pending: usage === undefined,
    customMetrics,
    ...(includeUptime
      ? {
          uptimeMetrics: (usage?.uptimeMetrics ?? [])
            .filter((metric) => visible(metric.key))
            .map((metric) => ({ key: metric.key, label: metric.label, current: metric.current, buckets: uptimeBuckets(metric) }))
        }
      : {}),
    metricErrors: (usage?.metricErrors ?? access.metricErrors ?? []).filter((error) => visible(error.key))
  }
}

function createRealtimeServer(config: AppConfig): RealtimeServer {
  const clients = new Set<RealtimeSocket>()
  const coordinator = getDiscoveryCoordinator(config)
  coordinator.start()
  const publishedUptimeBuckets = new Map<string, UptimeBucket[]>()
  let version = 0

  const nextVersion = () => ++version
  const closeClient = (client: RealtimeSocket, code = 1000): void => {
    if (client.closed) return
    client.closed = true
    clearTimeout(client.lifetime)
    clients.delete(client)
    client.socket.write(frame(8, String.fromCharCode(code)))
    client.socket.end()
  }
  const send = (client: RealtimeSocket, message: object): boolean => {
    if (client.closed) return false
    const data = frame(1, JSON.stringify(message))
    if (client.pendingEvents >= MAX_OUTBOUND_EVENTS || client.pendingBytes + data.length > MAX_OUTBOUND_BYTES) {
      closeClient(client, 1008)
      return false
    }
    client.pendingEvents++
    client.pendingBytes += data.length
    client.socket.write(data, () => {
      client.pendingEvents--
      client.pendingBytes -= data.length
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
    const metrics = await metricsSnapshot(config, client.headers, cardId)
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
  const publishStatusDelta = async (cardId: string, status: unknown): Promise<void> => {
    for (const client of [...clients].filter((candidate) => candidate.statusSubscribed)) {
      const visible = coordinator.getStatusSnapshot(client.headers)
      if (Object.hasOwn(visible.statuses, cardId)) send(client, { type: 'status_delta', version: nextVersion(), cardId, status })
    }
  }
  const publishMetricsDelta = async (cardId: string): Promise<void> => {
    const usage = getLatestMetricUsage(cardId)
    const changedBuckets: { key: string; bucket: UptimeBucket }[] = []
    let bucketWindowRolled = false
    for (const metric of usage?.uptimeMetrics ?? []) {
      const bucketKey = `${cardId}\0${metric.key}`
      const buckets = uptimeBuckets(metric)
      const previous = publishedUptimeBuckets.get(bucketKey)
      if (previous && previous[0]?.start === buckets[0]?.start) {
        for (let index = 0; index < buckets.length; index++) {
          if (JSON.stringify(previous[index]) !== JSON.stringify(buckets[index])) changedBuckets.push({ key: metric.key, bucket: buckets[index]! })
        }
      } else if (previous) bucketWindowRolled = true
      publishedUptimeBuckets.set(bucketKey, buckets)
    }
    await Promise.all(
      [...clients]
        .filter((client) => client.metrics.has(cardId))
        .map(async (client) => {
          const metrics = await metricsSnapshot(config, client.headers, cardId, bucketWindowRolled)
          if (metrics) send(client, { type: 'metrics_delta', version: nextVersion(), cardId, metrics })
          const access = coordinator.getMetricAccess(client.headers, cardId)
          for (const { key, bucket } of changedBuckets) {
            if (access && canViewMetric(config, client.headers, access.metricsAccess, key)) send(client, { type: 'uptime_bucket_delta', version: nextVersion(), cardId, key, bucket })
          }
        })
    )
  }
  const processFrames = (client: RealtimeSocket): void => {
    while (client.buffer.length >= 2) {
      const first = client.buffer[0]
      const second = client.buffer[1]
      const final = (first & 0x80) !== 0
      const opcode = first & 0x0f
      const masked = (second & 0x80) !== 0
      let length = second & 0x7f
      let offset = 2
      if (!final || !masked || opcode === 0 || opcode > 2) return closeClient(client, 1002)
      if (length === 126) {
        if (client.buffer.length < 4) return
        length = client.buffer.readUInt16BE(2)
        offset = 4
      } else if (length === 127) return closeClient(client, 1009)
      if (length > MAX_CLIENT_MESSAGE_BYTES) return closeClient(client, 1009)
      if (client.buffer.length < offset + 4 + length) return
      const mask = client.buffer.subarray(offset, offset + 4)
      const payload = Buffer.from(client.buffer.subarray(offset + 4, offset + 4 + length))
      client.buffer = client.buffer.subarray(offset + 4 + length)
      for (let index = 0; index < payload.length; index++) payload[index] ^= mask[index % 4]
      if (opcode === 8) return closeClient(client)
      if (opcode === 9) {
        client.socket.write(frame(10, payload.toString()))
        continue
      }
      if (opcode !== 1) return closeClient(client, 1003)
      try {
        void handleMessage(client, new TextDecoder('utf-8', { fatal: true }).decode(payload))
      } catch {
        return closeClient(client, 1007)
      }
    }
  }
  const attach = (server: Server): void => {
    server.on('upgrade', (request, socket, head) => {
      if (new URL(request.url ?? '/', 'http://localhost').pathname !== PATHNAME) return reject(socket, 404, 'Not Found')
      if (!isUpgradeRequest(request) || !sameOrigin(request)) return reject(socket, 403, 'Forbidden')
      const headers = requestHeaders(request)
      const authRequest = new Request(`http://${request.headers.host ?? 'localhost'}${request.url ?? '/'}`, { headers })
      if (!isAuthorized(authRequest, config.authToken)) return reject(socket, 401, 'Unauthorized')
      const key = request.headers['sec-websocket-key'] as string
      socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${websocketAccept(key)}\r\n\r\n`)
      const client: RealtimeSocket = {
        socket,
        headers,
        metrics: new Set(),
        statusSubscribed: true,
        pendingEvents: 0,
        pendingBytes: 0,
        closed: false,
        buffer: Buffer.alloc(0),
        lifetime: setTimeout(() => closeClient(client, 1001), SOCKET_LIFETIME_MS)
      }
      client.lifetime.unref()
      clients.add(client)
      socket.on('data', (chunk: Buffer) => {
        client.buffer = Buffer.concat([client.buffer, chunk])
        if (client.buffer.length > MAX_CLIENT_MESSAGE_BYTES + 14) closeClient(client, 1009)
        else processFrames(client)
      })
      socket.on('close', () => closeClient(client))
      socket.on('error', () => closeClient(client))
      if (head.length > 0) {
        client.buffer = head
        processFrames(client)
      }
      void sendStatusSnapshot(client)
    })
  }
  return {
    attach,
    close: () => {
      for (const client of clients) closeClient(client, 1001)
    },
    publishStatusDelta,
    publishMetricsDelta,
    publishUptimeBucketDelta: async (cardId, key, bucket) => {
      await Promise.all(
        [...clients]
          .filter((client) => client.metrics.has(cardId))
          .map(async (client) => {
            const metrics = await metricsSnapshot(config, client.headers, cardId)
            if (metrics && metrics.uptimeMetrics?.some((metric) => metric.key === key)) send(client, { type: 'uptime_bucket_delta', version: nextVersion(), cardId, key, bucket })
          })
      )
    }
  }
}

export function getRealtimeServer(config: AppConfig): RealtimeServer {
  return (globalThis.__dashmarkRealtime ??= createRealtimeServer(config))
}
