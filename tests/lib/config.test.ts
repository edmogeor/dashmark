import { describe, it, expect, afterEach } from 'vitest'
import { getConfig } from '@/lib/config'

const trackedVars = [
  'DOCKER_HOST',
  'DOCKER_HOSTS',
  'NODE_ENV',
  'PORT',
  'CONFIG_FILE',
  'AUTH_TOKEN',
  'YAML_AUTH_TOKEN',
  'ACCESS_GROUPS_HEADER',
  'USER_NAME_HEADER',
  'USER_USERNAME_HEADER',
  'USER_EMAIL_HEADER',
  'USER_FIRST_NAME_HEADER',
  'USER_LAST_NAME_HEADER',
  'ENABLE_ACCESS_CONTROL',
  'SHOW_SEARCH',
  'SHOW_STATUS',
  'STATUS_BADGE_ACCESS',
  'SHOW_METRICS',
  'METRICS_ACCESS',
  'METRICS_DATABASE_PATH',
  'METRICS_POLL_INTERVAL',
  'METRICS_HISTORY_PERIOD',
  'CATEGORY_ORDER',
  'ENABLE_AUTOMATIC_DESCRIPTIONS',
  'ENABLE_AUTOMATIC_ICONS',
  'SHOW_BRANDING',
  'SHOW_HEADER',
  'SHOW_GROUP_TAGS',
  'SHOW_THEME_TOGGLE',
  'NEW_TAB',
  'CUSTOM_HEADER',
  'GREETING_MORNING',
  'GREETING_AFTERNOON',
  'GREETING_EVENING',
  'CUSTOM_STYLESHEET',
  'LOCALE'
]

const originals = trackedVars.map((name) => ({ name, value: process.env[name] }))

