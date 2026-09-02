import { expect } from 'vitest'
import { collectCustomMetric } from '@/lib/custom-metrics'
import { loadDefinition, parameterValues, sourceFor } from './fixture-loader'
import { loadMetric } from './test-metric'
import { startMetricTestServer } from './test-server'

export async function expectFixtureMetric(definitionUrl: URL, fixture: unknown, expected: number | string): Promise<void> {
  const [definition, provider] = loadDefinition(definitionUrl)
  const source = sourceFor(definition, provider)
  const parameters = parameterValues(definition)
  const server = await startMetricTestServer({ definition, source, parameters, fixture })
  try {
    await expect(collectCustomMetric(definitionUrl.pathname, loadMetric(definitionUrl, server.baseUrl))).resolves.toEqual({ value: expected })
  } finally {
    await server.close()
  }
}
