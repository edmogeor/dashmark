import { describe, expect, it } from 'vitest'
import { isStatusBadgeVisible, shouldShowResources } from '@/components/use-app-card-metrics'
import type { Card } from '@/lib/docker'

function card(overrides: Partial<Card> = {}): Card {
  return {
    id: 'plex',
    title: 'Plex',
    url: 'https://plex.example.com',
    icon: { type: 'placeholder', initials: 'P' },
    searchAliases: [],
    hasContainer: true,
    access: [],
    ...overrides
  }
}

describe('AppCard metric visibility', () => {
  it('shows resources for container stats and custom metrics', () => {
    expect(shouldShowResources(card({ resourceStats: ['cpu'] }), true)).toBe(true)
    expect(shouldShowResources(card({ resourceStats: [], customMetricLabels: [{ key: 'requests', label: 'Requests' }] }), true)).toBe(true)
    expect(shouldShowResources(card({ hasContainer: false, customMetricLabels: [{ key: 'requests', label: 'Requests' }] }), true)).toBe(true)
  })

  it('hides resources when metrics or card status are disabled', () => {
    expect(shouldShowResources(card({ resourceStats: ['cpu'] }), false)).toBe(false)
    expect(shouldShowResources(card({ resourceStats: ['cpu'], showStatus: false }), true)).toBe(false)
    expect(shouldShowResources(card({ resourceStats: [] }), true)).toBe(false)
  })

  it('only shows status badges for status, health, or loading containers', () => {
    expect(isStatusBadgeVisible(card({ state: 'running' }), true, false)).toBe(true)
    expect(isStatusBadgeVisible(card({ health: 'unhealthy' }), true, false)).toBe(true)
    expect(isStatusBadgeVisible(card(), true, true)).toBe(true)
    expect(isStatusBadgeVisible(card({ hasContainer: false }), true, true)).toBe(false)
    expect(isStatusBadgeVisible(card({ state: 'running', showStatus: false }), true, false)).toBe(false)
  })
})
