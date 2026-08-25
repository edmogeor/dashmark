import { expectFixtureMetric } from '../test-utils'

it('counts Plex albums across music libraries', async () => {
  await expectFixtureMetric(new URL('./albums.yml', import.meta.url), {
    MediaContainer: { Directory: [{ type: 'artist', key: '1' }, { type: 'artist', key: '2' }, { type: 'movie', key: '3' }] }
  }, 4)
})
