import { expectFixtureMetric } from '../test-utils'

it('extracts Jellyfin song count', async () => {
  await expectFixtureMetric(new URL('./songs.yml', import.meta.url), { SongCount: 184 }, 184)
})
