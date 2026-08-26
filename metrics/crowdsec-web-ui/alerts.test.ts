import { expectFixtureMetric } from '../test-utils'

it('counts CrowdSec alerts', async () => {
  await expectFixtureMetric(new URL('./alerts.yml', import.meta.url), [{ id: 1 }, { id: 2 }], 2)
})
