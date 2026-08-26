import { expectFixtureMetric } from '../test-utils'

it('counts active CrowdSec decisions', async () => {
  await expectFixtureMetric(new URL('./decisions.yml', import.meta.url), [{ id: 1 }, { id: 2 }, { id: 3 }], 3)
})
