import { readFileSync } from 'node:fs'
import { expectFixtureMetric } from '../test-utils'

it('extracts queued movies', async () => {
  await expectFixtureMetric(new URL('./queue.yml', import.meta.url), JSON.parse(readFileSync(new URL('./queue.fixture.json', import.meta.url), 'utf8')), 3)
})
