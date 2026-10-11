import { readFileSync } from 'node:fs'
import { expectFixtureMetric } from '../test-utils'

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
  const results = Array.from({ length: 100 }, (_, index) => ({ timestamp: new Date(start - index * 60_000).toISOString(), success: true, duration: 1_000_000 }))
  await expectFixtureMetric(
    new URL('./uptime.yml', import.meta.url),
    { results },
    {
      observations: [...results].reverse().map((result) => ({ timestamp: Date.parse(result.timestamp), status: 'up' as const, responseTimeMs: 1 })),
      nextPage: 2
    }
  )
})
