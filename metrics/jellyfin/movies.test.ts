import { expectFixtureMetric } from '../test-utils'

it('extracts Jellyfin movie count', async () => {
  await expectFixtureMetric(new URL('./movies.yml', import.meta.url), { MovieCount: 24 }, 24)
})
