import { readFileSync } from 'node:fs'
import { expectFixtureMetric } from '../test-utils'

it('extracts active memory bytes from activity text', async () => {
  await expectFixtureMetric(new URL('./memory.yml', import.meta.url), JSON.parse(readFileSync(new URL('./activity.fixture.json', import.meta.url), 'utf8')), 128974848)
})
