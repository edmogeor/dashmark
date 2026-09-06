import { expect } from 'vitest'
import { collectCustomMetric } from '@/lib/custom-metrics'
import { loadDefinition, parameterValues, sourceFor } from './fixture-loader'
import { loadMetric } from './test-metric'
import { startMetricTestServer } from './test-server'
import type { MetricResult } from '@/lib/custom-metrics'

export async function expectFixtureMetric(definitionUrl: URL, fixture: unknown, expected: MetricResult | number | string): Promise<void> {
  const [definition, provider] = loadDefinition(definitionUrl)
  const source = sourceFor(definition, provider)
  const parameters = parameterValues(definition)
  const server = await startMetricTestServer({ definition, source, parameters, fixture })
  try {
    await expect(collectCustomMetric(definitionUrl.pathname, loadMetric(definitionUrl, server.baseUrl))).resolves.toEqual(
      typeof expected === 'number' || typeof expected === 'string' ? { value: expected } : expected
    )
  } finally {
    await server.close()
  }
}
