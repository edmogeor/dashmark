import { expectFixtureMetric } from '../test-utils'

it('sums Prowlarr grabs', async () => {
  await expectFixtureMetric(new URL('./grabs.yml', import.meta.url), { indexers: [{ numberOfGrabs: 3 }, { numberOfGrabs: 5 }] }, 8)
})
