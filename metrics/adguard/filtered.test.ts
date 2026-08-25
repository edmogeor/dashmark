import { readFileSync } from 'node:fs'
import { expectFixtureMetric } from '../test-utils'

it('extracts safe browsing, search, and parental filtering', async () => {
  await expectFixtureMetric(new URL('./filtered.yml', import.meta.url), JSON.parse(readFileSync(new URL('./stats.fixture.json', import.meta.url), 'utf8')), 35)
})
