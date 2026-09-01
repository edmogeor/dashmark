import { describe, expect, it } from 'vitest'
import { uptimeBuckets, uptimeBucketsForDuration } from '@/components/UptimeHeartbeat'

describe('uptimeBuckets', () => {
  const hour = 60 * 60 * 1_000
  const now = Date.parse('2026-08-27T22:05:00Z')

  it('does not add the current hour until it contains an observation', () => {
    const buckets = uptimeBuckets([{ timestamp: now - hour, status: 'up' }], 24 * hour, 24, now)

    expect(buckets.at(-1)).toMatchObject({ start: Date.parse('2026-08-27T21:00:00Z'), status: 'up' })
  })

  it('includes the current hour after an observation arrives', () => {
    const buckets = uptimeBuckets([{ timestamp: now - 60_000, status: 'up' }], 24 * hour, 24, now)

    expect(buckets.at(-1)).toMatchObject({ start: Date.parse('2026-08-27T22:00:00Z'), status: 'up' })
  })

  it('selects complete server summary buckets for a display range', () => {
    const buckets = [
      { start: now - 30 * hour, end: now - 24 * hour, status: 'up' as const, successes: 4, failures: 0 },
      { start: now - 24 * hour, end: now - 18 * hour, status: 'down' as const, successes: 0, failures: 2 },
      { start: now - 6 * hour, end: now, status: 'up' as const, successes: 3, failures: 0 }
    ]

    expect(uptimeBucketsForDuration(buckets, 24 * hour, now)).toEqual(buckets.slice(1))
  })
})
