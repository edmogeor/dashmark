import { describe, expect, it } from 'vitest'
import { demoServices } from '@/demo/services'

describe('demoServices', () => {
  it('provides a varied dashboard fixture with image names for automatic metadata', () => {
    expect(demoServices).toHaveLength(18)
    expect(new Set(demoServices.map(service => service.category)).size).toBe(7)
    expect(demoServices.every(service => service.imageName.length > 0)).toBe(true)
    expect(demoServices.every(service => !('description' in service))).toBe(true)
  })

  it('includes host badges for the multi-host dashboard example', () => {
    expect(new Set(demoServices.map(service => service.host))).toEqual(new Set(['home-server', 'vps']))
    expect(demoServices.every(service => service.hostColor !== undefined)).toBe(true)
  })

  it('omits network usage for Home Assistant', () => {
    const homeAssistant = demoServices.find(service => service.id === 'home-assistant')

    expect(homeAssistant?.resourceStats).toEqual(['cpu', 'memory'])
  })
})
