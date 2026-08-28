import { expectFixtureMetric } from '../test-utils'

it('counts Plex shows across show libraries', async () => {
  await expectFixtureMetric(
    new URL('./shows.yml', import.meta.url),
    {
      MediaContainer: {
        Directory: [
          { type: 'movie', key: '1' },
          { type: 'show', key: '2' },
          { type: 'show', key: '3' }
        ]
      }
    },
    4
  )
})
