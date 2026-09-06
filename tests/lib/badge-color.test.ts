import { describe, expect, it } from 'vitest'
import { badgeColorIndex } from '@/lib/badge-color'

describe('badgeColorIndex', () => {
  it('assigns stable colors to host names', () => {
    expect({ home: badgeColorIndex('home'), host: badgeColorIndex('host'), external: badgeColorIndex('external') }).toEqual({ home: 11, host: 8, external: 3 })
  })
})
