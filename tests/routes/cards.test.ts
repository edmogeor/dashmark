import { afterEach, describe, expect, it } from 'vitest'
import { GET } from '@/pages/api/cards'

const originalAccessGroupsEnabled = process.env.ACCESS_GROUPS_ENABLED
const originalAccessGroupsHeader = process.env.ACCESS_GROUPS_HEADER

afterEach(() => {
  if (originalAccessGroupsEnabled === undefined) delete process.env.ACCESS_GROUPS_ENABLED
  else process.env.ACCESS_GROUPS_ENABLED = originalAccessGroupsEnabled
  if (originalAccessGroupsHeader === undefined) delete process.env.ACCESS_GROUPS_HEADER
  else process.env.ACCESS_GROUPS_HEADER = originalAccessGroupsHeader
})

describe('GET /api/cards', () => {
  it('prevents shared caches from storing access-controlled card responses', async () => {
    process.env.ACCESS_GROUPS_ENABLED = 'true'
    process.env.ACCESS_GROUPS_HEADER = 'X-Test-Groups'

    const response = await GET({ request: new Request('http://dashmark.test/api/cards') } as never)

    expect(response.headers.get('Cache-Control')).toBe('private, max-age=60')
    expect(response.headers.get('Vary')).toBe('X-Test-Groups')
  })
})
