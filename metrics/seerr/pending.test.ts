import { expectFixtureMetric } from '../test-utils'

it('extracts pending Seerr requests', async () => {
  await expectFixtureMetric(new URL('./pending.yml', import.meta.url), { pending: 5 }, 5)
})
