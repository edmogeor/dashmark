import { readFileSync } from 'node:fs'
import { expectFixtureMetric } from '../test-utils'

it('extracts DNS queries', async () => {
  await expectFixtureMetric(new URL('./queries.yml', import.meta.url), JSON.parse(readFileSync(new URL('./stats.fixture.json', import.meta.url), 'utf8')), 1200)
})
