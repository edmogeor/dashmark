import { expectFixtureMetric } from '../test-utils'

it('extracts active Plex streams', async () => {
  await expectFixtureMetric(new URL('./active-streams.yml', import.meta.url), { MediaContainer: { size: 2 } }, 2)
})
