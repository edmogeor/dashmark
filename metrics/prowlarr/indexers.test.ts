import { expectFixtureMetric } from '../test-utils'

it('counts Prowlarr indexers', async () => {
  await expectFixtureMetric(new URL('./indexers.yml', import.meta.url), [{}, {}, {}], 3)
})
