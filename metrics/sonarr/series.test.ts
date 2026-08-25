import { readFileSync } from 'node:fs'
import { expectFixtureMetric } from '../test-utils'

it('extracts series count', async () => {
  await expectFixtureMetric(new URL('./series.yml', import.meta.url), JSON.parse(readFileSync(new URL('./series.fixture.json', import.meta.url), 'utf8')), 3)
})
