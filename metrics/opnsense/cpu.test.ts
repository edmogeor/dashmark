import { readFileSync } from 'node:fs'
import { expectFixtureMetric } from '../test-utils'

it('derives CPU use from idle CPU text', async () => {
  await expectFixtureMetric(new URL('./cpu.yml', import.meta.url), JSON.parse(readFileSync(new URL('./activity.fixture.json', import.meta.url), 'utf8')), 25)
})
