import { expectFixtureMetric } from '../test-utils'

it('extracts open Seerr issues', async () => {
  await expectFixtureMetric(new URL('./open-issues.yml', import.meta.url), { open: 3 }, 3)
})
