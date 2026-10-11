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
  const hasCurrentObservation = !includeCurrentBucket && observations.some((observation) => observation.timestamp >= currentBucketStart && observation.timestamp <= now)
  const end = includeCurrentBucket || hasCurrentObservation ? currentBucketStart + bucketMs : currentBucketStart
  const start = end - durationMs
  const buckets: UptimeBucket[] = Array.from({ length: bucketCount }, (_, index) => {
    const bucketStart = start + index * bucketMs
    const bucketEnd = bucketStart + bucketMs
    return {
      start: bucketStart,
      end: bucketEnd,
      status: 'unknown',
      successes: 0,
      failures: 0
    }
  })
  for (const observation of observations) {
    if (observation.timestamp < start || observation.timestamp >= end) continue
    const bucket = buckets[Math.floor((observation.timestamp - start) / bucketMs)]
    if (!bucket) continue
    if (observation.status === 'up') bucket.successes++
    if (observation.status === 'down') bucket.failures++
    if (observation.responseTimeMs !== undefined) bucket.slowestResponseTimeMs = Math.max(bucket.slowestResponseTimeMs ?? observation.responseTimeMs, observation.responseTimeMs)
  }
  for (const bucket of buckets) bucket.status = bucket.failures > 0 && bucket.successes > 0 ? 'mixed' : bucket.failures > 0 ? 'down' : bucket.successes > 0 ? 'up' : 'unknown'
  return buckets
}
