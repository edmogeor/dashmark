import { METRICS_HISTORY_PERIOD_MS } from '@/lib/constants'
import type { ContainerResources, ResourceMetricSample } from '@/lib/status'

const DEMO_METRICS_INTERVAL_MS = 10_000

function seedFor(cardId: string): number {
  return [...cardId].reduce((seed, character) => (seed * 31 + character.charCodeAt(0)) >>> 0, 0)
}

function fluctuate(value: number | undefined, phase: number, amplitude: number, minimum = 0): number | undefined {
  if (value === undefined) return undefined
  return Math.max(minimum, value * (1 + Math.sin(phase) * amplitude))
}

function resourceAt(cardId: string, baseline: ContainerResources, timestamp: number): ContainerResources {
  const phase = timestamp / 60_000 + seedFor(cardId)
  return {
    cpuPercent: fluctuate(baseline.cpuPercent, phase, 0.3, 0.1),
    memoryUsage: fluctuate(baseline.memoryUsage, phase * 0.7, 0.08),
    memoryLimit: baseline.memoryLimit,
    receivedBytesPerSecond: fluctuate(baseline.receivedBytesPerSecond, phase * 1.4, 0.45),
    sentBytesPerSecond: fluctuate(baseline.sentBytesPerSecond, phase * 1.1, 0.4)
  }
}

export function demoMetricsSnapshot(cardId: string, baseline: ContainerResources, now = Date.now()): { resource: ContainerResources; history: ResourceMetricSample[] } {
  const start = now - METRICS_HISTORY_PERIOD_MS
  const history = Array.from({ length: METRICS_HISTORY_PERIOD_MS / DEMO_METRICS_INTERVAL_MS + 1 }, (_, index) => {
    const timestamp = start + index * DEMO_METRICS_INTERVAL_MS
    return { timestamp, ...resourceAt(cardId, baseline, timestamp) }
  })
  return { resource: resourceAt(cardId, baseline, now), history }
}
