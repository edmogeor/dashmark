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
