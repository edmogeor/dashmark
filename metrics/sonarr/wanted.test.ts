import { readFileSync } from 'node:fs'
import { expectFixtureMetric } from '../test-utils'

it('extracts wanted episodes', async () => {
  await expectFixtureMetric(new URL('./wanted.yml', import.meta.url), JSON.parse(readFileSync(new URL('./wanted.fixture.json', import.meta.url), 'utf8')), 7)
})
