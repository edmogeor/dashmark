import { readFileSync } from 'node:fs'
import { expectFixtureMetric } from '../test-utils'

it('extracts active streams', async () => {
  await expectFixtureMetric(new URL('./active_streams.yml', import.meta.url), JSON.parse(readFileSync(new URL('./sessions.fixture.json', import.meta.url), 'utf8')), 2)
})
