export const UPTIME_RANGES = [
  { range: '24h', durationMs: 24 * 60 * 60 * 1_000, bucketCount: 24 },
  { range: '7d', durationMs: 7 * 24 * 60 * 60 * 1_000, bucketCount: 21 },
  { range: '30d', durationMs: 30 * 24 * 60 * 60 * 1_000, bucketCount: 30 }
] as const

export type UptimeRange = (typeof UPTIME_RANGES)[number]['range']
