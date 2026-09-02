// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RealtimeClient, type RealtimeMetricsResponse } from '@/lib/realtime-client'

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
})
