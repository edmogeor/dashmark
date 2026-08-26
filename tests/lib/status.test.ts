import { describe, expect, it } from 'vitest'
import { isResourceUsageResponse, isStatusResponse } from '@/lib/status'

describe('isStatusResponse', () => {
  it('accepts a valid statuses payload', () => {
    expect(isStatusResponse({
      statuses: { plex: { state: 'running', health: 'healthy' } }
    })).toBe(true)
  })

  it('rejects resource usage metrics', () => {
    expect(isStatusResponse({ statuses: { plex: { cpuPercent: 20 } } })).toBe(false)
  })

  it('accepts a resource usage payload', () => {
    expect(isResourceUsageResponse({
      resource: {
        cpuPercent: 20,
        memoryUsage: 1_024,
        memoryLimit: 2_048,
        receivedBytesPerSecond: 512,
        sentBytesPerSecond: 256
      },
      pending: true,
      customMetrics: [],
      metricErrors: []
    })).toBe(true)
  })

  it('rejects malformed status and error payloads', () => {
    expect(isStatusResponse({ statuses: { plex: { state: 42 } } })).toBe(false)
    expect(isStatusResponse({ error: { code: 'UNKNOWN', message: 'Nope', retryable: false } })).toBe(false)
  })

  it('accepts numeric and text custom metrics', () => {
    expect(isResourceUsageResponse({
      resource: null,
      customMetrics: [
        { key: 'rpm', label: 'RPM', unit: { suffix: 'rpm' }, chart: 'none', value: 900, history: [], historyPeriodMs: 60_000 },
        { key: 'read', label: 'Read', unit: 'bytes_per_second', chart: 'line', chartGroup: 'disk_io', value: 0, pending: true, history: [], historyPeriodMs: 60_000 },
        { key: 'version', label: 'Version', value: '1.2.3' },
        { key: 'state', label: 'State', value: 'Healthy', color: 'success' }
      ],
      metricErrors: [{ key: 'failed', message: 'Metric is unavailable' }]
    })).toBe(true)
  })
})
