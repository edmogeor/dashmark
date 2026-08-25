import { expectFixtureMetric } from '../test-utils'

it('reads a Home Assistant entity state', async () => {
  await expectFixtureMetric(new URL('./entity-state.yml', import.meta.url), { state: 'open' }, 'open')
})
