import type { ContainerStatus, MetricsResponse, UptimeStatus } from './status'
import { UPTIME_RANGES, type UptimeRange } from './uptime-ranges'

export type { UptimeRange } from './uptime-ranges'

export type UptimeBucket = {
  start: number
  end: number
  status: UptimeStatus | 'mixed'
  successes: number
  failures: number
  slowestResponseTimeMs?: number
}

export type UptimeMetricSummary = {
  key: string
  label: string
  current: UptimeStatus
  buckets: Record<UptimeRange, UptimeBucket[]>
}

export type RealtimeMetricsResponse = Omit<MetricsResponse, 'uptimeMetrics'> & {
  uptimeMetrics?: UptimeMetricSummary[]
}

type StatusListener = (statuses: Record<string, ContainerStatus>) => void
type MetricsListener = (metrics: RealtimeMetricsResponse) => void
type ConnectionListener = (unavailable: boolean) => void

type ServerMessage =
  | { type: 'status_snapshot'; version: number; statuses: Record<string, ContainerStatus> }
  | { type: 'status_delta'; version: number; cardId: string; status: ContainerStatus }
  | { type: 'metrics_snapshot'; version: number; cardId: string; metrics: RealtimeMetricsResponse }
  | { type: 'metrics_delta'; version: number; cardId: string; metrics: RealtimeMetricsResponse }
  | { type: 'uptime_bucket_delta'; version: number; cardId: string; key: string; range: UptimeRange; bucket: UptimeBucket }

const INITIAL_RECONNECT_DELAY_MS = 1_000
const MAX_RECONNECT_DELAY_MS = 30_000
const UNAVAILABLE_AFTER_ATTEMPTS = 5

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

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
  if (value.type === 'metrics_snapshot' || value.type === 'metrics_delta') return typeof value.cardId === 'string' && isRecord(value.metrics)
  return (
    value.type === 'uptime_bucket_delta' &&
    typeof value.cardId === 'string' &&
    typeof value.key === 'string' &&
    UPTIME_RANGES.some(({ range }) => value.range === range) &&
    isUptimeBucket(value.bucket)
  )
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
  private statuses: Record<string, ContainerStatus> = {}
  private statusListeners = new Set<StatusListener>()
  private connectionListeners = new Set<ConnectionListener>()
  private metricListeners = new Map<string, Set<MetricsListener>>()
  private metrics = new Map<string, RealtimeMetricsResponse>()

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
    if (wasUnused) this.send({ type: 'subscribe_metrics', cardId })
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
    if (document.visibilityState !== 'visible') return
    document.addEventListener('visibilitychange', this.handleVisibilityChange)
    if (!this.socket && !this.reconnectTimer) this.connect()
  }

  private stopIfUnused() {
    if (this.statusListeners.size || this.metricListeners.size) return
    document.removeEventListener('visibilitychange', this.handleVisibilityChange)
    this.close()
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
      this.connectionListeners.forEach((listener) => listener(false))
      this.send({ type: 'subscribe_status' })
      for (const cardId of this.metricListeners.keys()) this.send({ type: 'subscribe_metrics', cardId })
    })
    socket.addEventListener('message', (event) => this.handleMessage(event))
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
    if (this.reconnectAttempts >= UNAVAILABLE_AFTER_ATTEMPTS) {
      this.unavailable = true
      this.connectionListeners.forEach((listener) => listener(true))
    }
    const delay = Math.min(INITIAL_RECONNECT_DELAY_MS * 2 ** (this.reconnectAttempts - 1), MAX_RECONNECT_DELAY_MS)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  private send(message: { type: string; cardId?: string }) {
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
      this.statusListeners.forEach((listener) => listener(this.statuses))
    } else if (value.type === 'status_delta') {
      this.statuses = { ...this.statuses, [value.cardId]: value.status }
      this.statusListeners.forEach((listener) => listener(this.statuses))
    } else if (value.type === 'metrics_snapshot') {
      this.publishMetrics(value.cardId, value.metrics)
    } else if (value.type === 'metrics_delta') {
      this.publishMetrics(value.cardId, { ...this.metrics.get(value.cardId), ...value.metrics })
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
    this.metrics.set(cardId, metrics)
    this.metricListeners.get(cardId)?.forEach((listener) => listener(metrics))
  }
}

export const realtimeClient = new RealtimeClient()
