import { readFileSync } from 'node:fs'
import { expectFixtureMetric } from '../test-utils'

it('extracts song count', async () => {
  await expectFixtureMetric(new URL('./songs.yml', import.meta.url), JSON.parse(readFileSync(new URL('./counts.fixture.json', import.meta.url), 'utf8')), 184)
})
