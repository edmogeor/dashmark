import { expectFixtureMetric } from '../test-utils'

it('counts Home Assistant entities', async () => {
  await expectFixtureMetric(new URL('./entities.yml', import.meta.url), [{}, {}, {}], 3)
})
