import { describe, expect, it } from 'vitest'
import { isStatusResponse } from '@/lib/status'

describe('isStatusResponse', () => {
  it('accepts a valid statuses payload', () => {
    expect(isStatusResponse({
      statuses: { plex: { state: 'running', health: 'healthy' } }
    })).toBe(true)
  })

  it('rejects malformed status and error payloads', () => {
    expect(isStatusResponse({ statuses: { plex: { state: 42 } } })).toBe(false)
    expect(isStatusResponse({ error: { code: 'UNKNOWN', message: 'Nope', retryable: false } })).toBe(false)
  })
})
