import { isMetricsResponse, type ContainerStatus, type UptimeStatus, type MetricRecoveryState } from './status'
import type { ClientMessage, RealtimeMetricsResponse } from './realtime-protocol'
import { isRecord } from './errors'
import { REALTIME_INITIAL_RECONNECT_DELAY_MS, REALTIME_MAX_RECONNECT_DELAY_MS, REALTIME_UNAVAILABLE_AFTER_ATTEMPTS } from './constants'
import type { UptimeBucket } from './uptime-buckets'
import { UPTIME_RANGES, type UptimeRange } from './uptime-ranges'

export type { UptimeRange } from './uptime-ranges'

export type UptimeMetricSummary = {
  key: string
  label: string
  current: UptimeStatus
  recovery?: MetricRecoveryState
  buckets: Record<UptimeRange, UptimeBucket[]>
}

type StatusListener = (statuses: Record<string, ContainerStatus>) => void
type MetricsListener = (metrics: RealtimeMetricsResponse) => void
type ConnectionListener = (unavailable: boolean) => void

type ServerMessage =
  | { type: 'status_snapshot'; version: number; statuses: Record<string, ContainerStatus>; capabilities?: { incrementalMetricHistory?: boolean; metricRecoveryPriority?: boolean } }
  | { type: 'status_delta'; version: number; cardId: string; status: ContainerStatus }
  | { type: 'metrics_snapshot'; version: number; cardId: string; metrics: RealtimeMetricsResponse }
  | { type: 'metrics_delta'; version: number; cardId: string; metrics: RealtimeMetricsResponse }
  | { type: 'metrics_history_delta'; version: number; cardId: string; metrics: RealtimeMetricsResponse; replaceFrom: number; cutoff: number }
  | { type: 'uptime_bucket_delta'; version: number; cardId: string; key: string; range: UptimeRange; bucket: UptimeBucket }

function isUptimeBucket(value: unknown): value is UptimeBucket {
  return (
    isRecord(value) &&
    typeof value.start === 'number' &&
    typeof value.end === 'number' &&
    (value.status === 'up' || value.status === 'down' || value.status === 'unknown' || value.status === 'mixed') &&
    typeof value.successes === 'number' &&
    typeof value.failures === 'number' &&
    (value.slowestResponseTimeMs === undefined || typeof value.slowestResponseTimeMs === 'number')
  )
}

function isServerMessage(value: unknown): value is ServerMessage {
  if (!isRecord(value) || typeof value.type !== 'string' || typeof value.version !== 'number') return false
  if (value.type === 'status_snapshot') return isRecord(value.statuses)
  if (value.type === 'status_delta') return typeof value.cardId === 'string' && isRecord(value.status)
  if (value.type === 'metrics_snapshot' || value.type === 'metrics_delta')
    return typeof value.cardId === 'string' && isRecord(value.metrics) && isMetricsResponse({ ...value.metrics, uptimeMetrics: [] })
  if (value.type === 'metrics_history_delta')
    return (
      typeof value.cardId === 'string' &&
      typeof value.replaceFrom === 'number' &&
      Number.isFinite(value.replaceFrom) &&
      typeof value.cutoff === 'number' &&
      Number.isFinite(value.cutoff) &&
      isRecord(value.metrics) &&
      isMetricsResponse({ ...value.metrics, uptimeMetrics: [] })
    )
  return (
    value.type === 'uptime_bucket_delta' &&
    typeof value.cardId === 'string' &&
    typeof value.key === 'string' &&
    UPTIME_RANGES.some(({ range }) => value.range === range) &&
    isUptimeBucket(value.bucket)
  )
}

function mergeHistory<T extends { timestamp: number }>(previous: T[], updates: T[], replaceFrom: number, cutoff: number): T[] {
  // Replace the inclusive boundary so distinct samples sharing a timestamp are neither lost nor duplicated.
  return previous.filter((sample) => sample.timestamp >= cutoff && sample.timestamp < replaceFrom).concat(updates.filter((sample) => sample.timestamp >= Math.max(replaceFrom, cutoff)))
}

