import { describe, expect, it } from 'vitest'
import type { Card } from '@/lib/docker'
import { mergeStatuses } from '@/components/use-realtime'

function containerCard(id: string, state?: string): Card {
  return {
    id,
    title: id,
    url: 'https://example.com',
    icon: { type: 'placeholder', initials: 'E' },
    state,
    searchAliases: [],
    hasContainer: true,
    access: []
  }
}

describe('realtime status updates', () => {
  it('preserves the cards array when statuses have not changed', () => {
    const cards = [containerCard('home:service', 'running')]
    expect(mergeStatuses(cards, { 'home:service': { state: 'running' } })).toBe(cards)
    expect(mergeStatuses(cards, {})).toMatchObject([{ state: undefined, health: undefined }])
  })

  it('updates same-ID containers from different Docker hosts independently', () => {
    const cards = [containerCard('home:shared-id', 'exited'), containerCard('vps:shared-id', 'exited')]

    expect(
      mergeStatuses(cards, {
        'home:shared-id': { state: 'running', health: 'healthy' },
        'vps:shared-id': { state: 'paused' }
      })
    ).toMatchObject([
      { id: 'home:shared-id', state: 'running', health: 'healthy' },
      { id: 'vps:shared-id', state: 'paused' }
    ])
  })
})
