import { readFileSync } from 'node:fs'
import { expectFixtureMetric } from '../test-utils'

it('extracts movies with files', async () => {
  await expectFixtureMetric(new URL('./have.yml', import.meta.url), JSON.parse(readFileSync(new URL('./movies.fixture.json', import.meta.url), 'utf8')), 1)
})
