import { afterEach, describe, expect, it } from 'vitest'
import { getStatusResponse } from '@/pages/api/status'
import { getResourceUsageResponse } from '@/pages/api/resources'

const originalEnableAccessGroups = process.env.ENABLE_ACCESS_GROUPS
const originalAccessGroupsHeader = process.env.ACCESS_GROUPS_HEADER
const originalShowResourceUsage = process.env.SHOW_RESOURCE_USAGE
const originalResourceUsageGroups = process.env.RESOURCE_USAGE_GROUPS

afterEach(() => {
  if (originalEnableAccessGroups === undefined) delete process.env.ENABLE_ACCESS_GROUPS
  else process.env.ENABLE_ACCESS_GROUPS = originalEnableAccessGroups
  if (originalAccessGroupsHeader === undefined) delete process.env.ACCESS_GROUPS_HEADER
  else process.env.ACCESS_GROUPS_HEADER = originalAccessGroupsHeader
  if (originalShowResourceUsage === undefined) delete process.env.SHOW_RESOURCE_USAGE
  else process.env.SHOW_RESOURCE_USAGE = originalShowResourceUsage
  if (originalResourceUsageGroups === undefined) delete process.env.RESOURCE_USAGE_GROUPS
  else process.env.RESOURCE_USAGE_GROUPS = originalResourceUsageGroups
})

describe('GET /api/status', () => {
  it('prevents shared caches from storing access-controlled status responses', async () => {
    process.env.ENABLE_ACCESS_GROUPS = 'true'
    process.env.ACCESS_GROUPS_HEADER = 'X-Test-Groups'

    const response = await getStatusResponse(new Request('http://dashmark.test/api/status'))

    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.get('Vary')).toBe('X-Test-Groups')
  })

  it('varies resource responses by groups when resource metrics are restricted', async () => {
    process.env.ENABLE_ACCESS_GROUPS = 'false'
    process.env.ACCESS_GROUPS_HEADER = 'X-Test-Groups'
    process.env.SHOW_RESOURCE_USAGE = 'true'
    process.env.RESOURCE_USAGE_GROUPS = 'admins'

    const response = await getResourceUsageResponse(new Request('http://dashmark.test/api/resources?id=default:container'))

    expect(response.headers.get('Vary')).toBe('X-Test-Groups')
  })
})
