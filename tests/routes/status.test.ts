import { afterEach, describe, expect, it } from 'vitest'
import { getStatusResponse } from '@/pages/api/status'
import { getResourceUsageResponse } from '@/pages/api/resources'

const originalEnableAccessControl = process.env.ENABLE_ACCESS_CONTROL
const originalAccessGroupsHeader = process.env.ACCESS_GROUPS_HEADER
const originalShowMetrics = process.env.SHOW_METRICS
const originalMetricsAccess = process.env.METRICS_ACCESS

afterEach(() => {
  if (originalEnableAccessControl === undefined) delete process.env.ENABLE_ACCESS_CONTROL
  else process.env.ENABLE_ACCESS_CONTROL = originalEnableAccessControl
  if (originalAccessGroupsHeader === undefined) delete process.env.ACCESS_GROUPS_HEADER
  else process.env.ACCESS_GROUPS_HEADER = originalAccessGroupsHeader
  if (originalShowMetrics === undefined) delete process.env.SHOW_METRICS
  else process.env.SHOW_METRICS = originalShowMetrics
  if (originalMetricsAccess === undefined) delete process.env.METRICS_ACCESS
  else process.env.METRICS_ACCESS = originalMetricsAccess
})

describe('GET /api/status', () => {
  it('prevents shared caches from storing access-controlled status responses', async () => {
    process.env.ENABLE_ACCESS_CONTROL = 'true'
    process.env.ACCESS_GROUPS_HEADER = 'X-Test-Groups'

    const response = await getStatusResponse(new Request('http://dashmark.test/api/status'))

    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.get('Vary')).toBe('X-Test-Groups')
  })

  it('varies resource responses by groups when resource metrics are restricted', async () => {
    process.env.ENABLE_ACCESS_CONTROL = 'false'
    process.env.ACCESS_GROUPS_HEADER = 'X-Test-Groups'
    process.env.SHOW_METRICS = 'true'
    process.env.METRICS_ACCESS = 'admins'

    const response = await getResourceUsageResponse(new Request('http://dashmark.test/api/resources?id=default:container'))

    expect(response.headers.get('Vary')).toBe('X-Test-Groups')
  })
})
