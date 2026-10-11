// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RealtimeClient } from '@/lib/realtime-client'
import type { RealtimeMetricsResponse } from '@/lib/realtime-protocol'

class FakeWebSocket extends EventTarget {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 3
  static instances: FakeWebSocket[] = []

  readonly sent: string[] = []
  readyState = FakeWebSocket.CONNECTING

  constructor(readonly url: string) {
    super()
    FakeWebSocket.instances.push(this)
  }

  static reset(): void {
    FakeWebSocket.instances = []
  }

  static latest(): FakeWebSocket {
    const socket = FakeWebSocket.instances.at(-1)
    if (!socket) throw new Error('Expected a WebSocket connection')
    return socket
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN
    this.dispatchEvent(new Event('open'))
  }

  close(): void {
    if (this.readyState === FakeWebSocket.CLOSED) return
    this.readyState = FakeWebSocket.CLOSED
    this.dispatchEvent(new Event('close'))
  }

  send(data: string): void {
    this.sent.push(data)
  }

  receive(message: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }))
  }
}

describe('realtime metrics', () => {
  beforeEach(() => {
    FakeWebSocket.reset()
    vi.stubGlobal('WebSocket', FakeWebSocket)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it.each([true, false])('negotiates incremental history only when the server supports it: %s', (supported) => {
    const client = new RealtimeClient()
    const release = client.retainMetrics(
      'card-1',
      () => {},
      () => {}
    )
    const socket = FakeWebSocket.latest()
    socket.open()
    expect(socket.sent).toEqual([])
    socket.receive({ type: 'status_snapshot', version: 1, statuses: {}, ...(supported ? { capabilities: { incrementalMetricHistory: true } } : {}) })
    expect(socket.sent.map((value) => JSON.parse(value))).toEqual([{ type: 'subscribe_metrics', cardId: 'card-1', ...(supported ? { incremental: true } : {}) }])
    release()
  })

  it('merges inclusive history tails without losing duplicate timestamps and expires empty histories', () => {
    const client = new RealtimeClient()
    const received: RealtimeMetricsResponse[] = []
    const release = client.retainMetrics(
      'card-1',
      (metrics) => received.push(metrics),
      () => {}
    )
    const socket = FakeWebSocket.latest()
    socket.open()
    const metric = { key: 'count', label: 'Count', unit: 'count' as const, chart: 'line' as const, value: 2, historyPeriodMs: 30 }
    const buckets = [{ key: 'health', label: 'Health', current: 'up', buckets: { '24h': [], '7d': [], '30d': [] } }]
    socket.receive({
      type: 'metrics_snapshot',
      version: 1,
      cardId: 'card-1',
      metrics: {
        resource: { cpuPercent: 2 },
        history: [
          { timestamp: 10, cpuPercent: 1 },
          { timestamp: 20, cpuPercent: 2 }
        ],
        customMetrics: [
          {
            ...metric,
            history: [
              { timestamp: 10, value: 1 },
              { timestamp: 20, value: 2 }
            ]
          }
        ],
        uptimeMetrics: buckets,
        metricErrors: []
      }
    })
    socket.receive({
      type: 'metrics_history_delta',
      version: 2,
      cardId: 'card-1',
      replaceFrom: 20,
      cutoff: 10,
      metrics: {
        resource: { cpuPercent: 3 },
        history: [
          { timestamp: 20, cpuPercent: 2 },
          { timestamp: 20, cpuPercent: 22 },
          { timestamp: 30, cpuPercent: 3 }
        ],
        customMetrics: [
          {
            ...metric,
            value: 3,
            history: [
              { timestamp: 20, value: 2 },
              { timestamp: 20, value: 22 },
              { timestamp: 30, value: 3 }
            ]
          }
        ],
        metricErrors: []
      }
    })
    expect(received[1]?.history?.map(({ cpuPercent }) => cpuPercent)).toEqual([1, 2, 22, 3])
    expect(received[1]?.customMetrics).toMatchObject([{ history: [{ value: 1 }, { value: 2 }, { value: 22 }, { value: 3 }] }])
    socket.receive({
      type: 'metrics_history_delta',
      version: 3,
      cardId: 'card-1',
      replaceFrom: 30,
      cutoff: 20,
      metrics: {
        resource: { cpuPercent: 4 },
        history: [
          { timestamp: 30, cpuPercent: 3 },
          { timestamp: 40, cpuPercent: 4 }
        ],
        customMetrics: [
          {
            ...metric,
            value: 4,
            history: [
              { timestamp: 30, value: 3 },
              { timestamp: 40, value: 4 }
            ]
          }
        ],
        metricErrors: []
      }
    })
    expect(received[2]?.history?.map(({ timestamp }) => timestamp)).toEqual([20, 20, 30, 40])
    socket.receive({
      type: 'metrics_history_delta',
      version: 4,
      cardId: 'card-1',
      replaceFrom: 40,
      cutoff: 50,
      metrics: {
        resource: null,
        history: [],
        customMetrics: [{ ...metric, value: 4, history: [] }],
        metricErrors: []
      }
    })
    expect(received[3]?.history).toEqual([])
    expect(received[3]?.customMetrics).toMatchObject([{ history: [] }])
    expect(received[3]?.uptimeMetrics).toEqual(buckets)
    socket.receive({ type: 'metrics_history_delta', version: 5, cardId: 'card-1', replaceFrom: 40, cutoff: 'invalid', metrics: { resource: null, customMetrics: [], metricErrors: [] } })
    expect(received).toHaveLength(4)
    release()
  })

  it('requests a full snapshot when a history delta has no baseline', () => {
    const client = new RealtimeClient()
    const listener = vi.fn()
    const release = client.retainMetrics('card-1', listener, () => {})
    const socket = FakeWebSocket.latest()
    socket.open()
    socket.receive({ type: 'status_snapshot', version: 1, statuses: {}, capabilities: { incrementalMetricHistory: true } })
    socket.receive({ type: 'metrics_snapshot', version: 2, cardId: 'card-1', metrics: { resource: null } })
    socket.receive({ type: 'metrics_history_delta', version: 3, cardId: 'card-1', replaceFrom: 0, cutoff: 0, metrics: { resource: null, history: [], customMetrics: [], metricErrors: [] } })
    expect(socket.sent.map((value) => JSON.parse(value))).toEqual(Array.from({ length: 2 }, () => ({ type: 'subscribe_metrics', cardId: 'card-1', incremental: true })))
    expect(listener).not.toHaveBeenCalled()
    release()
  })

  it('notifies a metric subscriber when realtime is already unavailable', () => {
    vi.useFakeTimers()
    const client = new RealtimeClient()
    const unavailable: boolean[] = []
    const releaseStatus = client.retainStatus(
      () => {},
      () => {}
    )

    for (const delay of [1_000, 2_000, 4_000, 8_000]) {
      FakeWebSocket.latest().close()
      vi.advanceTimersByTime(delay)
    }
    FakeWebSocket.latest().close()

    const release = client.retainMetrics(
      'card-1',
      () => {},
      (value) => unavailable.push(value)
    )

    expect(unavailable).toEqual([true])
    release()
    releaseStatus()
  })

  it('retains bucket summaries through metric deltas and applies bucket deltas', () => {
    const client = new RealtimeClient()
    const received: RealtimeMetricsResponse[] = []
    const release = client.retainMetrics(
      'card-1',
      (metrics) => received.push(metrics),
      () => {}
    )
    const socket = FakeWebSocket.latest()
    socket.open()

    socket.receive({
      type: 'metrics_snapshot',
      version: 1,
      cardId: 'card-1',
      metrics: {
        resource: null,
        customMetrics: [],
        metricErrors: [],
        uptimeMetrics: [
          {
            key: 'health',
            label: 'Health',
            current: 'up',
            buckets: {
              '24h': [{ start: 100, end: 200, status: 'up', successes: 2, failures: 0 }],
              '7d': [],
              '30d': []
            }
          }
        ]
      }
    })
    socket.receive({
      type: 'metrics_delta',
      version: 2,
      cardId: 'card-1',
      metrics: { resource: null, customMetrics: [], metricErrors: [], pending: false }
    })
    socket.receive({
      type: 'uptime_bucket_delta',
      version: 3,
      cardId: 'card-1',
      key: 'health',
      range: '24h',
      bucket: { start: 100, end: 200, status: 'mixed', successes: 2, failures: 1, slowestResponseTimeMs: 400 }
    })

    expect(received).toHaveLength(3)
    expect(received[1]?.uptimeMetrics).toEqual(received[0]?.uptimeMetrics)
    expect(received[2]?.uptimeMetrics?.[0]?.buckets['24h']).toEqual([{ start: 100, end: 200, status: 'mixed', successes: 2, failures: 1, slowestResponseTimeMs: 400 }])
    release()
  })

  it('discards late metrics after unsubscribe instead of retaining them for the next subscriber', () => {
    const client = new RealtimeClient()
    const releaseStatus = client.retainStatus(
      () => {},
      () => {}
    )
    const release = client.retainMetrics(
      'card-1',
      () => {},
      () => {}
    )
    const socket = FakeWebSocket.latest()
    socket.open()
    release()
    socket.receive({ type: 'metrics_snapshot', version: 1, cardId: 'card-1', metrics: { resource: null, customMetrics: [], metricErrors: [] } })
    const listener = vi.fn()
    const releaseAgain = client.retainMetrics('card-1', listener, () => {})
    expect(listener).not.toHaveBeenCalled()
    expect(socket.sent.some((message) => JSON.parse(message).type === 'subscribe_status')).toBe(false)
    releaseAgain()
    releaseStatus()
  })

  it('ignores messages from an old socket after reconnecting', () => {
    vi.useFakeTimers()
    const client = new RealtimeClient()
    const listener = vi.fn()
    const release = client.retainStatus(listener, () => {})
    const oldSocket = FakeWebSocket.latest()
    oldSocket.open()
    oldSocket.close()
    vi.advanceTimersByTime(1_000)
    const currentSocket = FakeWebSocket.latest()
    currentSocket.open()
    oldSocket.receive({ type: 'status_snapshot', version: 100, statuses: { stale: { state: 'running' } } })
    currentSocket.receive({ type: 'status_snapshot', version: 1, statuses: { current: { state: 'running' } } })
    expect(listener).toHaveBeenCalledExactlyOnceWith({ current: { state: 'running' } })
    release()
  })
})
