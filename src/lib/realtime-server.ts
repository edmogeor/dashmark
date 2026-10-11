import type { IncomingMessage, Server } from 'node:http'
import type { Duplex } from 'node:stream'
import WebSocket, { WebSocketServer } from 'ws'
import { isAuthorized } from './auth'
import type { AppConfig } from './config'
import { REALTIME_MAX_CLIENT_MESSAGE_BYTES, REALTIME_MAX_METRIC_SUBSCRIPTIONS } from './constants'
import { canViewMetric, type ContainerMetricUsage } from './docker'
import { getDiscoveryCoordinator } from './discovery-coordinator'
import { getLatestMetricUsage } from './metrics'
import type { UptimeBucket } from './uptime-buckets'
import { UPTIME_RANGES, type UptimeRange } from './uptime-ranges'
import { metricsSnapshot, uptimeBucketsByRange, type MetricsSnapshots } from './realtime-metrics-snapshot'
import { parseClientMessage, type RealtimeMetricsResponse } from './realtime-protocol'
import { createSocketLifecycle, type RealtimeSocket } from './realtime-socket-lifecycle'
import { retainMetricRecoveryPriority } from './metric-recovery'

const PATHNAME = '/api/realtime'

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
  const devWebSockets = new WebSocketServer({ noServer: true, maxPayload: REALTIME_MAX_CLIENT_MESSAGE_BYTES })
  const coordinator = getDiscoveryCoordinator(config)
  coordinator.start()
  const publishedUptimeBuckets = new Map<string, Record<UptimeRange, UptimeBucket[]>>()
  const metricSnapshots: MetricsSnapshots = new Map()
  const snapshotQueues = new WeakMap<RealtimeSocket, Promise<boolean>>()
  let visibleStatusCards = new WeakMap<RealtimeSocket, Set<string>>()
  let version = 0

  const nextVersion = () => ++version
  const historySignature = (metrics: RealtimeMetricsResponse, access: ContainerMetricUsage | undefined): string =>
    JSON.stringify([
      metrics.historyPeriodMs ?? config.metricsHistoryPeriodMs,
      config.metricsAccess,
      access?.metricsAccess,
      metrics.customMetrics.flatMap((metric) => ('unit' in metric ? [metric.key] : []))
    ])
  const releaseUnusedMetrics = (cardId: string): void => {
    for (const client of clients) if (client.metrics.has(cardId)) return
    metricSnapshots.delete(cardId)
    for (const key of publishedUptimeBuckets.keys()) if (key.startsWith(`${cardId}\0`)) publishedUptimeBuckets.delete(key)
  }
  function unsubscribeMetrics(client: RealtimeSocket, cardId: string): void {
    client.metrics.get(cardId)?.releasePriority?.()
    client.metrics.delete(cardId)
    releaseUnusedMetrics(cardId)
  }
  const sendStatusSnapshot = async (client: RealtimeSocket): Promise<void> => {
    await coordinator.ready()
    if (client.closed) return
    const result = coordinator.getStatusSnapshot(client.headers)
    visibleStatusCards.set(client, new Set(Object.keys(result.statuses)))
    if (!client.closed)
      send(client, {
        type: 'status_snapshot',
        version: nextVersion(),
        statuses: result.statuses,
        capabilities: { incrementalMetricHistory: true, ...(config.enableMetricBackfill ? { metricRecoveryPriority: true } : {}) }
      })
  }
  const sendMetricsSnapshot = (client: RealtimeSocket, cardId: string): Promise<boolean> => {
    const subscription = client.metrics.get(cardId)
    if (subscription) subscription.ready = false
    const pending = (snapshotQueues.get(client) ?? Promise.resolve(false))
      .catch(() => false)
      .then(async () => {
        await coordinator.ready()
        if (client.closed || !subscription || client.metrics.get(cardId) !== subscription) return false
        const now = Date.now()
        const metrics = metricsSnapshot(config, client.headers, cardId, metricSnapshots, true, undefined, now)
        if (!metrics || client.closed) return false
        const signature = historySignature(metrics, coordinator.getMetricAccess(client.headers, cardId))
        const sent = sendSnapshot(client, { type: 'metrics_snapshot', version: nextVersion(), cardId, metrics })
        if (subscription.incremental) metricSnapshots.delete(cardId)
        if (!(await sent)) return false
        if (client.metrics.get(cardId) !== subscription) return false
        subscription.ready = true
        if (subscription.incremental) {
          subscription.cursor = { timestamp: now, signature }
        }
        return true
      })
    snapshotQueues.set(client, pending)
    return pending
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
      unsubscribeMetrics(client, message.cardId)
      return
    }
    if (message.type === 'set_metric_priority') {
      await coordinator.ready()
      const subscription = client.metrics.get(message.cardId)
      if (client.closed || !subscription) return
      subscription.releasePriority?.()
      subscription.releasePriority = undefined
      if (config.enableMetricBackfill && message.priority && coordinator.getMetricAccess(client.headers, message.cardId)) {
        subscription.releasePriority = retainMetricRecoveryPriority(message.cardId, (key) => {
          const access = coordinator.getMetricAccess(client.headers, message.cardId)
          return Boolean(access) && (message.metricKey === undefined || key === message.metricKey) && canViewMetric(config, client.headers, access?.metricsAccess, key)
        })
      }
      return
    }
    if (!client.metrics.has(message.cardId) && client.metrics.size >= REALTIME_MAX_METRIC_SUBSCRIPTIONS) return closeClient(client, 1008)
    client.metrics.get(message.cardId)?.releasePriority?.()
    const subscription = { incremental: message.incremental === true, ready: false }
    client.metrics.set(message.cardId, subscription)
    if (!(await sendMetricsSnapshot(client, message.cardId)) && client.metrics.get(message.cardId) === subscription) {
      unsubscribeMetrics(client, message.cardId)
    }
  }
  const {
    clients,
    closeClient,
    connect: connectSocket,
    send,
    sendSnapshot
  } = createSocketLifecycle({
    onMessage: (client, value) => void handleMessage(client, value).catch(() => closeClient(client, 1011)),
    onConnect: (client) => void sendStatusSnapshot(client),
    onClose: (client) => {
      for (const cardId of client.metrics.keys()) unsubscribeMetrics(client, cardId)
    }
  })
  coordinator.onStatusChange((cardId, status) => {
    void publishStatusDelta(cardId, status)
  })
  coordinator.onMetricsChange((cardId) => {
    void publishMetricsDelta(cardId)
  })
  coordinator.onCardsChange((cardIds) => {
    visibleStatusCards = new WeakMap()
    for (const cardId of metricSnapshots.keys()) if (!cardIds.has(cardId)) metricSnapshots.delete(cardId)
    for (const key of publishedUptimeBuckets.keys()) if (!cardIds.has(key.slice(0, key.indexOf('\0')))) publishedUptimeBuckets.delete(key)
  })
  const publishStatusDelta = async (cardId: string, status: unknown): Promise<void> => {
    for (const client of clients) {
      if (!client.statusSubscribed) continue
      let visible = visibleStatusCards.get(client)
      if (!visible) {
        visible = new Set(Object.keys(coordinator.getStatusSnapshot(client.headers).statuses))
        visibleStatusCards.set(client, visible)
      }
      if (visible.has(cardId)) send(client, { type: 'status_delta', version: nextVersion(), cardId, status })
    }
  }
  const publishMetricsDelta = async (cardId: string): Promise<void> => {
    metricSnapshots.delete(cardId)
    const subscribers = [...clients].filter((client) => client.metrics.get(cardId)?.ready)
    if (subscribers.length === 0) {
      for (const key of publishedUptimeBuckets.keys()) if (key.startsWith(`${cardId}\0`)) publishedUptimeBuckets.delete(key)
      return
    }
    const usage = getLatestMetricUsage(cardId)
    const changedBuckets: { key: string; range: UptimeRange; bucket: UptimeBucket }[] = []
    let bucketWindowRolled = false
    for (const metric of usage?.uptimeMetrics ?? []) {
      const bucketKey = `${cardId}\0${metric.key}`
      const buckets = uptimeBucketsByRange(config, cardId, metric)
      const previous = publishedUptimeBuckets.get(bucketKey)
      for (const { range } of UPTIME_RANGES) {
        const previousRange = previous?.[range]
        const currentRange = buckets[range]
        if (previousRange && previousRange[0]?.start === currentRange[0]?.start) {
          for (let index = 0; index < currentRange.length; index++) {
            if (JSON.stringify(previousRange[index]) !== JSON.stringify(currentRange[index])) changedBuckets.push({ key: metric.key, range, bucket: currentRange[index]! })
          }
        } else {
          bucketWindowRolled = true
        }
      }
      publishedUptimeBuckets.set(bucketKey, buckets)
    }
    await Promise.all(
      subscribers.map(async (client) => {
        const subscription = client.metrics.get(cardId)
        if (!subscription) return
        const now = Date.now()
        const cursor = subscription.cursor
        const since = subscription.incremental && cursor && now >= cursor.timestamp ? cursor.timestamp : undefined
        const metrics = metricsSnapshot(config, client.headers, cardId, metricSnapshots, bucketWindowRolled, since, now)
        const access = coordinator.getMetricAccess(client.headers, cardId)
        if (!metrics) return
        if (subscription.incremental) {
          const signature = historySignature(metrics, access)
          if (!cursor || since === undefined || cursor.signature !== signature) {
            await sendMetricsSnapshot(client, cardId)
            return
          }
          const cutoff = now - (metrics.historyPeriodMs ?? config.metricsHistoryPeriodMs)
          if (!send(client, { type: 'metrics_history_delta', version: nextVersion(), cardId, metrics, replaceFrom: since, cutoff })) return
          subscription.cursor = { timestamp: now, signature }
        } else if (!send(client, { type: 'metrics_delta', version: nextVersion(), cardId, metrics }, true)) return
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
