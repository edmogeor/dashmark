import { describe, it, expect } from 'vitest'
import { getConfig } from '@/lib/config'
import { parseLabels, isValidUrl, traefikUrl } from '@/lib/labels'

describe('parseLabels', () => {
  const config = getConfig()

  it('parses all supported dashmark labels', () => {
    const labels = {
      'dashmark.title': 'Plex',
      'dashmark.description': 'Media server',
      'dashmark.url': 'https://plex.home.local',
      'dashmark.icon': 'plex',
      'dashmark.category': 'Media',
      'dashmark.order': '1',
      'dashmark.hidden': 'true',
      'dashmark.access_groups': 'media, admins'
    }

    expect(parseLabels(config, labels)).toEqual({
      hidden: true,
      url: 'https://plex.home.local',
      title: 'Plex',
      description: 'Media server',
      icon: 'plex',
      category: 'Media',
      order: 1,
      accessGroups: ['media', 'admins'],
      searchAliases: []
    })
  })

  it('returns defaults for missing labels', () => {
    expect(parseLabels(config, {})).toEqual({
      hidden: false,
      url: undefined,
      title: undefined,
      description: undefined,
      icon: undefined,
      category: undefined,
      order: undefined,
      accessGroups: [],
      searchAliases: []
    })
  })

  it('ignores labels with wrong prefix', () => {
    const labels = {
      'other.title': 'Ignored',
      'dashmark.title': 'Plex'
    }
    expect(parseLabels(config, labels).title).toBe('Plex')
  })

  it('parses search_aliases as a comma-separated list', () => {
    const labels = {
      'dashmark.search_aliases': 'movies, watch later'
    }
    expect(parseLabels(config, labels).searchAliases).toEqual(['movies', 'watch later'])
  })

  it('ignores non-finite order values', () => {
    expect(parseLabels(config, { 'dashmark.order': 'Infinity' }).order).toBeUndefined()
  })
})

describe('isValidUrl', () => {
  it('accepts valid http and https URLs', () => {
    expect(isValidUrl('http://localhost')).toBe(true)
    expect(isValidUrl('http://localhost:8080')).toBe(true)
    expect(isValidUrl('https://plex.home.local')).toBe(true)
    expect(isValidUrl('https://192.168.1.10:32400/web')).toBe(true)
    expect(isValidUrl('https://[::1]:8080')).toBe(true)
  })

  it('rejects invalid URLs', () => {
    expect(isValidUrl('ftp://example.com')).toBe(false)
    expect(isValidUrl('not-a-url')).toBe(false)
    expect(isValidUrl('')).toBe(false)
    expect(isValidUrl('http://')).toBe(false)
    expect(isValidUrl('https://example.com:99999')).toBe(false)
  })
})

describe('traefikUrl', () => {
  it('builds an https URL from a single Host rule', () => {
    expect(
      traefikUrl({ 'traefik.http.routers.plex.rule': 'Host(`plex.example.com`)' })
    ).toBe('https://plex.example.com')
  })

  it('uses the first host from a multi-host rule', () => {
    expect(
      traefikUrl({
        'traefik.http.routers.app.rule': 'Host(`app.example.com`, `www.example.com`)'
      })
    ).toBe('https://app.example.com')
  })

  it('extracts Host from a compound rule', () => {
    expect(
      traefikUrl({
        'traefik.http.routers.app.rule': 'Host(`app.example.com`) && PathPrefix(`/`)'
      })
    ).toBe('https://app.example.com')
  })

  it('ignores routers without a Host rule and other labels', () => {
    expect(
      traefikUrl({
        'traefik.http.routers.app.rule': 'PathPrefix(`/`)',
        'traefik.http.routers.app.service': 'app',
        'dashmark.title': 'App'
      })
    ).toBeUndefined()
  })

  it('returns undefined when no traefik router labels exist', () => {
    expect(traefikUrl({})).toBeUndefined()
  })
})
