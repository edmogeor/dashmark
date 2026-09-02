import { describe, expect, it } from 'vitest'
import { aggregateUptimeBuckets } from '@/lib/uptime-buckets'

describe('aggregateUptimeBuckets', () => {
  const hour = 60 * 60 * 1_000
  const now = Date.parse('2026-08-27T22:05:00Z')

  it('aggregates mixed, unknown, and response-time buckets', () => {
    const buckets = aggregateUptimeBuckets(
      [
        { timestamp: Date.parse('2026-08-27T20:10:00Z'), status: 'up', responseTimeMs: 80 },
        { timestamp: Date.parse('2026-08-27T20:20:00Z'), status: 'down', responseTimeMs: 250 }
      ],
      3 * hour,
      3,
      { includeCurrentBucket: true, now }
    )

    expect(buckets).toEqual([
      { start: Date.parse('2026-08-27T20:00:00Z'), end: Date.parse('2026-08-27T21:00:00Z'), status: 'mixed', successes: 1, failures: 1, slowestResponseTimeMs: 250 },
      { start: Date.parse('2026-08-27T21:00:00Z'), end: Date.parse('2026-08-27T22:00:00Z'), status: 'unknown', successes: 0, failures: 0 },
      { start: Date.parse('2026-08-27T22:00:00Z'), end: Date.parse('2026-08-27T23:00:00Z'), status: 'unknown', successes: 0, failures: 0 }
    ])
  })

  it('omits an empty current bucket for display', () => {
    const buckets = aggregateUptimeBuckets([{ timestamp: now - hour, status: 'up' }], 3 * hour, 3, { includeCurrentBucket: false, now })

    expect(buckets.at(-1)).toMatchObject({ start: Date.parse('2026-08-27T21:00:00Z'), status: 'up' })
  })

  it('includes the current display bucket after an observation arrives', () => {
    const buckets = aggregateUptimeBuckets([{ timestamp: now - 60_000, status: 'up' }], 3 * hour, 3, { includeCurrentBucket: false, now })

    expect(buckets.at(-1)).toMatchObject({ start: Date.parse('2026-08-27T22:00:00Z'), status: 'up' })
  })

  it('includes an empty current bucket for realtime snapshots', () => {
    const buckets = aggregateUptimeBuckets([{ timestamp: now - hour, status: 'up' }], 3 * hour, 3, { includeCurrentBucket: true, now })

    expect(buckets.at(-1)).toMatchObject({ start: Date.parse('2026-08-27T22:00:00Z'), status: 'unknown' })
  })
})
