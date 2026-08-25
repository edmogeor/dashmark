import { describe, expect, it } from 'vitest'
import { isNewerVersion } from '@/lib/version'

describe('isNewerVersion', () => {
  it('compares stable semantic versions', () => {
    expect(isNewerVersion('v1.2.4', '1.2.3')).toBe(true)
    expect(isNewerVersion('v1.2.3', '1.2.3')).toBe(false)
    expect(isNewerVersion('v1.2.2', '1.2.3')).toBe(false)
  })

  it('ignores malformed and prerelease versions', () => {
    expect(isNewerVersion('latest', '1.2.3')).toBe(false)
    expect(isNewerVersion('1.2.4-alpha.1', '1.2.3')).toBe(false)
    expect(isNewerVersion('1.2.4', '1.2.3-alpha.1')).toBe(false)
  })
})
