import { describe, expect, it } from 'vitest'
import { demoServices } from '@/demo/services'

describe('demoServices', () => {
  it('provides a varied dashboard fixture with image names for automatic metadata', () => {
    expect(demoServices).toHaveLength(18)
    expect(new Set(demoServices.map(service => service.category)).size).toBe(7)
    expect(demoServices.every(service => service.imageName.length > 0)).toBe(true)
    expect(demoServices.every(service => !('description' in service))).toBe(true)
  })
})
