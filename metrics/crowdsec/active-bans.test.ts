import { expectFixtureMetric } from '../test-utils'

it('counts active CrowdSec bans', async () => {
  await expectFixtureMetric(new URL('./active-bans.yml', import.meta.url), [{}, {}], 2)
})
