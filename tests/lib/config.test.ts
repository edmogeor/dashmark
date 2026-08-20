import { describe, it, expect, afterEach } from 'vitest'
import { getConfig } from '@/lib/config'

const originalAccessGroupsHeader = process.env.ACCESS_GROUPS_HEADER

afterEach(() => {
  if (originalAccessGroupsHeader === undefined) delete process.env.ACCESS_GROUPS_HEADER
  else process.env.ACCESS_GROUPS_HEADER = originalAccessGroupsHeader
})

describe('getConfig accessGroupsHeader', () => {
  it('defaults to auto when unset', () => {
    delete process.env.ACCESS_GROUPS_HEADER
    expect(getConfig().accessGroupsHeader).toBe('auto')
  })

  it('keeps a valid custom header', () => {
    process.env.ACCESS_GROUPS_HEADER = 'X-Forwarded-Groups'
    expect(getConfig().accessGroupsHeader).toBe('X-Forwarded-Groups')
  })

  it('falls back to auto for an invalid header name', () => {
    process.env.ACCESS_GROUPS_HEADER = 'X Bad Header'
    expect(getConfig().accessGroupsHeader).toBe('auto')
  })
})
