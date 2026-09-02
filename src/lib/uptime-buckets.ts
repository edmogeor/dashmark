import type { UptimeObservation, UptimeStatus } from './status'

export type UptimeBucket = {
  start: number
  end: number
  status: UptimeStatus | 'mixed'
  successes: number
  failures: number
  slowestResponseTimeMs?: number
}

export function aggregateUptimeBuckets(
  observations: UptimeObservation[],
  durationMs: number,
  bucketCount: number,
  { includeCurrentBucket, now = Date.now() }: { includeCurrentBucket: boolean; now?: number }
): UptimeBucket[] {
  const bucketMs = durationMs / bucketCount
  const currentBucketStart = Math.floor(now / bucketMs) * bucketMs
  const hasCurrentObservation = observations.some((observation) => observation.timestamp >= currentBucketStart && observation.timestamp <= now)
  const end = includeCurrentBucket || hasCurrentObservation ? currentBucketStart + bucketMs : currentBucketStart
  const start = end - durationMs
  return Array.from({ length: bucketCount }, (_, index) => {
    const bucketStart = start + index * bucketMs
    const bucketEnd = bucketStart + bucketMs
    const entries = observations.filter((entry) => entry.timestamp >= bucketStart && entry.timestamp < bucketEnd)
    const successes = entries.filter((entry) => entry.status === 'up').length
    const failures = entries.filter((entry) => entry.status === 'down').length
    const responseTimes = entries.flatMap((entry) => (entry.responseTimeMs === undefined ? [] : [entry.responseTimeMs]))
    return {
      start: bucketStart,
      end: bucketEnd,
      status: failures > 0 && successes > 0 ? 'mixed' : failures > 0 ? 'down' : successes > 0 ? 'up' : 'unknown',
      successes,
      failures,
      ...(responseTimes.length > 0 ? { slowestResponseTimeMs: Math.max(...responseTimes) } : {})
    }
  })
}
