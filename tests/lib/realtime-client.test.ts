import { describe, expect, it } from 'vitest'
import { RealtimeClient, type RealtimeMetricsResponse } from '@/lib/realtime-client'

function dispatch(client: RealtimeClient, message: unknown): void {
  ;(client as unknown as { handleMessage(event: MessageEvent): void }).handleMessage({ data: JSON.stringify(message) } as MessageEvent)
}

describe('realtime metrics', () => {
  it('retains bucket summaries through metric deltas and applies bucket deltas', () => {
    const client = new RealtimeClient()
    const received: RealtimeMetricsResponse[] = []
    const listeners = new Map([['card-1', new Set([(metrics: RealtimeMetricsResponse) => received.push(metrics)])]])
    ;(client as unknown as { metricListeners: Map<string, Set<(metrics: RealtimeMetricsResponse) => void>> }).metricListeners = listeners

    dispatch(client, {
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
    dispatch(client, {
      type: 'metrics_delta',
      version: 2,
      cardId: 'card-1',
      metrics: { resource: null, customMetrics: [], metricErrors: [], pending: false }
    })
    dispatch(client, {
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
  })
})
