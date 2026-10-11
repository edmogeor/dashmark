import type { IncomingMessage } from 'node:http'
import type { FixtureResponse } from '../test-server'

export function plexLibraryResponse(request: IncomingMessage, size: number): FixtureResponse {
  if (request.headers['x-plex-token'] !== 'test-secret') return { status: 401 }
  return { body: { MediaContainer: { size } } }
}
