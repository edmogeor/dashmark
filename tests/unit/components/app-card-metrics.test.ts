import { describe, expect, it } from 'vitest'
import { formatBytes, formatCustomMetric, formatDetailedBytes, formatDetailedPercent, formatPercent } from '@/components/app-card-metric-formatters'

describe('metric formatting', () => {
  it('uses three significant digits for card values', () => {
    expect(formatBytes(12.49 * 1_024 * 1_024)).toBe('12.5MB')
    expect(formatPercent(12.49)).toBe('12.5%')
    expect(formatCustomMetric(0.12345, 'seconds')).toBe('0.123s')
    expect(formatCustomMetric(1_024 * 1_024, 'bits')).toBe('1Mb')
    expect(formatCustomMetric(1_024 * 1_024, 'bits_per_second')).toBe('1Mb/s')
    expect(formatCustomMetric(1_024 * 1_024, 'bytes_per_second')).toBe('1MB/s')
  })

  it('uses four significant digits for chart details', () => {
    expect(formatDetailedBytes(12.49 * 1_024 * 1_024)).toBe('12.49MB')
    expect(formatDetailedPercent(12.49)).toBe('12.49%')
  })

  it.each([
    [0, '0ms'],
    [0.5, '500ms'],
    [1, '1s'],
    [59, '59s'],
    [60, '1m'],
    [3_599, '60m'],
    [3_600, '1h']
  ])('formats duration %s at the appropriate scale', (value, expected) => {
    expect(formatCustomMetric(value, 'duration')).toBe(expected)
  })
})
