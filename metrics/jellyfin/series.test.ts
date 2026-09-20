import { expectFixtureMetric } from '../test-utils'

it('extracts Jellyfin series count', async () => {
  await expectFixtureMetric(new URL('./series.yml', import.meta.url), { SeriesCount: 8 }, 8)
})
