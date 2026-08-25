import path from 'node:path'

process.env.DASHMARK_METRICS_DIR = path.resolve(import.meta.dirname, '../fixtures/metrics')
