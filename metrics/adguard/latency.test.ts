import { readFileSync } from 'node:fs'
import { expectFixtureMetric } from '../test-utils'

it('extracts latency in milliseconds', async () => {
  await expectFixtureMetric(new URL('./latency.yml', import.meta.url), JSON.parse(readFileSync(new URL('./stats.fixture.json', import.meta.url), 'utf8')), 12)
})
