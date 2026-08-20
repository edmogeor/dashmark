import { afterEach, describe, expect, it } from 'vitest'
import { GET } from '@/pages/api/status'

const originalEnableAccessGroups = process.env.ENABLE_ACCESS_GROUPS
const originalAccessGroupsHeader = process.env.ACCESS_GROUPS_HEADER

afterEach(() => {
  if (originalEnableAccessGroups === undefined) delete process.env.ENABLE_ACCESS_GROUPS
  else process.env.ENABLE_ACCESS_GROUPS = originalEnableAccessGroups
  if (originalAccessGroupsHeader === undefined) delete process.env.ACCESS_GROUPS_HEADER
  else process.env.ACCESS_GROUPS_HEADER = originalAccessGroupsHeader
})

describe('GET /api/status', () => {
  it('prevents shared caches from storing access-controlled status responses', async () => {
    process.env.ENABLE_ACCESS_GROUPS = 'true'
    process.env.ACCESS_GROUPS_HEADER = 'X-Test-Groups'

    const response = await GET({ request: new Request('http://dashmark.test/api/status') } as never)

    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.get('Vary')).toBe('X-Test-Groups')
  })
})
