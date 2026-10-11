import { expect } from 'vitest'
import { collectCustomMetric } from '@/lib/custom-metrics'
import { loadMetric, type TestMetricOptions } from './test-metric'
import { startMetricTestServer, type FixtureServerOptions } from './test-server'
import type { MetricResult } from '@/lib/custom-metrics'

export async function expectFixtureMetric(definitionUrl: URL, fixture: unknown, expected: MetricResult | number | string, options: TestMetricOptions & FixtureServerOptions = {}): Promise<void> {
  const metric = loadMetric(definitionUrl, 'http://metrics.test', options)
  const server = await startMetricTestServer({ metric, fixture, ...options })
  try {
    await expect(collectCustomMetric(definitionUrl.pathname, loadMetric(definitionUrl, server.baseUrl, options))).resolves.toEqual(
      typeof expected === 'number' || typeof expected === 'string' ? { value: expected } : expected
    )
  } finally {
    await server.close()
  }
}
