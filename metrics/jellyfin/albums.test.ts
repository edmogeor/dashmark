import { expectFixtureMetric } from '../test-utils'

it('extracts Jellyfin album count', async () => {
  await expectFixtureMetric(new URL('./albums.yml', import.meta.url), { AlbumCount: 12 }, 12)
})
