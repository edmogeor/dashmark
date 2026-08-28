import type { UptimeMetric, UptimeObservation, UptimeStatus } from '@/lib/status'

const HOUR_MS = 60 * 60 * 1_000
const HISTORY_HOURS = 90 * 24

function observationMetric(now: number): UptimeMetric {
  const currentHour = Math.floor(now / HOUR_MS) * HOUR_MS
  const observations: UptimeObservation[] = []
  for (let hour = 0; hour < HISTORY_HOURS; hour++) {
    const timestamp = currentHour - (HISTORY_HOURS - 1 - hour) * HOUR_MS
    if (hour % 197 === 0) continue
    const status: UptimeStatus = hour % 113 === 0 ? 'down' : 'up'
    observations.push({ timestamp, status, responseTimeMs: 80 + ((hour * 17) % 240) })
  }

  // Ensure the compact 24-hour view demonstrates each heartbeat state.
  observations.push({ timestamp: currentHour - 4 * HOUR_MS, status: 'down', responseTimeMs: 1_940 }, { timestamp: currentHour - 8 * HOUR_MS, status: 'down', responseTimeMs: 1_210 })
  return { key: 'gatus/uptime', label: 'Uptime', current: 'up', observations }
}

export function demoUptimeMetrics(cardId: string, now: number): UptimeMetric[] {
  if (cardId === 'plex' || cardId.endsWith(':plex123')) return [observationMetric(now)]
  return []
}