afterEach(() => {
  for (const { name, value } of originals) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

describe('getConfig accessGroupsHeader', () => {
  it('defaults to auto when unset', () => {
    delete process.env.ACCESS_GROUPS_HEADER
    expect(getConfig().accessGroupsHeader).toBe('auto')
  })

  it('keeps a valid custom header', () => {
    process.env.ACCESS_GROUPS_HEADER = 'X-Forwarded-Groups'
    expect(getConfig().accessGroupsHeader).toBe('X-Forwarded-Groups')
  })

  it('falls back to auto for an invalid header name', () => {
    process.env.ACCESS_GROUPS_HEADER = 'X Bad Header'
    expect(getConfig().accessGroupsHeader).toBe('auto')
  })
})

describe('getConfig Docker hosts', () => {
  it('uses the local socket when DOCKER_HOSTS is unset', () => {
    process.env.DOCKER_HOST = 'tcp://dockerproxy:2375'
    delete process.env.DOCKER_HOSTS
    expect(getConfig().dockerHosts).toBeUndefined()
    expect(getConfig().dockerHost).toBe('unix:///var/run/docker.sock')
  })

  it('reads named Docker hosts', () => {
    process.env.DOCKER_HOSTS = 'home=tcp://home-proxy:2375, vps=https://vps-proxy:2376'
    expect(getConfig().dockerHosts).toEqual([
      { id: 'home', dockerHost: 'tcp://home-proxy:2375' },
      { id: 'vps', dockerHost: 'https://vps-proxy:2376' }
    ])
  })

  it('uses default as the host ID for a single bare endpoint', () => {
    process.env.DOCKER_HOSTS = 'tcp://dockerproxy:2375'
    expect(getConfig().dockerHosts).toEqual([{ id: 'default', dockerHost: 'tcp://dockerproxy:2375' }])
  })

  it('ignores malformed and duplicate Docker host entries', () => {
    process.env.DOCKER_HOSTS = 'home=tcp://home:2375, malformed, home=tcp://other:2375'
    expect(getConfig().dockerHosts).toEqual([{ id: 'home', dockerHost: 'tcp://home:2375' }])
  })
})

describe('getConfig user headers', () => {
  it('reads valid custom user headers', () => {
    process.env.USER_NAME_HEADER = ' X-Custom-Name '
    process.env.USER_USERNAME_HEADER = 'X-Custom-Username'
    process.env.USER_EMAIL_HEADER = 'X-Custom-Email'
    process.env.USER_FIRST_NAME_HEADER = 'X-Custom-Given-Name'
    process.env.USER_LAST_NAME_HEADER = 'X-Custom-Family-Name'

    expect(getConfig()).toMatchObject({
      userNameHeader: 'X-Custom-Name',
      userUsernameHeader: 'X-Custom-Username',
      userEmailHeader: 'X-Custom-Email',
      userFirstNameHeader: 'X-Custom-Given-Name',
      userLastNameHeader: 'X-Custom-Family-Name'
    })
  })

  it('ignores invalid custom user headers', () => {
    process.env.USER_NAME_HEADER = 'X Invalid Header'
    expect(getConfig().userNameHeader).toBeUndefined()
  })
})

describe('getConfig feature toggles', () => {
  it('defaults enableAccessControl to false', () => {
    delete process.env.ENABLE_ACCESS_CONTROL
    expect(getConfig().enableAccessControl).toBe(false)
  })

  it('defaults visual features to on', () => {
    delete process.env.SHOW_SEARCH
    delete process.env.SHOW_STATUS
    delete process.env.ENABLE_AUTOMATIC_DESCRIPTIONS
    delete process.env.ENABLE_AUTOMATIC_ICONS
    delete process.env.SHOW_BRANDING

    const cfg = getConfig()
    expect(cfg.showSearch).toBe(true)
    expect(cfg.showStatus).toBe(true)
    expect(cfg.enableAutomaticDescriptions).toBe(true)
    expect(cfg.enableAutomaticIcons).toBe(true)
    expect(cfg.showBranding).toBe(true)
  })

  it('can turn visual features off', () => {
    process.env.SHOW_SEARCH = 'false'
    process.env.SHOW_STATUS = 'false'
    process.env.SHOW_BRANDING = 'false'
    process.env.ENABLE_AUTOMATIC_DESCRIPTIONS = 'false'
    process.env.ENABLE_AUTOMATIC_ICONS = 'false'

    const cfg = getConfig()
    expect(cfg.showSearch).toBe(false)
    expect(cfg.showStatus).toBe(false)
    expect(cfg.showBranding).toBe(false)
    expect(cfg.enableAutomaticDescriptions).toBe(false)
    expect(cfg.enableAutomaticIcons).toBe(false)
  })

  it.each([
    ['SHOW_HEADER', 'showHeader', true, 'false', false],
    ['SHOW_GROUP_TAGS', 'showGroupTags', true, 'false', false],
    ['SHOW_THEME_TOGGLE', 'showThemeToggle', true, 'false', false],
    ['NEW_TAB', 'openInNewTab', false, 'true', true]
  ] as const)('uses %s to configure %s', (environmentVariable, configKey, defaultValue, configuredValue, expectedValue) => {
    delete process.env[environmentVariable]
    expect(getConfig()[configKey]).toBe(defaultValue)

    process.env[environmentVariable] = configuredValue
    expect(getConfig()[configKey]).toBe(expectedValue)
  })
})

describe('getConfig locale', () => {
  it('defaults to US English, supports configured locales, and falls back for unknown locales', () => {
    delete process.env.LOCALE
    expect(getConfig().locale).toBe('en-US')

    process.env.LOCALE = 'de'
    expect(getConfig().locale).toBe('de')

    process.env.LOCALE = 'en-GB'
    expect(getConfig().locale).toBe('en-US')
  })

  it('accepts US English explicitly', () => {
    process.env.LOCALE = 'en-US'
    expect(getConfig().locale).toBe('en-US')
  })
})

describe('getConfig status polling', () => {
  it('defaults status badge groups to everyone', () => {
    delete process.env.STATUS_BADGE_ACCESS
    expect(getConfig().statusBadgeAccess).toEqual([])
  })

  it('defaults metrics to on for everyone', () => {
    delete process.env.SHOW_METRICS
    delete process.env.METRICS_ACCESS
    expect(getConfig()).toMatchObject({ showMetrics: true, metricsAccess: [] })
  })

  it('reads metric controls', () => {
    process.env.SHOW_METRICS = 'false'
    process.env.METRICS_ACCESS = 'admins, operators, admins'
    expect(getConfig()).toMatchObject({
      showMetrics: false,
      metricsAccess: ['admins', 'operators']
    })
  })

  it('defaults metric history to five minutes and accepts a custom period', () => {
    delete process.env.METRICS_HISTORY_PERIOD
    expect(getConfig().metricsHistoryPeriodMs).toBe(300_000)

    process.env.METRICS_HISTORY_PERIOD = '60'
    process.env.METRICS_DATABASE_PATH = '/tmp/metrics.db'
    expect(getConfig()).toMatchObject({ metricsHistoryPeriodMs: 60_000, metricsDatabasePath: '/tmp/metrics.db' })
  })

  it('keeps production metric history in the container filesystem by default', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.METRICS_DATABASE_PATH
    expect(getConfig().metricsDatabasePath).toBe('/tmp/dashmark/metrics.db')
  })

  it('defaults metric collection to ten seconds and accepts a custom interval', () => {
    delete process.env.METRICS_POLL_INTERVAL
    expect(getConfig().metricsPollIntervalMs).toBe(10_000)

    process.env.METRICS_POLL_INTERVAL = '10'
    expect(getConfig().metricsPollIntervalMs).toBe(10_000)
  })

  it('reads unique, trimmed status badge groups', () => {
    process.env.STATUS_BADGE_ACCESS = ' Admins, operators, admins '
    expect(getConfig().statusBadgeAccess).toEqual(['Admins', 'operators'])
  })
})

describe('getConfig category order', () => {
  it('reads unique, trimmed category names', () => {
    process.env.CATEGORY_ORDER = ' Media, Home, media, Monitoring '
    expect(getConfig().categoryOrder).toEqual(['Media', 'Home', 'Monitoring'])
  })
})

describe('getConfig YAML settings', () => {
  it('uses YAML settings when the corresponding environment variable is unset', async () => {
    const { writeFile, mkdtemp } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const directory = await mkdtemp(join(tmpdir(), 'dashmark-'))
    const configFile = join(directory, 'config.yml')
    await writeFile(
      configFile,
      `
settings:
  port: 9876
  docker_hosts:
    - home=tcp://dockerproxy:2375
  show_search: false
  status_badge_access: admins, operators
  metrics_access: admins
  category_order: Media, Home
  greeting_morning: Hello
  auth_token: { env: YAML_AUTH_TOKEN }
`
    )
    process.env.CONFIG_FILE = configFile
    delete process.env.DOCKER_HOSTS
    process.env.PORT = '9999'
    delete process.env.SHOW_SEARCH
    delete process.env.STATUS_BADGE_ACCESS
    delete process.env.CATEGORY_ORDER
    delete process.env.GREETING_MORNING
    process.env.YAML_AUTH_TOKEN = 'yaml-secret'
    process.env.AUTH_TOKEN = 'env-secret'

    expect(getConfig()).toMatchObject({
      port: 9876,
      dockerHosts: [{ id: 'home', dockerHost: 'tcp://dockerproxy:2375' }],
      showSearch: false,
      statusBadgeAccess: ['admins', 'operators'],
      metricsAccess: ['admins'],
      categoryOrder: ['Media', 'Home'],
      greetingMorning: 'Hello',
      authToken: 'yaml-secret'
    })
  })

  it('prefers YAML settings over environment variables', async () => {
    const { writeFile, mkdtemp } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const directory = await mkdtemp(join(tmpdir(), 'dashmark-'))
    const configFile = join(directory, 'config.yml')
    await writeFile(configFile, 'settings:\n  show_search: false\n')
    process.env.CONFIG_FILE = configFile
    process.env.SHOW_SEARCH = 'true'

    expect(getConfig().showSearch).toBe(false)
  })
})

describe('getConfig greeting values', () => {
  it('defaults customHeader to undefined', () => {
    delete process.env.CUSTOM_HEADER
    expect(getConfig().customHeader).toBeUndefined()
  })

  it('trims and reads customHeader', () => {
    process.env.CUSTOM_HEADER = '  {greeting}, {first_name}!  '
    expect(getConfig().customHeader).toBe('{greeting}, {first_name}!')
  })

  it('defaults the period greetings to undefined', () => {
    delete process.env.GREETING_MORNING
    delete process.env.GREETING_AFTERNOON
    delete process.env.GREETING_EVENING
    const cfg = getConfig()
    expect(cfg.greetingMorning).toBeUndefined()
    expect(cfg.greetingAfternoon).toBeUndefined()
    expect(cfg.greetingEvening).toBeUndefined()
  })

  it('reads and trims custom period greetings', () => {
    process.env.GREETING_AFTERNOON = "  G'day  "
    expect(getConfig().greetingAfternoon).toBe("G'day")
  })
})

describe('getConfig custom stylesheet', () => {
  it('defaults customStylesheet to undefined', () => {
    delete process.env.CUSTOM_STYLESHEET
    expect(getConfig().customStylesheet).toBeUndefined()
  })

  it('trims and reads the custom stylesheet path', () => {
    process.env.CUSTOM_STYLESHEET = '  /data/custom.css  '
    expect(getConfig().customStylesheet).toBe('/data/custom.css')
  })
})

describe('getConfig data paths', () => {
  it('uses /data defaults for user-managed configuration and icons', () => {
    delete process.env.CONFIG_FILE
    delete process.env.ICONS_DIR
    expect(getConfig()).toMatchObject({ configFile: '/data/config.yml', iconsDir: '/data/icons' })
  })
})
