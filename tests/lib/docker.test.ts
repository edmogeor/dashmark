import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { MockDockerServer } from '../mocks/docker-server'
import { getConfig } from '@/lib/config'
import { getCards, getContainerStatuses, clearDockerCache } from '@/lib/docker'

const tempDirectories: string[] = []

function writeTempConfig(content: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dashmark-docker-'))
  tempDirectories.push(directory)
  const configPath = path.join(directory, 'config.yml')
  fs.writeFileSync(configPath, content)
  return configPath
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('getCards', () => {
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
      url: 'https://plex.home.local',
      category: 'Media',
      showStatus: false,
      state: 'running',
      health: 'healthy',
      hasContainer: true
    })
    expect(cards[0]?.description).toBeUndefined()
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
    expect(withoutGroups.usesAccessGroups).toBe(false)

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
          'dashmark.access_groups': 'admins'
        }
      }
    ]
    clearDockerCache()

    const withGroups = await getCards(config, new Headers())
    expect(withGroups.usesAccessGroups).toBe(true)
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

  it('derives a Traefik URL when a matching YAML entry opts in', async () => {
    server.containers = [
      {
        Id: 'traefik3',
        Names: ['/traefik-yaml'],
        Image: 'nginx',
        ImageID: 'sha256:traefik3',
        State: 'running',
        Status: 'Up 1 hour',
        Labels: {
          'traefik.http.routers.traefik-yaml.rule': 'Host(`app.example.com`)'
        }
      }
    ]

    const config = getConfig()
    config.dockerHost = dockerHost
    config.configFile = writeTempConfig('traefik-yaml:\n  title: Traefik YAML\n')

    const { cards, error } = await getCards(config, new Headers())

    expect(error).toBeUndefined()
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({
      title: 'Traefik YAML',
      url: 'https://app.example.com',
      hasContainer: true
    })
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
    const { cards } = await getCards(config, new Headers())

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
          'dashmark.access_groups': 'admins'
        }
      }
    ]

    const config = getConfig()
    config.dockerHost = dockerHost
    config.enableAccessGroups = true
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
          'dashmark.access_groups': 'admins'
        }
      }
    ]

    const config = getConfig()
    config.dockerHost = dockerHost
    config.enableAccessGroups = true
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

  it('uses YAML changes after a successful card lookup', async () => {
    server.containers = [
      {
        Id: 'abc123',
        Names: ['/plex'],
        Image: 'plexinc/pms-docker',
        ImageID: 'sha256:abc',
        State: 'running',
        Status: 'Up 2 hours (healthy)',
        Labels: { 'dashmark.url': 'https://plex.home.local' }
      }
    ]

    const config = getConfig()
    config.dockerHost = dockerHost
    config.configFile = writeTempConfig('plex:\n  title: Plex\n')

    expect((await getCards(config, new Headers())).cards[0]?.title).toBe('Plex')

    fs.writeFileSync(config.configFile, 'plex:\n  title: Plex Media\n')

    expect((await getCards(config, new Headers())).cards[0]?.title).toBe('Plex Media')
  })

  it('lets a YAML none description hide the tooltip', async () => {
    server.containers = [
      {
        Id: 'abc123',
        Names: ['/plex'],
        Image: 'plexinc/pms-docker',
        ImageID: 'sha256:abc',
        State: 'running',
        Status: 'Up 2 hours',
        Labels: { 'dashmark.url': 'https://plex.home.local' }
      }
    ]

    const config = getConfig()
    config.dockerHost = dockerHost
    config.configFile = writeTempConfig('plex:\n  description: none\n')

    expect((await getCards(config, new Headers())).cards[0]?.description).toBeUndefined()
  })

  it('matches YAML by compose service name without duplicating the card', async () => {
    server.containers = [
      {
        Id: 'abc123',
        Names: ['/stack_plex_1'],
        Image: 'plexinc/pms-docker',
        ImageID: 'sha256:abc',
        State: 'running',
        Status: 'Up 2 hours (healthy)',
        Labels: {
          'com.docker.compose.service': 'plex',
          'dashmark.url': 'https://plex.home.local'
        }
      }
    ]

    const config = getConfig()
    config.dockerHost = dockerHost
    config.configFile = writeTempConfig('plex:\n  title: Plex Media\n')

    const { cards, error } = await getCards(config, new Headers())
    expect(error).toBeUndefined()
    expect(cards).toHaveLength(1)
    expect(cards[0].title).toBe('Plex Media')
    expect(cards[0].hasContainer).toBe(true)
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
      abc123: { state: 'running', health: 'healthy' }
    })
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
          'dashmark.access_groups': 'admins'
        }
      }
    ]

    const config = getConfig()
    config.dockerHost = dockerHost
    config.enableAccessGroups = true
    config.accessGroupsHeader = 'X-Authentik-Groups'

    const noGroup = await getContainerStatuses(config, new Headers())
    expect(noGroup.error?.code).toBe('MISSING_GROUPS_HEADER')

    const withGroup = await getContainerStatuses(
      config,
      new Headers({ 'X-Authentik-Groups': 'admins' })
    )
    expect(withGroup.statuses).toHaveProperty('admin1')

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
