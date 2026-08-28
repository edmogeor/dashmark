import { describe, expect, it } from 'vitest'
import { buildCategoryItems } from '@/components/use-dashboard-view-model'
import type { Card } from '@/lib/docker'

function card(id: string, title: string, category?: string): Card {
  return {
    id,
    title,
    url: 'https://example.com',
    icon: { type: 'placeholder', initials: 'E' },
    category,
    searchAliases: [],
    hasContainer: false,
    access: []
  }
}

describe('buildCategoryItems', () => {
  it('merges category names case-insensitively', () => {
    const items = buildCategoryItems([card('1', 'Plex', 'media'), card('2', 'Jellyfin', 'Media')])

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ key: 'media', category: 'media' })
    expect(items[0]?.cards).toHaveLength(2)
  })

  it('uses configured category names and ordering', () => {
    const items = buildCategoryItems([card('1', 'Plex', 'media'), card('2', 'Home Assistant', 'home'), card('3', 'Grafana', 'monitoring')], ['Home', 'Media'])

    expect(items.map((item) => item.category)).toEqual(['Home', 'Media', 'monitoring'])
  })
})
