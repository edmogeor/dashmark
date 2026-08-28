import type { ResourceMetricSample } from '@/lib/status'

export function demoResourceUsage(cardId: string, timestamp: number): ResourceMetricSample {
  const phase = [...cardId].reduce((total, character) => total + character.charCodeAt(0), 0) / 20
  const seconds = timestamp / 1_000
  return {
    timestamp,
    cpuPercent: 18 + Math.sin(seconds / 7 + phase) * 12 + Math.sin(seconds / 2 + phase) * 3,
    memoryUsage: (850 + Math.sin(seconds / 18 + phase) * 120) * 1_024 * 1_024,
    memoryLimit: 2 * 1_024 * 1_024 * 1_024,
    receivedBytesPerSecond: (1_200 + Math.sin(seconds / 5 + phase) * 450) * 1_024,
    sentBytesPerSecond: (320 + Math.sin(seconds / 8 + phase) * 180) * 1_024
  }
}