function realtimeUrl(): string {
  const url = new URL('api/realtime', document.baseURI)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

export class RealtimeClient {
  private socket: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0
  private unavailable = false
  private latestVersion = 0
  private incrementalHistory: boolean | undefined
  private statuses: Record<string, ContainerStatus> = {}
  private statusListeners = new Set<StatusListener>()
  private connectionListeners = new Set<ConnectionListener>()
  private metricListeners = new Map<string, Set<MetricsListener>>()
  private metrics = new Map<string, RealtimeMetricsResponse>()
  private metricPriorities = new Map<string, Map<symbol, string | true>>()
  private recoveryPrioritySupported = false

  retainMetricPriority(cardId: string, priority: string | true): () => void {
    const viewers = this.metricPriorities.get(cardId) ?? new Map<symbol, string | true>()
    const viewer = Symbol()
    viewers.set(viewer, priority)
    this.metricPriorities.set(cardId, viewers)
    this.sendMetricPriority(cardId)
    return () => {
      viewers.delete(viewer)
      if (viewers.size === 0) this.metricPriorities.delete(cardId)
      this.sendMetricPriority(cardId)
    }
  }

  retainStatus(listener: StatusListener, connectionListener: ConnectionListener): () => void {
    this.statusListeners.add(listener)
    this.connectionListeners.add(connectionListener)
    this.start()
    return () => {
      this.statusListeners.delete(listener)
      this.connectionListeners.delete(connectionListener)
      this.stopIfUnused()
    }
  }

  retainMetrics(cardId: string, listener: MetricsListener, connectionListener: ConnectionListener): () => void {
    const listeners = this.metricListeners.get(cardId) ?? new Set<MetricsListener>()
    const wasUnused = listeners.size === 0
    listeners.add(listener)
    this.metricListeners.set(cardId, listeners)
    this.connectionListeners.add(connectionListener)
    const metrics = this.metrics.get(cardId)
    if (metrics) listener(metrics)
    if (this.unavailable) connectionListener(true)
    this.start()
    if (wasUnused) this.subscribeMetrics(cardId)
    return () => {
      const current = this.metricListeners.get(cardId)
      if (current) {
        current.delete(listener)
        if (current.size === 0) {
          this.metricListeners.delete(cardId)
          this.metrics.delete(cardId)
          this.send({ type: 'unsubscribe_metrics', cardId })
        }
      }
      this.connectionListeners.delete(connectionListener)
      this.stopIfUnused()
    }
  }

  private start() {
    document.addEventListener('visibilitychange', this.handleVisibilityChange)
    if (!this.socket && !this.reconnectTimer) this.connect()
  }

  private stopIfUnused() {
    if (this.statusListeners.size || this.metricListeners.size) return
    document.removeEventListener('visibilitychange', this.handleVisibilityChange)
    this.close()
    this.statuses = {}
    this.metrics.clear()
  }

  private handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') return this.close()
    if (this.statusListeners.size || this.metricListeners.size) this.connect()
  }

  private connect() {
    if (document.visibilityState !== 'visible' || this.socket || this.reconnectTimer) return
    const socket = new WebSocket(realtimeUrl())
    this.socket = socket
    socket.addEventListener('open', () => {
      if (this.socket !== socket) return
      this.reconnectAttempts = 0
      this.unavailable = false
      this.latestVersion = 0
      this.incrementalHistory = undefined
      this.recoveryPrioritySupported = false
      this.connectionListeners.forEach((listener) => listener(false))
    })
    socket.addEventListener('message', (event) => {
      if (this.socket === socket) this.handleMessage(event)
    })
    socket.addEventListener('close', () => {
      if (this.socket !== socket) return
      this.socket = null
      this.scheduleReconnect()
    })
    socket.addEventListener('error', () => socket.close())
  }

  private close() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    const socket = this.socket
    this.socket = null
    socket?.close()
  }

  private scheduleReconnect() {
    if (document.visibilityState !== 'visible' || (!this.statusListeners.size && !this.metricListeners.size)) return
    this.reconnectAttempts += 1
    if (this.reconnectAttempts >= REALTIME_UNAVAILABLE_AFTER_ATTEMPTS) {
      this.unavailable = true
      this.connectionListeners.forEach((listener) => listener(true))
    }
    const delay = Math.min(REALTIME_INITIAL_RECONNECT_DELAY_MS * 2 ** (this.reconnectAttempts - 1), REALTIME_MAX_RECONNECT_DELAY_MS)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  private subscribeMetrics(cardId: string) {
    if (this.incrementalHistory === undefined) return
    this.send({ type: 'subscribe_metrics', cardId, ...(this.incrementalHistory ? { incremental: true } : {}) })
    if (this.metricPriorities.has(cardId)) this.sendMetricPriority(cardId)
  }

  private sendMetricPriority(cardId: string): void {
    if (!this.recoveryPrioritySupported || !this.metricListeners.has(cardId)) return
    const priorities = new Set(this.metricPriorities.get(cardId)?.values())
    const metricKey = priorities.size === 1 ? [...priorities][0] : undefined
    this.send({ type: 'set_metric_priority', cardId, priority: priorities.size > 0, ...(typeof metricKey === 'string' ? { metricKey } : {}) })
  }

  private send(message: ClientMessage) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message))
  }

  private handleMessage(event: MessageEvent) {
    if (typeof event.data !== 'string') return
    let value: unknown
    try {
      value = JSON.parse(event.data)
    } catch {
      return
    }
    if (!isServerMessage(value) || value.version <= this.latestVersion) return
    this.latestVersion = value.version
    if (value.type === 'status_snapshot') {
      this.statuses = value.statuses
      if (this.incrementalHistory === undefined) {
        this.incrementalHistory = value.capabilities?.incrementalMetricHistory === true
        this.recoveryPrioritySupported = value.capabilities?.metricRecoveryPriority === true
        for (const cardId of this.metricListeners.keys()) this.subscribeMetrics(cardId)
      }
      this.statusListeners.forEach((listener) => listener(this.statuses))
    } else if (value.type === 'status_delta') {
      this.statuses = { ...this.statuses, [value.cardId]: value.status }
      this.statusListeners.forEach((listener) => listener(this.statuses))
    } else if (value.type === 'metrics_snapshot') {
      this.publishMetrics(value.cardId, value.metrics)
    } else if (value.type === 'metrics_delta') {
      this.publishMetrics(value.cardId, { ...this.metrics.get(value.cardId), ...value.metrics })
    } else if (value.type === 'metrics_history_delta') {
      if (!this.metricListeners.has(value.cardId)) return
      const previous = this.metrics.get(value.cardId)
      if (!previous) {
        this.subscribeMetrics(value.cardId)
        return
      }
      const histories = new Map(previous.customMetrics.flatMap((metric) => ('unit' in metric ? [[metric.key, metric.history] as const] : [])))
      this.publishMetrics(value.cardId, {
        ...previous,
        ...value.metrics,
        history: mergeHistory(previous.history ?? [], value.metrics.history ?? [], value.replaceFrom, value.cutoff),
        customMetrics: value.metrics.customMetrics.map((metric) =>
          'unit' in metric ? { ...metric, history: mergeHistory(histories.get(metric.key) ?? [], metric.history, value.replaceFrom, value.cutoff) } : metric
        )
      })
    } else {
      const metrics = this.metrics.get(value.cardId)
      const uptimeMetrics = metrics?.uptimeMetrics
      if (!metrics || !uptimeMetrics) return
      const updatedUptimeMetrics = uptimeMetrics.map((metric) =>
        metric.key !== value.key
          ? metric
          : {
              ...metric,
              buckets: {
                ...metric.buckets,
                [value.range]: metric.buckets[value.range].map((bucket) => (bucket.start === value.bucket.start ? value.bucket : bucket))
              }
            }
      )
      this.publishMetrics(value.cardId, { ...metrics, uptimeMetrics: updatedUptimeMetrics })
    }
  }

  private publishMetrics(cardId: string, metrics: RealtimeMetricsResponse) {
    if (!this.metricListeners.has(cardId)) return
    this.metrics.set(cardId, metrics)
    this.metricListeners.get(cardId)?.forEach((listener) => listener(metrics))
  }
}

export const realtimeClient = new RealtimeClient()
