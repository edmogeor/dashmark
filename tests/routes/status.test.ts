import { afterEach, describe, expect, it } from 'vitest'
import { getStatusResponse } from '@/pages/api/status'
import { getMetricsResponse } from '@/pages/api/metrics'

const originalEnableAccessControl = process.env.ENABLE_ACCESS_CONTROL
const originalAccessGroupsHeader = process.env.ACCESS_GROUPS_HEADER
const originalShowMetrics = process.env.SHOW_METRICS
const originalMetricsAccess = process.env.METRICS_ACCESS
const originalAuthToken = process.env.AUTH_TOKEN

afterEach(() => {
  if (originalEnableAccessControl === undefined) delete process.env.ENABLE_ACCESS_CONTROL
  else process.env.ENABLE_ACCESS_CONTROL = originalEnableAccessControl
  if (originalAccessGroupsHeader === undefined) delete process.env.ACCESS_GROUPS_HEADER
  else process.env.ACCESS_GROUPS_HEADER = originalAccessGroupsHeader
  if (originalShowMetrics === undefined) delete process.env.SHOW_METRICS
  else process.env.SHOW_METRICS = originalShowMetrics
  if (originalMetricsAccess === undefined) delete process.env.METRICS_ACCESS
  else process.env.METRICS_ACCESS = originalMetricsAccess
  if (originalAuthToken === undefined) delete process.env.AUTH_TOKEN
  else process.env.AUTH_TOKEN = originalAuthToken
})

describe('GET /api/status', () => {
  it('varies access-controlled status responses by every authorization input', async () => {
    process.env.ENABLE_ACCESS_CONTROL = 'true'
    process.env.ACCESS_GROUPS_HEADER = 'X-Test-Groups'
    process.env.AUTH_TOKEN = 'test-token'

    const response = await getStatusResponse(new Request('http://dashmark.test/api/status'))

    expect(response.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=5, must-revalidate')
    expect(response.headers.get('Vary')).toContain('X-Test-Groups')
    expect(response.headers.get('Vary')).toContain('X-Authentik-Username')
    expect(response.headers.get('Vary')).toContain('X-Authentik-Email')
    expect(response.headers.get('Vary')).toContain('X-Dashmark-Token')
  })

  it('varies metrics responses by groups when resource metrics are restricted', async () => {
    process.env.ENABLE_ACCESS_CONTROL = 'false'
    process.env.ACCESS_GROUPS_HEADER = 'X-Test-Groups'
    process.env.SHOW_METRICS = 'true'
    process.env.METRICS_ACCESS = 'admins'

    const response = await getMetricsResponse(new Request('http://dashmark.test/api/metrics?id=default:container'))

    expect(response.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=5, must-revalidate')
    expect(response.headers.get('Vary')).toContain('X-Test-Groups')
    expect(response.headers.get('Vary')).toContain('X-Authentik-Username')
    expect(response.headers.get('Vary')).toContain('X-Authentik-Email')
  })
})
