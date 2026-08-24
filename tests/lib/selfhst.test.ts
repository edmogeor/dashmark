import { describe, it, expect } from 'vitest'
import { fuzzyMatchIcon, type SelfhstIcon } from '@/lib/selfhst'

function icon(reference: string): SelfhstIcon {
  return { reference, name: reference.replace(/[-_]/g, ' '), url: `https://cdn.example.com/${reference}.svg` }
}

describe('fuzzyMatchIcon', () => {
  it('returns null when there are no candidates or icons', () => {
    expect(fuzzyMatchIcon([], [icon('plex')])).toBeNull()
    expect(fuzzyMatchIcon(['plex'], [])).toBeNull()
  })

  it('matches an exact reference', () => {
    expect(fuzzyMatchIcon(['plex'], [icon('plex')])?.reference).toBe('plex')
  })

  it('prefers an exact match over a fuzzy prefix match', () => {
    const icons = [icon('plex-meta-manager'), icon('plex')]
    expect(fuzzyMatchIcon(['plex'], icons)?.reference).toBe('plex')
  })

  it('tolerates a small typo', () => {
    expect(fuzzyMatchIcon(['grafan'], [icon('grafana')])?.reference).toBe('grafana')
  })

  it('rejects a short partial match', () => {
    expect(fuzzyMatchIcon(['code'], [icon('codeberg')])).toBeNull()
  })

  it('does not match a sufficiently different name', () => {
    const icons = [icon('plex'), icon('grafana')]
    expect(fuzzyMatchIcon(['sonarr'], icons)).toBeNull()
  })
})
