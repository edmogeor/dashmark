import { describe, it, expect } from 'vitest'
import { parseLabels, isValidUrl, traefikUrl, hasDashmarkLabels } from '@/lib/labels'

describe('parseLabels', () => {
  it('parses all supported dashmark labels', () => {
    const labels = {
      'dashmark.title': 'Plex',
      'dashmark.description': 'Media server',
      'dashmark.url': 'https://plex.home.local',
      'dashmark.metrics_url': 'https://plex-api.home.local',
      'dashmark.icon': 'plex',
      'dashmark.category': 'Media',
      'dashmark.order': '1',
      'dashmark.hidden': 'true',
      'dashmark.show_status': 'false',
      'dashmark.metrics': 'cpu,network',
      'dashmark.metric_providers': 'plex,uptime-kuma',
      'dashmark.metrics_access.cpu': 'admins',
      'dashmark.metrics_access.radarr.active_downloads': 'media, admins',
      'dashmark.access': 'media, admins'
    }

    expect(parseLabels(labels)).toEqual({
      hidden: true,
      url: 'https://plex.home.local',
      metricsUrl: 'https://plex-api.home.local',
      title: 'Plex',
      description: 'Media server',
      icon: 'plex',
      category: 'Media',
      order: 1,
      showStatus: false,
      resourceStats: ['cpu', 'network'],
      metrics: ['cpu', 'network'],
      metricProviders: ['plex', 'uptime-kuma'],
      metricsAccess: { cpu: ['admins'], 'radarr/active_downloads': ['media', 'admins'] },
      access: ['media', 'admins'],
      searchAliases: []
    })
  })

  it('returns defaults for missing labels', () => {
    expect(parseLabels({})).toEqual({
      hidden: false,
      url: undefined,
      title: undefined,
      description: undefined,
      icon: undefined,
      category: undefined,
      order: undefined,
      showStatus: undefined,
      resourceStats: undefined,
      access: [],
      searchAliases: []
    })
  })

  it('ignores labels with wrong prefix', () => {
    const labels = {
      'other.title': 'Ignored',
      'dashmark.title': 'Plex'
    }
    expect(parseLabels(labels).title).toBe('Plex')
  })

  it('parses search_aliases as a comma-separated list', () => {
    const labels = {
      'dashmark.search_aliases': 'movies, watch later'
    }
    expect(parseLabels(labels).searchAliases).toEqual(['movies', 'watch later'])
  })

  it('uses none to disable and ignores unknown resource stats', () => {
    expect(parseLabels({ 'dashmark.metrics': 'none,cpu' }).resourceStats).toEqual([])
    expect(parseLabels({ 'dashmark.metrics': 'cpu,unknown,memory' }).resourceStats).toEqual(['cpu', 'memory'])
  })

  it('ignores the removed stats label', () => {
    expect(parseLabels({ 'dashmark.stats': 'cpu' }).resourceStats).toBeUndefined()
  })

  it('accepts comma-separated metric providers only', () => {
    expect(parseLabels({ 'dashmark.metric_providers': 'radarr,sonarr,radarr' }).metricProviders).toEqual(['radarr', 'sonarr'])
    expect(parseLabels({ 'dashmark.metric_providers': 'radarr,Sonarr' }).metricProviders).toBeUndefined()
  })

  it('ignores invalid metrics URLs', () => {
    expect(parseLabels({ 'dashmark.metrics_url': 'not-a-url' }).metricsUrl).toBeUndefined()
  })

  it('ignores non-finite order values', () => {
    expect(parseLabels({ 'dashmark.order': 'Infinity' }).order).toBeUndefined()
  })
})

describe('hasDashmarkLabels', () => {
  it('detects any dashmark.* label', () => {
    expect(hasDashmarkLabels({ 'dashmark.title': 'Plex' })).toBe(true)
    expect(hasDashmarkLabels({ 'dashmark.hidden': 'true' })).toBe(true)
  })

  it('ignores non-dashmark labels', () => {
    expect(
      hasDashmarkLabels({ 'traefik.http.routers.app.rule': 'Host(`app.example.com`)' })
    ).toBe(false)
    expect(hasDashmarkLabels({})).toBe(false)
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
