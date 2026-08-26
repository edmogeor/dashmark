import { expectFixtureMetric } from '../test-utils'

it('sums failed Prowlarr grabs', async () => {
  await expectFixtureMetric(new URL('./failed-grabs.yml', import.meta.url), { indexers: [{ numberOfFailedGrabs: 1 }, { numberOfFailedGrabs: 2 }] }, 3)
})
