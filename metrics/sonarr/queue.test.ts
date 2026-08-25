import { readFileSync } from 'node:fs'
import { expectFixtureMetric } from '../test-utils'

it('extracts queued episodes', async () => {
  await expectFixtureMetric(new URL('./queue.yml', import.meta.url), JSON.parse(readFileSync(new URL('./queue.fixture.json', import.meta.url), 'utf8')), 4)
})
