import { expectFixtureMetric } from '../test-utils'

it('extracts Jellyfin episode count', async () => {
  await expectFixtureMetric(new URL('./episodes.yml', import.meta.url), { EpisodeCount: 96 }, 96)
})
