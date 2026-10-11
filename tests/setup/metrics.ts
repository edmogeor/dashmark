import path from 'node:path'
import { afterEach } from 'vitest'

process.env.DASHMARK_METRICS_DIR = path.resolve(import.meta.dirname, '../fixtures/metrics')
process.env.METRICS_DATABASE_PATH = ':memory:'

afterEach(async () => {
  if (typeof window !== 'undefined') return
  const { clearMetricsStorage } = await import('@/lib/metrics-storage')
  clearMetricsStorage()
})
