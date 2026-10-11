import { describe, expect, it } from 'vitest'
import { customMetricDetail, networkMetricDetail, resourceMetricDetail } from '@/components/app-card-metric-details'
import type { NumericCustomMetric } from '@/lib/status'

const history = [{ timestamp: 1, cpuPercent: 25, memoryUsage: 512, receivedBytesPerSecond: 20, sentBytesPerSecond: 10 }]

describe('app card metric details', () => {
  it('models memory as bytes without a limit and percentages with one', () => {
    const unlimited = resourceMetricDetail('Memory', history, 60_000, 'memory', {}, 'en-US')
    const limited = resourceMetricDetail('Memory', history, 60_000, 'memory', { memoryLimit: 1_024 }, 'en-US')

    expect(unlimited.series[0]!.value(unlimited.history[0]!)).toBe(512)
    expect(unlimited.formatValue(512)).toBe('512B')
    expect(unlimited.formatTooltipValue).toBeUndefined()
    expect(limited.series[0]!.value(limited.history[0]!)).toBe(50)
    expect(limited.formatValue(50)).toBe('50%')
    expect(limited.formatTooltipValue?.(50)).toBe('512B (50%)')
  })

  it('models received and sent network series', () => {
    const detail = networkMetricDetail(history, 60_000, 'Network', 'Received', 'Sent', 'en-US')

    expect(detail.series.map(({ key, label, value }) => ({ key, label, value: value(detail.history[0]!) }))).toEqual([
      { key: 'received', label: 'Received', value: 20 },
      { key: 'sent', label: 'Sent', value: 10 }
    ])
  })

  it('groups custom metrics with the selected metric', () => {
    const read = { key: 'read', label: 'Read', unit: 'bytes' as const, chart: 'line' as const, chartGroup: 'disk', value: 5, history: [{ timestamp: 1, value: 5 }], historyPeriodMs: 60_000 }
    const write = { key: 'write', label: 'Write', unit: 'bytes' as const, chart: 'line' as const, chartGroup: 'disk', value: 7, history: [{ timestamp: 1, value: 7 }], historyPeriodMs: 60_000 }
    const detail = customMetricDetail(read, [read, write], 'en-US')

    expect(detail.customMetricKeys).toEqual(['read', 'write'])
    expect(detail.history).toEqual([{ timestamp: 1, read: 5, write: 7 }])
  })

  it('uses a step chart when a custom metric disables charts', () => {
    const metric: NumericCustomMetric = { key: 'requests', label: 'Requests', unit: 'count', chart: 'none', value: 3, history: [], historyPeriodMs: 60_000 }

    expect(customMetricDetail(metric, [metric], 'en-US').chart).toBe('step')
  })

  it('uses the selected locale for detail formatters', () => {
    const detail = resourceMetricDetail('Memory', history, 60_000, 'memory', {}, 'de')

    expect(detail.formatValue(1_536)).toBe('1,5 kB')
    expect(detail.formatAxisValue?.(1_536)).toBe('1,5 kB')
  })
})
