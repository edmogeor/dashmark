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
      }
    })).toBe(true)
  })

  it('rejects malformed status and error payloads', () => {
    expect(isStatusResponse({ statuses: { plex: { state: 42 } } })).toBe(false)
    expect(isStatusResponse({ error: { code: 'UNKNOWN', message: 'Nope', retryable: false } })).toBe(false)
  })
})
