import { readFileSync } from 'node:fs'
import { expectFixtureMetric } from '../test-utils'

it('extracts available wanted movies', async () => {
  await expectFixtureMetric(new URL('./wanted.yml', import.meta.url), JSON.parse(readFileSync(new URL('./movies.fixture.json', import.meta.url), 'utf8')), 1)
})
