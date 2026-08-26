import { expectFixtureMetric } from '../test-utils'

it('sums Prowlarr queries', async () => {
  await expectFixtureMetric(new URL('./queries.yml', import.meta.url), { indexers: [{ numberOfQueries: 11 }, { numberOfQueries: 13 }] }, 24)
})
