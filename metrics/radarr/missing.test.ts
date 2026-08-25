import { readFileSync } from 'node:fs'
import { expectFixtureMetric } from '../test-utils'

it('extracts monitored missing movies', async () => {
  await expectFixtureMetric(new URL('./missing.yml', import.meta.url), JSON.parse(readFileSync(new URL('./movies.fixture.json', import.meta.url), 'utf8')), 2)
})
