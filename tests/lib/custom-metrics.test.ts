import { afterEach, describe, expect, it, vi } from 'vitest'
import { collectCustomMetric } from '@/lib/custom-metrics'
import type { MetricOverride } from '@/lib/config-file'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

function metric(extractor: Pick<MetricOverride, 'json'> | Pick<MetricOverride, 'prometheus'>): MetricOverride {
  return { label: 'Test metric', unit: 'number', source: { url: 'https://metrics.example.test/data' }, ...extractor } as MetricOverride
}

function response(text: string): Response {
  return new Response(text, { status: 200 })
}

describe('collectCustomMetric', () => {
  it('extracts a scalar JSON value and reduces values from an array', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(response('{"stats":{"value":12.5}}'))
      .mockResolvedValueOnce(response('{"items":[{"value":2},{"value":3}]}'))

    await expect(collectCustomMetric('scalar', metric({ json: { path: '/stats/value' } }))).resolves.toEqual({ value: 12.5 })
    await expect(collectCustomMetric('sum', metric({ json: { path: '/items', valuePath: '/value', reduce: 'sum' } }))).resolves.toEqual({ value: 5 })
  })

  it('reports an unavailable metric when an array requires a reduction', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(response('{"items":[1,2]}'))

    await expect(collectCustomMetric('items', metric({ json: { path: '/items' } }))).resolves.toMatchObject({ error: 'JSON extraction did not produce the required numeric values' })
  })

  it('parses Prometheus samples, labels, comments, and reductions', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(response(`# HELP queue_depth Current queue depth
queue_depth{queue="primary",instance="one"} 2
queue_depth{queue="secondary"} 9
queue_depth{queue="primary",instance="two"} 4 1710000000
`))

    await expect(collectCustomMetric('queue', metric({
      prometheus: { name: 'queue_depth', labels: { queue: 'primary' }, reduce: 'average' }
    }))).resolves.toEqual({ value: 3 })
  })

  it('extracts text values without coercing them to numeric samples', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(response('{"status":"healthy"}'))
      .mockResolvedValueOnce(response('build_info{version="1.2.3"} 1\n'))

    await expect(collectCustomMetric('status', {
      label: 'Status', valueType: 'string', source: { url: 'https://metrics.example.test/status' }, json: { path: '/status' }
    })).resolves.toEqual({ value: 'healthy' })
    await expect(collectCustomMetric('version', {
      label: 'Version', valueType: 'string', source: { url: 'https://metrics.example.test/metrics' }, prometheus: { name: 'build_info', valueLabel: 'version' }
    })).resolves.toEqual({ value: '1.2.3' })
  })
})
