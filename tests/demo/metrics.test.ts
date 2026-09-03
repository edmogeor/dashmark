import { describe, expect, it } from 'vitest'
import { METRICS_HISTORY_PERIOD_MS } from '@/lib/constants'
import { demoMetricsSnapshot } from '@/demo/metrics'

describe('demoMetricsSnapshot', () => {
  it('creates a rolling history that ends with the current resource sample', () => {
    const now = 1_700_000_000_000
    const metrics = demoMetricsSnapshot('plex', { cpuPercent: 20, memoryUsage: 1_024, memoryLimit: 2_048, receivedBytesPerSecond: 100, sentBytesPerSecond: 20 }, now)

    expect(metrics.history).toHaveLength(31)
    expect(metrics.history[0]?.timestamp).toBe(now - METRICS_HISTORY_PERIOD_MS)
    expect(metrics.history.at(-1)).toEqual({ timestamp: now, ...metrics.resource })
    expect(metrics.history.every((sample) => sample.cpuPercent && sample.memoryUsage && sample.receivedBytesPerSecond && sample.sentBytesPerSecond)).toBe(true)
  })
})
