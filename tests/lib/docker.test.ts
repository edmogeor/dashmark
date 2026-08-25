import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { MockDockerServer } from '../mocks/docker-server'
import { getConfig } from '@/lib/config'
import { getCards, getContainerMetricUsage, getContainerResourceUsage, getContainerStatuses, clearDockerCache } from '@/lib/docker'

const { got } = vi.hoisted(() => ({ got: vi.fn() }))

vi.mock('@/lib/descriptions', () => ({
  resolveDescription: vi.fn(() => 'Automatic description')
}))

vi.mock('@/lib/icons', () => ({
  resolveIcon: vi.fn(async () => ({ type: 'placeholder', initials: 'D' }))
}))

vi.mock('got', () => ({ default: got }))

const tempDirectories: string[] = []

function writeTempConfig(content: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dashmark-docker-'))
  tempDirectories.push(directory)
  const configPath = path.join(directory, 'config.yml')
  fs.writeFileSync(configPath, content)
  return configPath
}

afterEach(() => {
  got.mockReset()
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

function mockGotResponse(body: string) {
  const request = Object.assign(Promise.resolve({ statusCode: 200, body: Buffer.from(body) }), { on: vi.fn() })
  request.on.mockReturnValue(request)
  got.mockReturnValue(request)
}

describe('getCards', () => {
  let server: MockDockerServer
  let dockerHost: string

  beforeEach(async () => {
    server = new MockDockerServer()
    dockerHost = await server.start()
    clearDockerCache()
  })

  it('filters card metric metadata using namespaced metric access labels', async () => {
    server.containers = [{
      Id: 'metric-access', Names: ['/metric-access'], Image: 'nginx', ImageID: 'sha256:metric-access',
      State: 'running', Status: 'Up 1 hour', Labels: {
        'dashmark.url': 'https://metrics.example.com',
        'dashmark.metrics': 'cpu,memory,network',
        'dashmark.metrics_access.cpu': 'admins',
        'dashmark.metrics_access.network': 'admins'
      }
    }]
    const config = getConfig()
    config.dockerHost = dockerHost
    config.accessGroupsHeader = 'X-Test-Groups'

    const { cards } = await getCards(config, new Headers({ 'X-Test-Groups': 'media' }))

    expect(cards[0]?.resourceStats).toEqual(['memory'])
  })

  afterEach(async () => {
    await server.stop()
  })

  it('returns cards for labeled containers', async () => {
    server.containers = [
      {
        Id: 'abc123',
        Names: ['/plex'],
        Image: 'plexinc/pms-docker',
        ImageID: 'sha256:abc',
        State: 'running',
        Status: 'Up 2 hours (healthy)',
        Labels: {
          'dashmark.title': 'Plex',
          'dashmark.url': 'https://plex.home.local',
          'dashmark.category': 'Media',
          'dashmark.show_status': 'false'
        }
      }
    ]

    const config = getConfig()
    config.dockerHost = dockerHost
    const { cards, error } = await getCards(config, new Headers())

    expect(error).toBeUndefined()
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({
      title: 'Plex',
      description: 'Automatic description',
      url: 'https://plex.home.local',
      category: 'Media',
      showStatus: false,
      state: 'running',
      health: 'healthy',
      hasContainer: true
    })
  })

  it('marks host-networked containers', async () => {
    server.containers = [{
      Id: 'host-network',
      Names: ['/home-assistant'],
      Image: 'ghcr.io/home-assistant/home-assistant',
      ImageID: 'sha256:home-assistant',
      State: 'running',
      Status: 'Up 2 hours',
      Labels: { 'dashmark.url': 'https://hass.example.com' },
      HostConfig: { NetworkMode: 'host' }
    }]

    const config = getConfig()
    config.dockerHost = dockerHost
    const { cards } = await getCards(config, new Headers())

    expect(cards[0]?.usesHostNetwork).toBe(true)
  })

  it('combines cards and namespaces statuses from multiple Docker hosts', async () => {
    const secondServer = new MockDockerServer()
    const secondHost = await secondServer.start()
    server.containers = [{
      Id: 'shared-id', Names: ['/home-app'], Image: 'nginx', ImageID: 'sha256:home',
      State: 'running', Status: 'Up 1 hour', Labels: { 'dashmark.url': 'https://home.example.com' }
    }]
    secondServer.containers = [{
      Id: 'shared-id', Names: ['/vps-app'], Image: 'nginx', ImageID: 'sha256:vps',
      State: 'paused', Status: 'Up 1 hour', Labels: { 'dashmark.url': 'https://vps.example.com' }
    }]

    const config = getConfig()
    config.dockerHosts = [
      { id: 'home', dockerHost },
      { id: 'vps', dockerHost: secondHost }
    ]

    try {
      const { cards, error } = await getCards(config, new Headers())
      const { statuses } = await getContainerStatuses(config, new Headers())

      expect(error).toBeUndefined()
      expect(cards.map(card => ({ id: card.id, host: card.host }))).toEqual([
        { id: 'home:shared-id', host: 'home' },
        { id: 'vps:shared-id', host: 'vps' }
      ])
      expect(statuses).toEqual({
        'home:shared-id': { state: 'running', health: undefined },
        'vps:shared-id': { state: 'paused', health: undefined }
      })
    } finally {
      await secondServer.stop()
    }
  })

  it('applies host-qualified YAML overrides to matching services only', async () => {
    const secondServer = new MockDockerServer()
    const secondHost = await secondServer.start()
    server.containers = [{
      Id: 'home-plex', Names: ['/plex'], Image: 'plexinc/pms-docker', ImageID: 'sha256:home',
      State: 'running', Status: 'Up 1 hour', Labels: { 'dashmark.url': 'https://home-plex.example.com' }
    }]
    secondServer.containers = [{
      Id: 'vps-plex', Names: ['/plex'], Image: 'plexinc/pms-docker', ImageID: 'sha256:vps',
      State: 'running', Status: 'Up 1 hour', Labels: { 'dashmark.url': 'https://vps-plex.example.com' }
    }]

    const config = getConfig()
    config.dockerHosts = [
      { id: 'home', dockerHost },
      { id: 'vps', dockerHost: secondHost }
    ]
    config.configFile = writeTempConfig('vps/plex:\n  title: VPS Plex\n')

    try {
      const { cards, error } = await getCards(config, new Headers())

      expect(error).toBeUndefined()
      expect(cards).toHaveLength(2)
      expect(cards.find(card => card.id === 'home:home-plex')?.title).toBe('plex')
      expect(cards.find(card => card.id === 'vps:vps-plex')?.title).toBe('VPS Plex')
    } finally {
      await secondServer.stop()
    }
  })

  it('uses the most specific YAML override for each host and service match', async () => {
    const secondServer = new MockDockerServer()
    const secondHost = await secondServer.start()
    server.containers = [
      {
        Id: 'home-container', Names: ['/container'], Image: 'nginx', ImageID: 'sha256:home-container',
        State: 'running', Status: 'Up 1 hour', Labels: {
          'com.docker.compose.service': 'service',
          'dashmark.url': 'https://home-container.example.com'
        }
      },
      {
        Id: 'home-other', Names: ['/other'], Image: 'nginx', ImageID: 'sha256:home-other',
        State: 'running', Status: 'Up 1 hour', Labels: {
          'com.docker.compose.service': 'service',
          'dashmark.url': 'https://home-other.example.com'
        }
      }
    ]
    secondServer.containers = [
      {
        Id: 'vps-container', Names: ['/container'], Image: 'nginx', ImageID: 'sha256:vps-container',
        State: 'running', Status: 'Up 1 hour', Labels: {
          'com.docker.compose.service': 'service',
          'dashmark.url': 'https://vps-container.example.com'
        }
      },
      {
        Id: 'vps-other', Names: ['/other'], Image: 'nginx', ImageID: 'sha256:vps-other',
        State: 'running', Status: 'Up 1 hour', Labels: {
          'com.docker.compose.service': 'service',
          'dashmark.url': 'https://vps-other.example.com'
        }
      }
    ]

    const config = getConfig()
    config.dockerHosts = [
      { id: 'home', dockerHost },
      { id: 'vps', dockerHost: secondHost }
    ]
    config.configFile = writeTempConfig([
      'home/container:', '  title: Home container',
      'home/service:', '  title: Home service',
      'container:', '  title: Global container',
      'service:', '  title: Global service'
    ].join('\n'))

    try {
      const { cards, error } = await getCards(config, new Headers())

      expect(error).toBeUndefined()
      expect(Object.fromEntries(cards.map(card => [card.id, card.title]))).toEqual({
        'home:home-container': 'Home container',
        'home:home-other': 'Home service',
        'vps:vps-container': 'Global container',
        'vps:vps-other': 'Global service'
      })
    } finally {
      await secondServer.stop()
    }
  })

  it('keeps cards from reachable hosts when another host is unavailable', async () => {
    server.containers = [{
      Id: 'home-app', Names: ['/home-app'], Image: 'nginx', ImageID: 'sha256:home',
      State: 'running', Status: 'Up 1 hour', Labels: { 'dashmark.url': 'https://home.example.com' }
    }]

    const config = getConfig()
    config.dockerHosts = [
      { id: 'home', dockerHost },
      { id: 'offline', dockerHost: 'tcp://127.0.0.1:1' }
    ]

    const { cards, error } = await getCards(config, new Headers())

    expect(error).toBeUndefined()
    expect(cards.map(card => card.id)).toEqual(['home:home-app'])
  })

  it('returns an error when every configured host is unavailable', async () => {
    const config = getConfig()
    config.dockerHosts = [
      { id: 'one', dockerHost: 'tcp://127.0.0.1:1' },
      { id: 'two', dockerHost: 'tcp://127.0.0.1:2' }
    ]
    clearDockerCache()

    const { cards, error } = await getCards(config, new Headers())

    expect(cards).toEqual([])
    expect(error?.code).toBe('DOCKER_UNREACHABLE')
  })

  it('keeps an explicit description', async () => {
    server.containers = [
      {
        Id: 'custom-description',
        Names: ['/plex'],
        Image: 'plexinc/pms-docker',
        ImageID: 'sha256:custom-description',
        State: 'running',
        Status: 'Up 2 hours',
        Labels: {
          'dashmark.url': 'https://plex.home.local',
          'dashmark.description': 'My media server'
        }
      }
    ]

    const config = getConfig()
    config.dockerHost = dockerHost
    const { cards } = await getCards(config, new Headers())

    expect(cards[0]?.description).toBe('My media server')
  })

  it('lets an explicit none description hide the tooltip', async () => {
    server.containers = [
      {
        Id: 'no-description',
        Names: ['/plex'],
        Image: 'plexinc/pms-docker',
        ImageID: 'sha256:no-description',
        State: 'running',
        Status: 'Up 2 hours',
        Labels: {
          'dashmark.url': 'https://plex.home.local',
          'dashmark.description': 'none'
        }
      }
    ]

    const config = getConfig()
    config.dockerHost = dockerHost
    const { cards } = await getCards(config, new Headers())

    expect(cards[0]?.description).toBeUndefined()
  })

  it('reports whether any card uses access groups', async () => {
    server.containers = [
      {
        Id: 'plain1',
        Names: ['/plain'],
        Image: 'nginx',
        ImageID: 'sha256:plain',
        State: 'running',
        Status: 'Up 1 hour',
        Labels: { 'dashmark.url': 'https://plain.home.local' }
      }
    ]

    const config = getConfig()
    config.dockerHost = dockerHost

    const withoutGroups = await getCards(config, new Headers())
    expect(withoutGroups.usesAccessControl).toBe(false)

    server.containers = [
      {
        Id: 'gated1',
        Names: ['/gated'],
        Image: 'nginx',
        ImageID: 'sha256:gated',
        State: 'running',
        Status: 'Up 1 hour',
        Labels: {
          'dashmark.url': 'https://gated.home.local',
          'dashmark.access': 'admins'
        }
      }
    ]
    clearDockerCache()

    const withGroups = await getCards(config, new Headers())
    expect(withGroups.usesAccessControl).toBe(true)
  })

  it('hides containers with dashmark.hidden=true', async () => {
    server.containers = [
      {
        Id: 'hidden1',
        Names: ['/hidden'],
        Image: 'nginx',
        ImageID: 'sha256:hidden',
        State: 'running',
        Status: 'Up 1 hour',
        Labels: {
          'dashmark.url': 'https://hidden.home.local',
          'dashmark.hidden': 'true'
        }
      }
    ]

    const config = getConfig()
    config.dockerHost = dockerHost
    const { cards } = await getCards(config, new Headers())
    expect(cards).toHaveLength(0)
  })

  it('derives a URL from traefik labels when dashmark.url is missing', async () => {
    server.containers = [
      {
        Id: 'traefik1',
        Names: ['/traefik-app'],
        Image: 'nginx',
        ImageID: 'sha256:traefik',
        State: 'running',
        Status: 'Up 1 hour',
        Labels: {
          'dashmark.title': 'Traefik App',
          'traefik.http.routers.traefik-app.rule': 'Host(`app.example.com`)'
        }
      }
    ]

    const config = getConfig()
    config.dockerHost = dockerHost
    const { cards, error } = await getCards(config, new Headers())

    expect(error).toBeUndefined()
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({
      title: 'Traefik App',
      url: 'https://app.example.com'
    })
  })

  it('does not create a card from Traefik labels alone', async () => {
    server.containers = [
      {
        Id: 'traefik2',
        Names: ['/traefik-only'],
        Image: 'nginx',
        ImageID: 'sha256:traefik2',
        State: 'running',
        Status: 'Up 1 hour',
        Labels: {
          'traefik.http.routers.traefik-only.rule': 'Host(`app.example.com`)'
        }
      }
    ]

    const config = getConfig()
    config.dockerHost = dockerHost
    const { cards, error } = await getCards(config, new Headers())

    expect(error).toBeUndefined()
    expect(cards).toHaveLength(0)
  })

  it('includes search_aliases on the card', async () => {
    server.containers = [
      {
        Id: 'alias1',
        Names: ['/media-app'],
        Image: 'nginx',
        ImageID: 'sha256:alias',
        State: 'running',
        Status: 'Up 1 hour',
        Labels: {
          'dashmark.title': 'Media App',
          'dashmark.url': 'https://media.home.local',
          'dashmark.search_aliases': 'movies, watch later'
        }
      }
    ]

    const config = getConfig()
    config.dockerHost = dockerHost
    const { cards, error } = await getCards(config, new Headers())

    expect(error).toBeUndefined()
    expect(cards).toHaveLength(1)
    expect(cards[0].searchAliases).toEqual(['movies', 'watch later'])
  })

  it('filters by access groups when enabled', async () => {
    server.containers = [
      {
        Id: 'admin1',
        Names: ['/admin-app'],
        Image: 'nginx',
        ImageID: 'sha256:admin',
        State: 'running',
        Status: 'Up 1 hour',
        Labels: {
          'dashmark.url': 'https://admin.home.local',
          'dashmark.access': 'admins'
        }
      }
    ]

    const config = getConfig()
    config.dockerHost = dockerHost
    config.enableAccessControl = true
    config.accessGroupsHeader = 'X-Authentik-Groups'

    const noGroup = await getCards(config, new Headers())
    expect(noGroup.error?.code).toBe('MISSING_GROUPS_HEADER')

    const withGroup = await getCards(
      config,
      new Headers({ 'X-Authentik-Groups': 'admins' })
    )
    expect(withGroup.cards).toHaveLength(1)

    const wrongGroup = await getCards(
      config,
      new Headers({ 'X-Authentik-Groups': 'users' })
    )
    expect(wrongGroup.cards).toHaveLength(0)
  })

  it('auto-detects the groups header for oauth2-proxy and Keycloak Gatekeeper', async () => {
    server.containers = [
      {
        Id: 'admin1',
        Names: ['/admin-app'],
        Image: 'nginx',
        ImageID: 'sha256:admin',
        State: 'running',
        Status: 'Up 1 hour',
        Labels: {
          'dashmark.url': 'https://admin.home.local',
          'dashmark.access': 'admins'
        }
      }
    ]

    const config = getConfig()
    config.dockerHost = dockerHost
    config.enableAccessControl = true
    config.accessGroupsHeader = 'auto'

    const oauth2Proxy = await getCards(
      config,
      new Headers({ 'X-Forwarded-Groups': 'admins' })
    )
    expect(oauth2Proxy.cards).toHaveLength(1)

    const keycloakGatekeeper = await getCards(
      config,
      new Headers({ 'X-Auth-Groups': 'admins' })
    )
    expect(keycloakGatekeeper.cards).toHaveLength(1)
  })

  it('returns error when Docker is unreachable', async () => {
    await server.stop()

    const config = getConfig()
    config.dockerHost = 'tcp://127.0.0.1:1'
    clearDockerCache()

    const { cards, error } = await getCards(config, new Headers())
    expect(cards).toHaveLength(0)
    expect(error?.code).toBe('DOCKER_UNREACHABLE')
  })

  it('returns an error for a malformed YAML config', async () => {
    const config = getConfig()
    config.dockerHost = dockerHost
    config.configFile = writeTempConfig('bad: [unclosed\n')

    const { cards, error } = await getCards(config, new Headers())
    expect(cards).toHaveLength(0)
    expect(error?.code).toBe('CONFIG_INVALID')
  })

  it('recovers from a config error after the file is fixed', async () => {
    server.containers = [
      {
        Id: 'abc123',
        Names: ['/plex'],
        Image: 'plexinc/pms-docker',
        ImageID: 'sha256:abc',
        State: 'running',
        Status: 'Up 2 hours (healthy)',
        Labels: {
          'dashmark.url': 'https://plex.home.local'
        }
      }
    ]

    const config = getConfig()
    config.dockerHost = dockerHost
    config.configFile = writeTempConfig('bad: [unclosed\n')

    const first = await getCards(config, new Headers())
    expect(first.error?.code).toBe('CONFIG_INVALID')

    fs.writeFileSync(config.configFile, 'plex:\n  title: Plex\n')

    const second = await getCards(config, new Headers())
    expect(second.error).toBeUndefined()
    expect(second.cards).toHaveLength(1)
  })

  it('uses YAML entries as standalone cards', async () => {
    const config = getConfig()
    config.dockerHost = dockerHost
    config.dockerHosts = undefined
    config.configFile = writeTempConfig('github:\n  title: GitHub\n  url: https://github.com\n')

    const { cards, error } = await getCards(config, new Headers())

    expect(error).toBeUndefined()
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({
      id: 'yaml-github',
      title: 'GitHub',
      url: 'https://github.com',
      hasContainer: false
    })
  })

  it('lets YAML override a Docker card by Compose service name', async () => {
    server.containers = [{
      Id: 'abc123', Names: ['/stack_plex_1'], Image: 'plexinc/pms-docker', ImageID: 'sha256:abc',
      State: 'running', Status: 'Up 2 hours', Labels: {
        'com.docker.compose.service': 'plex',
        'dashmark.url': 'https://plex.home.local'
      }
    }]

    const config = getConfig()
    config.dockerHost = dockerHost
    config.dockerHosts = undefined
    config.configFile = writeTempConfig('plex:\n  title: Plex Media\n  description: none\n')

    const { cards, error } = await getCards(config, new Headers())

    expect(error).toBeUndefined()
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({
      id: 'default:abc123',
      title: 'Plex Media',
      description: undefined,
      hasContainer: true
    })
  })
})

describe('getContainerStatuses', () => {
  let server: MockDockerServer
  let dockerHost: string

  beforeEach(async () => {
    server = new MockDockerServer()
    dockerHost = await server.start()
    clearDockerCache()
  })

  afterEach(async () => {
    await server.stop()
  })

  it('returns state and health keyed by container id', async () => {
    server.containers = [
      {
        Id: 'abc123',
        Names: ['/plex'],
        Image: 'plexinc/pms-docker',
        ImageID: 'sha256:abc',
        State: 'running',
        Status: 'Up 2 hours (healthy)',
        Labels: {
          'dashmark.url': 'https://plex.home.local'
        }
      }
    ]

    const config = getConfig()
    config.dockerHost = dockerHost
    const { statuses, error } = await getContainerStatuses(config, new Headers())

    expect(error).toBeUndefined()
    expect(statuses).toEqual({
      'default:abc123': { state: 'running', health: 'healthy' }
    })
  })

  it('includes CPU, memory, and per-container network rates', async () => {
    server.containers = [{
      Id: 'resources', Names: ['/resources'], Image: 'nginx', ImageID: 'sha256:resources',
      State: 'running', Status: 'Up 1 hour', Labels: { 'dashmark.url': 'https://resources.example.com' }
    }]
    server.stats.resources = {
      cpu_stats: {
        cpu_usage: { total_usage: 300, percpu_usage: [150, 150] },
        system_cpu_usage: 1_400,
        online_cpus: 2
      },
      precpu_stats: {
        cpu_usage: { total_usage: 100 },
        system_cpu_usage: 1_000
      },
      memory_stats: { usage: 512 * 1_024 * 1_024, limit: 2 * 1_024 * 1_024 * 1_024 },
      networks: { eth0: { rx_bytes: 1_000, tx_bytes: 500 } }
    }
    const now = vi.spyOn(Date, 'now').mockReturnValue(0)
    const config = getConfig()
    config.dockerHost = dockerHost

    try {
      const statuses = await getContainerStatuses(config, new Headers())
      expect(statuses.statuses['default:resources']).toEqual({ state: 'running', health: undefined })
      expect(server.statsRequests).toBe(0)

      const first = await getContainerResourceUsage(config, new Headers(), 'default:resources')
      expect(first).toMatchObject({
        cpuPercent: 100,
        memoryUsage: 512 * 1_024 * 1_024,
        memoryLimit: 2 * 1_024 * 1_024 * 1_024
      })
      expect(first?.receivedBytesPerSecond).toBeUndefined()

      now.mockReturnValue(1_000)
      server.stats.resources = {
        ...server.stats.resources as Record<string, unknown>,
        networks: { eth0: { rx_bytes: 3_000, tx_bytes: 1_000 } }
      }
      const second = await getContainerResourceUsage(config, new Headers(), 'default:resources')
      expect(second).toMatchObject({
        receivedBytesPerSecond: 2_000,
        sentBytesPerSecond: 500
      })
    } finally {
      now.mockRestore()
    }
  })

  it('skips Docker stats when resource usage is disabled or not authorized', async () => {
    server.containers = [{
      Id: 'restricted-resources', Names: ['/restricted-resources'], Image: 'nginx', ImageID: 'sha256:restricted',
      State: 'running', Status: 'Up 1 hour', Labels: { 'dashmark.url': 'https://resources.example.com' }
    }]
    server.stats['restricted-resources'] = {
      cpu_stats: { cpu_usage: { total_usage: 200 }, system_cpu_usage: 400 },
      precpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 200 }
    }
    const config = getConfig()
    config.dockerHost = dockerHost
    config.showMetrics = false

    const disabled = await getContainerResourceUsage(config, new Headers(), 'default:restricted-resources')
    expect(disabled).toBeUndefined()
    expect(server.statsRequests).toBe(0)

    config.showMetrics = true
    config.metricsAccess = ['admins']
    config.accessGroupsHeader = 'X-Test-Groups'
    const unauthorized = await getContainerResourceUsage(config, new Headers({ 'X-Test-Groups': 'users' }), 'default:restricted-resources')
    expect(unauthorized).toBeUndefined()
    expect(server.statsRequests).toBe(0)

    const authorized = await getContainerResourceUsage(config, new Headers({ 'X-Test-Groups': 'admins' }), 'default:restricted-resources')
    expect(authorized?.cpuPercent).toBe(50)
    expect(server.statsRequests).toBe(1)
  })

  it('limits resource metrics per card and skips stats for none', async () => {
    server.containers = [{
      Id: 'selected-resources', Names: ['/selected-resources'], Image: 'nginx', ImageID: 'sha256:selected',
      State: 'running', Status: 'Up 1 hour', Labels: {
        'dashmark.url': 'https://resources.example.com',
        'dashmark.metrics': 'cpu'
      }
    }]
    server.stats['selected-resources'] = {
      cpu_stats: { cpu_usage: { total_usage: 200 }, system_cpu_usage: 400 },
      precpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 200 },
      memory_stats: { usage: 1_024, limit: 2_048 },
      networks: { eth0: { rx_bytes: 1_000, tx_bytes: 500 } }
    }
    const config = getConfig()
    config.dockerHost = dockerHost

    const cpuOnly = await getContainerResourceUsage(config, new Headers(), 'default:selected-resources')
    expect(cpuOnly).toMatchObject({ cpuPercent: 50 })
    expect(cpuOnly?.memoryUsage).toBeUndefined()
    expect(server.statsRequests).toBe(1)

    const container = server.containers[0]
    if (!container?.Labels) throw new Error('Expected resource test container')
    container.Labels['dashmark.metrics'] = 'none'
    clearDockerCache()
    const none = await getContainerResourceUsage(config, new Headers(), 'default:selected-resources')
    expect(none).toBeUndefined()
    expect(server.statsRequests).toBe(1)
  })

  it('collects only custom metrics selected by the unified metric list', async () => {
    server.containers = [{
      Id: 'custom-metrics', Names: ['/radarr'], Image: 'radarr', ImageID: 'sha256:radarr',
      State: 'running', Status: 'Up 1 hour', Labels: {
        'dashmark.url': 'https://radarr.example.com',
        'dashmark.metrics': 'active_downloads'
      }
    }]
    mockGotResponse('{"totalRecords":4}')
    const config = getConfig()
    config.dockerHost = dockerHost
    config.configFile = writeTempConfig(`
radarr:
  custom_metrics:
    active_downloads:
      label: Active downloads
      unit: count
      source: { url: https://metrics.example.test/radarr }
      jq: .totalRecords
    ignored:
      label: Ignored
      source: { url: https://metrics.example.test/ignored }
      jq: .value
`)

    await expect(getContainerMetricUsage(config, new Headers(), 'default:custom-metrics')).resolves.toEqual({
      resource: undefined,
      historyPeriodMs: config.metricsHistoryPeriodMs,
      customMetrics: [{ key: 'active_downloads', label: 'Active downloads', unit: 'count', chart: 'step', value: 4 }],
      metricErrors: []
    })
    expect(got).toHaveBeenCalledTimes(1)
    expect(server.statsRequests).toBe(0)
  })

  it('collects a fixture catalog metric from the card URL and API-key label', async () => {
    server.containers = [{
      Id: 'catalog-metric', Names: ['/service'], Image: 'service', ImageID: 'sha256:service',
      State: 'running', Status: 'Up 1 hour', Labels: {
        'dashmark.url': 'https://service.example.com',
        'dashmark.metric_providers': 'test',
        'dashmark.metrics': 'test/queue-depth',
        'dashmark.metric_api_key': 'label-api-key'
      }
    }]
    mockGotResponse('{"totalCount":4}')
    const config = getConfig()
    config.dockerHost = dockerHost

    await expect(getContainerMetricUsage(config, new Headers(), 'default:catalog-metric')).resolves.toEqual({
      resource: undefined,
      historyPeriodMs: config.metricsHistoryPeriodMs,
      customMetrics: [{ key: 'test/queue-depth', label: 'Queue depth', unit: 'count', chart: 'step', value: 4 }],
      metricErrors: []
    })
    expect(String(got.mock.calls[0]?.[0])).toBe('https://service.example.com/api/queue')
    expect(new Headers(got.mock.calls[0]?.[1]?.headers).get('X-Api-Key')).toBe('label-api-key')
  })

  it('validates metric access without collecting live values', async () => {
    server.containers = [{
      Id: 'cached-metrics', Names: ['/radarr'], Image: 'radarr', ImageID: 'sha256:radarr',
      State: 'running', Status: 'Up 1 hour', Labels: {
        'dashmark.url': 'https://radarr.example.com',
        'dashmark.metrics': 'active_downloads'
      }
    }]
    const config = getConfig()
    config.dockerHost = dockerHost
    config.configFile = writeTempConfig(`
radarr:
  custom_metrics:
    active_downloads:
      label: Active downloads
      unit: count
      source: { url: https://metrics.example.test/radarr }
      jq: .totalRecords
`)

    await expect(getContainerMetricUsage(config, new Headers(), 'default:cached-metrics', false)).resolves.toEqual({
      historyPeriodMs: config.metricsHistoryPeriodMs,
      customMetrics: [],
      metricErrors: []
    })
    expect(got).not.toHaveBeenCalled()
    expect(server.statsRequests).toBe(0)
  })

  it('collects custom metrics from any configured provider', async () => {
    server.containers = [{
      Id: 'provider-metrics', Names: ['/radarr'], Image: 'radarr', ImageID: 'sha256:radarr',
      State: 'running', Status: 'Up 1 hour', Labels: {
        'dashmark.url': 'https://radarr.example.com',
        'dashmark.metric_providers': 'radarr,sonarr',
        'dashmark.metrics': 'sonarr/active_downloads'
      }
    }]
    const config = getConfig()
    config.dockerHost = dockerHost
    config.configFile = writeTempConfig(`
radarr:
  custom_metrics:
    sonarr/active_downloads:
      label: Active downloads
      unit: count
      source: { url: https://metrics.example.test/sonarr }
      jq: .totalRecords
`)

    mockGotResponse('{"totalRecords":4}')

    await expect(getContainerMetricUsage(config, new Headers(), 'default:provider-metrics')).resolves.toEqual({
      resource: undefined,
      historyPeriodMs: config.metricsHistoryPeriodMs,
      customMetrics: [{ key: 'sonarr/active_downloads', label: 'Active downloads', unit: 'count', chart: 'step', value: 4 }],
      metricErrors: []
    })
  })

  it('rejects custom metrics from unconfigured providers', async () => {
    server.containers = [{
      Id: 'unconfigured-provider', Names: ['/plex'], Image: 'plex', ImageID: 'sha256:plex',
      State: 'running', Status: 'Up 1 hour', Labels: {
        'dashmark.url': 'https://plex.example.com',
        'dashmark.metric_providers': 'plex',
        'dashmark.metrics': 'uptime-kuma/status'
      }
    }]
    const config = getConfig()
    config.dockerHost = dockerHost
    config.configFile = writeTempConfig(`
plex:
  custom_metrics:
    uptime-kuma/status:
      label: Uptime
      unit: boolean
      source: { url: https://kuma.example.test/status }
      jq: .status
`)

    await expect(getContainerMetricUsage(config, new Headers(), 'default:unconfigured-provider')).resolves.toEqual({
      resource: undefined,
      historyPeriodMs: config.metricsHistoryPeriodMs,
      customMetrics: [],
      metricErrors: [{ key: 'uptime-kuma/status', message: 'uptime-kuma/status requires metric_providers to include uptime-kuma' }]
    })
    expect(got).not.toHaveBeenCalled()
  })

  it('omits hidden containers', async () => {
    server.containers = [
      {
        Id: 'hidden1',
        Names: ['/hidden'],
        Image: 'nginx',
        ImageID: 'sha256:hidden',
        State: 'running',
        Status: 'Up 1 hour',
        Labels: {
          'dashmark.url': 'https://hidden.home.local',
          'dashmark.hidden': 'true'
        }
      }
    ]

    const config = getConfig()
    config.dockerHost = dockerHost
    const { statuses } = await getContainerStatuses(config, new Headers())
    expect(Object.keys(statuses)).toHaveLength(0)
  })

  it('omits containers that cannot produce a card', async () => {
    server.containers = [
      {
        Id: 'unlisted1',
        Names: ['/unlisted'],
        Image: 'nginx',
        ImageID: 'sha256:unlisted',
        State: 'running',
        Status: 'Up 1 hour',
        Labels: {}
      }
    ]

    const config = getConfig()
    config.dockerHost = dockerHost
    const { statuses } = await getContainerStatuses(config, new Headers())

    expect(statuses).toEqual({})
  })

  it('filters by access groups when enabled', async () => {
    server.containers = [
      {
        Id: 'admin1',
        Names: ['/admin-app'],
        Image: 'nginx',
        ImageID: 'sha256:admin',
        State: 'running',
        Status: 'Up 1 hour',
        Labels: {
          'dashmark.url': 'https://admin.home.local',
          'dashmark.access': 'admins'
        }
      }
    ]

    const config = getConfig()
    config.dockerHost = dockerHost
    config.enableAccessControl = true
    config.accessGroupsHeader = 'X-Authentik-Groups'

    const noGroup = await getContainerStatuses(config, new Headers())
    expect(noGroup.error?.code).toBe('MISSING_GROUPS_HEADER')

    const withGroup = await getContainerStatuses(
      config,
      new Headers({ 'X-Authentik-Groups': 'admins' })
    )
    expect(withGroup.statuses).toHaveProperty('default:admin1')

    const wrongGroup = await getContainerStatuses(
      config,
      new Headers({ 'X-Authentik-Groups': 'users' })
    )
    expect(Object.keys(wrongGroup.statuses)).toHaveLength(0)
  })

  it('returns error when Docker is unreachable', async () => {
    await server.stop()

    const config = getConfig()
    config.dockerHost = 'tcp://127.0.0.1:1'
    clearDockerCache()

    const { statuses, error } = await getContainerStatuses(config, new Headers())
    expect(Object.keys(statuses)).toHaveLength(0)
    expect(error?.code).toBe('DOCKER_UNREACHABLE')
  })

  it('returns an error for a malformed YAML config', async () => {
    const config = getConfig()
    config.dockerHost = dockerHost
    config.configFile = writeTempConfig('bad: [unclosed\n')

    const { statuses, error } = await getContainerStatuses(config, new Headers())
    expect(Object.keys(statuses)).toHaveLength(0)
    expect(error?.code).toBe('CONFIG_INVALID')
  })
})
