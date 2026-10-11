import path from 'node:path'
import { afterEach } from 'vitest'
import { clearMetricsStorage } from '@/lib/metrics-storage'

process.env.DASHMARK_METRICS_DIR = path.resolve(import.meta.dirname, '../fixtures/metrics')
process.env.METRICS_DATABASE_PATH = ':memory:'

afterEach(() => clearMetricsStorage())
