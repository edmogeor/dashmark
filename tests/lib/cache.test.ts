import { describe, expect, it } from 'vitest'
import { sharedCacheControl } from '@/lib/cache'

describe('sharedCacheControl', () => {
  it('uses an interval-derived TTL between one and five seconds', () => {
    expect(sharedCacheControl(500)).toBe('public, max-age=0, s-maxage=1, must-revalidate')
    expect(sharedCacheControl(3_000)).toBe('public, max-age=0, s-maxage=3, must-revalidate')
    expect(sharedCacheControl(30_000)).toBe('public, max-age=0, s-maxage=5, must-revalidate')
  })
})
