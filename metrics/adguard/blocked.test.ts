import { readFileSync } from 'node:fs'
import { expectFixtureMetric } from '../test-utils'

it('extracts blocked queries', async () => {
  await expectFixtureMetric(new URL('./blocked.yml', import.meta.url), JSON.parse(readFileSync(new URL('./stats.fixture.json', import.meta.url), 'utf8')), 300)
})
