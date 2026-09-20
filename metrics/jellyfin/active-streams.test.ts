import { expectFixtureMetric } from '../test-utils'

it('counts active Jellyfin streams', async () => {
  await expectFixtureMetric(
    new URL('./active-streams.yml', import.meta.url),
    [{ NowPlayingItem: { Name: 'Example film' } }, { NowPlayingItem: null }, { NowPlayingItem: { Name: 'Example episode' } }],
    2
  )
})
