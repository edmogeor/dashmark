import { expectFixtureMetric } from '../test-utils'

it('extracts total Seerr issues', async () => {
  await expectFixtureMetric(new URL('./issues.yml', import.meta.url), { total: 6 }, 6)
})
