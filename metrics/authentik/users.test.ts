import { expectFixtureMetric } from '../test-utils'

it('extracts the Authentik user total', async () => {
  await expectFixtureMetric(new URL('./users.yml', import.meta.url), { pagination: { count: 7 } }, 7)
})
