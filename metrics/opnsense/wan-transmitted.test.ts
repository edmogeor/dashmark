import { readFileSync } from 'node:fs'
import { expectFixtureMetric } from '../test-utils'

it('extracts WAN transmitted bytes', async () => {
  await expectFixtureMetric(new URL('./wan-transmitted.yml', import.meta.url), JSON.parse(readFileSync(new URL('./interface.fixture.json', import.meta.url), 'utf8')), 1234)
})
