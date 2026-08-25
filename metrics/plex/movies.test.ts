import { expectFixtureMetric } from '../test-utils'

it('counts Plex movies across movie libraries', async () => {
  await expectFixtureMetric(new URL('./movies.yml', import.meta.url), {
    MediaContainer: { Directory: [{ type: 'movie', key: '1' }, { type: 'movie', key: '2' }, { type: 'show', key: '3' }] }
  }, 4)
})
