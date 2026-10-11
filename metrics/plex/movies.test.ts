import { expectFixtureMetric } from '../test-utils'
import { plexLibraryResponse } from './library-response'

it('counts Plex movies across movie libraries', async () => {
  await expectFixtureMetric(
    new URL('./movies.yml', import.meta.url),
    {
      MediaContainer: {
        Directory: [
          { type: 'movie', key: '1' },
          { type: 'movie', key: '2' },
          { type: 'show', key: '3' }
        ]
      }
    },
    5,
    {
      responses: {
        '/library/sections/1/all': (request) => plexLibraryResponse(request, 2),
        '/library/sections/2/all': (request) => plexLibraryResponse(request, 3)
      }
    }
  )
})
