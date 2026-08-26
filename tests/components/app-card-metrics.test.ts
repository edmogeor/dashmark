import { describe, expect, it } from 'vitest'
import {
  formatAxisBytes,
  formatAxisPercent,
  formatBytes,
  formatCustomMetric,
  formatDetailedBytes,
  formatDetailedPercent,
} from '@/components/app-card-metrics'

describe('metric formatting', () => {
  it('uses three significant digits for cards and axes', () => {
    expect(formatBytes(12.49 * 1_024 * 1_024)).toBe('12.5 MB')
    expect(formatAxisBytes(12.49 * 1_024 * 1_024)).toBe('12.5 MB')
    expect(formatAxisPercent(12.49)).toBe('12.5%')
    expect(formatCustomMetric(0.12345, 'seconds')).toBe('0.123s')
  })

  it('uses four significant digits for chart details', () => {
    expect(formatDetailedBytes(12.49 * 1_024 * 1_024)).toBe('12.49 MB')
    expect(formatDetailedPercent(12.49)).toBe('12.49%')
  })
})
