import { expectFixtureMetric } from '../test-utils'
import { plexLibraryResponse } from './library-response'

it('counts Plex albums across music libraries', async () => {
  await expectFixtureMetric(
    new URL('./albums.yml', import.meta.url),
    {
      MediaContainer: {
        Directory: [
          { type: 'artist', key: '1' },
          { type: 'artist', key: '2' },
          { type: 'movie', key: '3' }
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
