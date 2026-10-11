import { readFileSync } from 'node:fs'
import { expectFixtureMetric } from '../test-utils'
import { loadMetric } from '../test-metric'
import { startMetricTestServer } from '../test-server'
import { clearBulkHistoryCache, collectBulkHistory } from '@/lib/bulk-metric-history'

it('extracts statuses from the current Gatus response', async () => {
  await expectFixtureMetric(new URL('./uptime.yml', import.meta.url), JSON.parse(readFileSync(new URL('./uptime.fixture.json', import.meta.url), 'utf8')), {
    observations: [
      { timestamp: Date.parse('2026-09-06T20:02:16.371481662Z'), status: 'up', responseTimeMs: 40.54184 },
      { timestamp: Date.parse('2026-09-06T20:07:16.371481662Z'), status: 'down', responseTimeMs: 90 }
    ]
  })
})

it('returns one bounded page with a recovery checkpoint instead of fetching all Gatus history', async () => {
  const start = Date.parse('2026-10-11T12:00:00Z')
  const results = Array.from({ length: 500 }, (_, index) => ({ timestamp: new Date(start - index * 60_000).toISOString(), success: true, duration: 1_000_000 }))
  await expectFixtureMetric(
    new URL('./uptime.yml', import.meta.url),
    { results },
    {
      observations: [...results].reverse().map((result) => ({ timestamp: Date.parse(result.timestamp), status: 'up' as const, responseTimeMs: 1 })),
      nextPage: 2
    }
  )
})

it('maps shared Gatus histories to transformed endpoint inputs without provider-specific collector code', async () => {
  const definition = new URL('./uptime.yml', import.meta.url)
  const options = { inputs: { group: 'Media Servers', name: 'Plex / Main' } }
  const result = { timestamp: '2026-10-11T12:00:00Z', success: false, duration: 12000000 }
  const server = await startMetricTestServer({
    metric: loadMetric(definition, 'http://metrics.test', options),
    fixture: { results: [] },
    responses: {
      '/api/v1/endpoints/statuses': {
        body: [
          { key: 'media-servers_plex---main', results: [result] },
          { key: 'other', results: [] }
        ]
      }
    },
    onRequest: (request) => {
      const url = new URL(request.url!, 'http://metrics.test')
      expect(url.searchParams.get('pageSize')).toBe('500')
      expect(url.searchParams.get('page')).toBe('2')
    }
  })
  try {
    const metric = loadMetric(definition, server.baseUrl, options)
    if (metric.valueType !== 'uptime') throw new Error('Expected uptime metric')
    expect(metric.pagination?.bulk?.key).toBe('media-servers_plex---main')
    expect(await collectBulkHistory(metric, 2)).toEqual({ observations: [{ timestamp: Date.parse(result.timestamp), status: 'down', responseTimeMs: 12 }] })
  } finally {
    clearBulkHistoryCache()
    await server.close()
  }
})
