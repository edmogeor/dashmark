import { describe, expect, it } from 'vitest'
import { formatAxisBytes, formatAxisPercent, formatBytes, formatCustomMetric, formatDetailedBytes, formatDetailedPercent } from '@/components/app-card-metrics'

describe('metric formatting', () => {
  it('uses three significant digits for cards and axes', () => {
    expect(formatBytes(12.49 * 1_024 * 1_024)).toBe('12.5MB')
    expect(formatAxisBytes(12.49 * 1_024 * 1_024)).toBe('12.5MB')
    expect(formatAxisPercent(12.49)).toBe('12.5%')
    expect(formatCustomMetric(0.12345, 'seconds')).toBe('0.123s')
    expect(formatCustomMetric(1_024 * 1_024, 'bits')).toBe('1Mb')
    expect(formatCustomMetric(1_024 * 1_024, 'bits_per_second')).toBe('1Mb/s')
    expect(formatCustomMetric(1_024 * 1_024, 'bytes_per_second')).toBe('1MB/s')
  })

  it('uses four significant digits for chart details', () => {
    expect(formatDetailedBytes(12.49 * 1_024 * 1_024)).toBe('12.49MB')
    expect(formatDetailedPercent(12.49)).toBe('12.49%')
  })
})
