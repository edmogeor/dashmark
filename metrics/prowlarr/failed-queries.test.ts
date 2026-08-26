import { expectFixtureMetric } from '../test-utils'

it('sums failed Prowlarr queries', async () => {
  await expectFixtureMetric(new URL('./failed-queries.yml', import.meta.url), { indexers: [{ numberOfFailedQueries: 2 }, { numberOfFailedQueries: 4 }] }, 6)
})
