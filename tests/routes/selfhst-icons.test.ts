import { afterEach, describe, expect, it, vi } from 'vitest'
import { SelfhstIconCache } from '@/lib/selfhst-icon-cache'
import { serveSelfhstIcon } from '@/pages/api/selfhst-icons/[key]'

const PLEX_ICON = 'https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/plex.svg'

describe('GET /api/selfhst-icons/[key]', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('serves a cached icon with safe, cacheable headers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } })))
    const cache = new SelfhstIconCache('/tmp/dashmark-test-icons')
    const source = cache.source(PLEX_ICON)!

    const response = await serveSelfhstIcon(cache, source.split('/').at(-1)!)

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/svg+xml')
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })

  it('returns not found for an unknown key', async () => {
    const response = await serveSelfhstIcon(new SelfhstIconCache('/tmp/dashmark-test-icons'), 'not-an-icon')

    expect(response.status).toBe(404)
  })
})
