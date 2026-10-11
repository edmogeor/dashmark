import { expectFixtureMetric } from '../test-utils'
import { plexLibraryResponse } from './library-response'

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
    5,
    {
      responses: {
        '/library/sections/2/all': (request) => plexLibraryResponse(request, 2),
        '/library/sections/3/all': (request) => plexLibraryResponse(request, 3)
      }
    }
  )
})
