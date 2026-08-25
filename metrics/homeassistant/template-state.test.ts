import { expectFixtureMetric } from '../test-utils'

it('reads a Home Assistant template state', async () => {
  await expectFixtureMetric(new URL('./template-state.yml', import.meta.url), 'open', 'open')
})
