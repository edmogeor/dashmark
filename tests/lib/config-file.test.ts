import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { getConfig } from '@/lib/config'
import { loadYamlConfig } from '@/lib/config-file'

const tempDirectories: string[] = []

function writeConfig(content: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dashmark-'))
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

describe('loadYamlConfig', () => {
  it('parses catalog metric parameters and reports missing required values', () => {
    const config = getConfig()
    config.configFile = writeConfig(`
parameterized:
  url: https://service.example.test
  metrics: [test/url-parameter]
  metric_parameters:
    test/url-parameter:
      resource: garage_door
missing:
  url: https://service.example.test
  metrics: [test/url-parameter]
`)

    const { config: parsed } = loadYamlConfig(config)

    expect(parsed.services.parameterized?.metricParameters).toEqual({
      'test/url-parameter': { resource: 'garage_door' }
    })
    expect(parsed.services.missing?.customMetricErrors).toEqual({
      'test/url-parameter': 'Catalog parameter Resource is required'
    })
  })

  it('allows a catalog metric presentation to be overridden', () => {
    const config = getConfig()
    config.configFile = writeConfig(`
service:
  url: https://service.example.test
  metrics: [test/url-parameter]
  metric_parameters:
    test/url-parameter: { resource: temperature }
  custom_metrics:
    test/url-parameter:
      label: Temperature
      value_type: number
      unit: celsius
      chart: line
      jq: '(.state | tonumber)'
`)

    const metric = loadYamlConfig(config).config.services.service?.customMetrics?.['test/url-parameter']

    expect(metric).toMatchObject({ label: 'Temperature', valueType: 'number', unit: 'celsius', chart: 'line' })
  })

  it('rejects malformed service fields instead of weakening access control', () => {
    const config = getConfig()
    config.configFile = writeConfig(`
valid:
  url: https://valid.example.com
  order: 2
  show_status: false
  access: admins, operators
  metrics: cpu,memory
  search_aliases: movies, watch later
  metrics_access:
    cpu: admins
    radarr/active_downloads: media, operators
invalid:
  access: 1
not-a-service: null
`)

    const result = loadYamlConfig(config)

    expect(result.config).toEqual({ settings: {}, services: {} })
    expect(result.error?.detail).toBe('invalid.access must be a non-empty string or list of strings')
  })

  it('reports unknown and invalid settings with their paths', () => {
    const config = getConfig()
    config.configFile = writeConfig(`
settings:
  enable_access_contol: true
`)
    expect(loadYamlConfig(config).error?.detail).toBe('unknown configuration key: settings.enable_access_contol')

    config.configFile = writeConfig(`
settings:
  enable_access_control: "true"
`)
    expect(loadYamlConfig(config).error?.detail).toBe('settings.enable_access_control must be a boolean')
  })

  it('rejects malformed metric access and missing secret references', () => {
    const config = getConfig()
    config.configFile = writeConfig(`
plex:
  url: https://plex.example.com
  metrics_access:
    cpu: 1
`)
    expect(loadYamlConfig(config).error?.detail).toBe('plex.metrics_access.cpu must be a non-empty string or list of strings')

    config.configFile = writeConfig(`
settings:
  auth_token: { env: DASHMARK_TEST_MISSING_TOKEN }
`)
    delete process.env.DASHMARK_TEST_MISSING_TOKEN
    expect(loadYamlConfig(config).error?.detail).toBe('settings.auth_token.env references an unset environment variable: DASHMARK_TEST_MISSING_TOKEN')
  })

  it('returns an empty config with no error when the file is missing', () => {
    const config = getConfig()
    config.configFile = path.join(os.tmpdir(), 'definitely-missing-config.yml')

    expect(loadYamlConfig(config)).toEqual({ config: { settings: {}, services: {} } })
  })

  it('returns an error when the config path cannot be read', () => {
    const config = getConfig()
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dashmark-'))
    tempDirectories.push(directory)
    config.configFile = directory

    expect(loadYamlConfig(config).error?.code).toBe('CONFIG_INVALID')
  })

  it('returns an error for malformed YAML', () => {
    const config = getConfig()
    config.configFile = writeConfig('bad: [unclosed\n')

    const result = loadYamlConfig(config)

    expect(result.config).toEqual({ settings: {}, services: {} })
    expect(result.error?.code).toBe('CONFIG_INVALID')
    expect(result.error?.message).toBeDefined()
  })

  it('re-reads the config when the file changes', () => {
    const config = getConfig()
    const configPath = writeConfig('a:\n  url: https://a.example.com\n')
    config.configFile = configPath

    expect(loadYamlConfig(config).config.services.a).toEqual({ url: 'https://a.example.com' })

    fs.writeFileSync(configPath, 'b:\n  url: https://b.example.com\n  title: B\n')

    const result = loadYamlConfig(config)
    expect(result.config.services.b).toEqual({ url: 'https://b.example.com', title: 'B' })
    expect(result.config.services.a).toBeUndefined()
  })

  it('parses explicit custom metric sources and overrides', () => {
    const config = getConfig()
    config.configFile = writeConfig(`
radarr:
  metrics: [cpu, active_downloads]
  custom_metrics:
    active_downloads:
      label: Active downloads
      unit: count
      chart: line
      source:
        url: http://metrics.example.internal/radarr
        headers:
          X-Api-Key:
            env: RADARR_API_KEY
      jq: '[.records[].queue.size] | add'
`)

    expect(loadYamlConfig(config).config.services.radarr?.customMetrics).toEqual({
      active_downloads: {
        label: 'Active downloads',
        valueType: 'number',
        unit: 'count',
        chart: 'line',
        source: {
          url: 'http://metrics.example.internal/radarr',
          headers: { 'X-Api-Key': { env: 'RADARR_API_KEY' } }
        },
        jq: { expression: '[.records[].queue.size] | add' }
      }
    })
    expect(loadYamlConfig(config).config.services.radarr?.metrics).toEqual(['cpu', 'active_downloads'])
  })

  it('parses scalar, CSV, and list metric providers', () => {
    const config = getConfig()
    config.configFile = writeConfig(`
scalar:
  metric_providers: test
csv:
  metric_providers: test, radarr, test
list:
  metric_providers: [test, radarr]
service:
  metric_providers: test
  metrics: [test/queue-depth]
  custom_metrics:
    test/queue-depth:
      source: { url: http://service:8080/api/queue }
`)

    const services = loadYamlConfig(config).config.services
    expect(services.scalar?.metricProviders).toEqual(['test'])
    expect(services.csv?.metricProviders).toEqual(['test', 'radarr'])
    expect(services.list?.metricProviders).toEqual(['test', 'radarr'])
    expect(services.service?.customMetrics).toEqual({
      'test/queue-depth': {
        label: 'Queue depth',
        valueType: 'number',
        unit: 'count',
        chart: 'step',
        source: { url: 'http://service:8080/api/queue' },
        jq: { expression: '.totalCount' }
      }
    })
  })

  it('parses metrics_url and rejects non-HTTP URLs', () => {
    const config = getConfig()
    config.configFile = writeConfig('opnsense:\n  metrics_url: https://opnsense-api.example.com\n')

    expect(loadYamlConfig(config).config.services.opnsense?.metricsUrl).toBe('https://opnsense-api.example.com')

    config.configFile = writeConfig('opnsense:\n  metrics_url: ftp://opnsense.example.com\n')
    expect(loadYamlConfig(config).error?.detail).toBe('opnsense.metrics_url must be an HTTP or HTTPS URL')
  })

  it('rejects the removed singular metric_provider field', () => {
    const config = getConfig()
    config.configFile = writeConfig(`
plex:
  metric_provider: plex
`)

    expect(loadYamlConfig(config).error?.detail).toBe('unknown configuration key: plex.metric_provider')
  })

  it('parses Socket.IO metric sources', () => {
    const config = getConfig()
    config.configFile = writeConfig(`
uptime-kuma:
  custom_metrics:
    status:
      label: Status
      unit: boolean
      source:
        transport: socketio
        url: http://uptime-kuma:3001
        socketio:
          auth:
            token: { env: UPTIME_KUMA_TOKEN }
          login:
            event: loginByToken
            args: [metrics]
          request:
            event: getMonitor
            args: [42]
      jq: .status
`)

    expect(loadYamlConfig(config).config.services['uptime-kuma']?.customMetrics?.status).toMatchObject({
      source: {
        transport: 'socketio',
        socketio: {
          auth: { token: { env: 'UPTIME_KUMA_TOKEN' } },
          login: { event: 'loginByToken', args: ['metrics'] },
          request: { event: 'getMonitor', args: [42] }
        }
      }
    })
  })

  it('parses bounded cookie-session request flows and rejects invalid request bodies', () => {
    const config = getConfig()
    config.configFile = writeConfig(`
service:
  custom_metrics:
    authenticated:
      label: Authenticated
      source:
        url: https://service.example.com/info
        auth:
          type: cookie_session
          steps:
            - url: https://service.example.com/csrf
              extract:
                csrf: { cheerio: { selector: 'input[name=csrf]', attribute: value } }
            - url: https://service.example.com/login
              method: POST
              form:
                username: { env: SERVICE_USERNAME, label: dashmark.metric_username }
                password: { file: /run/secrets/service_password }
                csrf: { token: csrf }
      jq: .value
    invalid:
      label: Invalid
      source:
        url: https://service.example.com/info
        auth:
          type: cookie_session
          steps:
            - url: https://service.example.com/login
              method: POST
              form: { username: { env: SERVICE_USERNAME } }
              json: { password: { env: SERVICE_PASSWORD } }
      jq: .value
`)

    const metrics = loadYamlConfig(config).config.services.service?.customMetrics
    expect(metrics?.authenticated).toMatchObject({
      source: {
        auth: {
          type: 'cookie_session',
          steps: [{ extract: { csrf: { cheerio: { selector: 'input[name=csrf]', attribute: 'value' } } } }, { method: 'POST', form: { username: { env: 'SERVICE_USERNAME', label: 'dashmark.metric_username' }, csrf: { token: 'csrf' } } }]
        }
      }
    })
    expect(metrics?.invalid).toBeUndefined()
  })

  it('parses HTTP Basic secret references and rejects incomplete credentials', () => {
    const config = getConfig()
    config.configFile = writeConfig(`
service:
  custom_metrics:
    basic:
      label: Basic
      source:
        url: https://service.example.com/info
        auth:
          type: basic
          username: { env: SERVICE_API_KEY, label: dashmark.metric_api_key }
          password: { file: /run/secrets/service_api_secret, label: dashmark.metric_api_secret }
      jq: .value
    invalid:
      label: Invalid
      source:
        url: https://service.example.com/info
        auth: { type: basic, username: { env: SERVICE_API_KEY } }
      jq: .value
`)

    const metrics = loadYamlConfig(config).config.services.service?.customMetrics
    expect(metrics?.basic).toMatchObject({
      source: {
        auth: {
          type: 'basic',
          username: { env: 'SERVICE_API_KEY', label: 'dashmark.metric_api_key' },
          password: { file: '/run/secrets/service_api_secret', label: 'dashmark.metric_api_secret' }
        }
      }
    })
    expect(metrics?.invalid).toBeUndefined()
  })

  it('parses static request values, token auth, nested JSON, and Socket.IO sessions', () => {
    const config = getConfig()
    config.configFile = writeConfig(`
service:
  custom_metrics:
    token:
      label: Token
      source:
        url: https://service.example.com/status
        headers: { Accept: application/json }
        auth:
          type: token
          header: Authorization
          prefix: "Bearer "
          value: { env: SERVICE_TOKEN }
      jq: .value
    json:
      label: JSON
      source:
        url: https://service.example.com/rpc
        method: POST
        json:
          method: status
          params: []
          auth: { token: { env: SERVICE_TOKEN } }
      jq: .value
    socket:
      label: Socket
      source:
        transport: socketio
        url: https://service.example.com
        headers: { X-Client: dashmark }
        auth:
          type: cookie_session
          login:
            url: https://service.example.com/login
            method: POST
            form: { username: admin }
        socketio:
          path: /socket.io
          request: { event: getStatus }
      jq: .value
`)

    const metrics = loadYamlConfig(config).config.services.service?.customMetrics
    expect(metrics?.token?.source).toMatchObject({ headers: { Accept: 'application/json' }, auth: { type: 'token', header: 'Authorization', prefix: 'Bearer ', value: { env: 'SERVICE_TOKEN' } } })
    expect(metrics?.json?.source.json).toEqual({ method: 'status', params: [], auth: { token: { env: 'SERVICE_TOKEN' } } })
    expect(metrics?.socket?.source).toMatchObject({ headers: { 'X-Client': 'dashmark' }, auth: { type: 'cookie_session' }, socketio: { path: '/socket.io' } })
  })

  it('parses state metrics without permitting graphs', () => {
    const config = getConfig()
    config.configFile = writeConfig(`
service:
  custom_metrics:
    state:
      label: State
      value_type: state
      color: warning
      state_colors: { open: success }
      state_labels: { open: Open now }
      source: { url: https://service.example.com/status }
      jq: .state
    invalid_labels:
      label: Invalid labels
      value_type: state
      color: warning
      state_labels: { open: '' }
      source: { url: https://service.example.com/status }
      jq: .state
    numeric_labels:
      label: Numeric labels
      unit: count
      state_labels: { open: 'Open now' }
      source: { url: https://service.example.com/status }
      jq: .state
    invalid:
      label: Invalid
      color: error
      source: { url: https://service.example.com/status }
      jq: .state
`)

    const metrics = loadYamlConfig(config).config.services.service?.customMetrics
    expect(metrics?.state).toMatchObject({ valueType: 'state', color: 'warning', stateColors: { open: 'success' }, stateLabels: { open: 'Open now' } })
    expect(metrics?.invalid_labels).toBeUndefined()
    expect(metrics?.numeric_labels).toBeUndefined()
    expect(metrics?.invalid).toBeUndefined()
  })

  it('requires one valid extractor for each custom metric', () => {
    const config = getConfig()
    config.configFile = writeConfig(`
service:
  custom_metrics:
    valid:
      label: Requests
      source: { url: http://metrics.example.internal/metrics }
      prometheus: { name: http_requests_total, reduce: sum }
    neither:
      label: Missing
      source: { url: http://metrics.example.internal/metrics }
    both:
      label: Both
      source: { url: http://metrics.example.internal/metrics }
      jq: .value
      prometheus: { name: value }
    invalid_jq:
      label: Invalid jq
      source: { url: http://metrics.example.internal/metrics }
      jq: ''
`)

    expect(loadYamlConfig(config).config.services.service?.customMetrics).toEqual({
      valid: {
        label: 'Requests',
        valueType: 'number',
        unit: 'number',
        chart: 'step',
        source: { url: 'http://metrics.example.internal/metrics' },
        prometheus: { name: 'http_requests_total', labels: undefined, reduce: 'sum' }
      }
    })
  })

  it('parses numeric for_each metrics with bounded child request definitions', () => {
    const config = getConfig()
    config.configFile = writeConfig(`
service:
  custom_metrics:
    library:
      label: Library items
      unit: count
      source: { url: https://service.example.com/sections }
      for_each:
        items: '[.sections[] | .id]'
        request: { url: 'https://service.example.com/sections/{item}/items' }
        value: .total
        reduce: sum
    invalid:
      label: Invalid
      value_type: string
      source: { url: https://service.example.com/sections }
      for_each:
        items: .sections
        request: { url: 'https://service.example.com/sections/items' }
        value: .total
        reduce: sum
`)

    const metrics = loadYamlConfig(config).config.services.service?.customMetrics
    expect(metrics?.library).toMatchObject({
      valueType: 'number', unit: 'count',
      forEach: {
        items: { expression: '[.sections[] | .id]' },
        requestUrl: 'https://service.example.com/sections/{item}/items',
        value: { expression: '.total' },
        reduce: 'sum'
      }
    })
    expect(metrics?.invalid).toBeUndefined()
  })

  it('supports text metrics and custom numeric suffixes', () => {
    const config = getConfig()
    config.configFile = writeConfig(`
service:
  custom_metrics:
    build:
      label: Build
      value_type: string
      source: { url: https://metrics.example.internal/metrics }
      prometheus: { name: build_info, value_label: version }
    temperature:
      label: Temperature
      unit: { suffix: rpm }
      chart: none
      source: { url: https://metrics.example.internal/data }
      jq: .rpm
    invalid_chart:
      label: Invalid chart
      chart: scatter
      source: { url: https://metrics.example.internal/data }
      jq: .value
    invalid_text:
      label: Invalid text
      value_type: string
      unit: count
      source: { url: https://metrics.example.internal/data }
      jq: .value
`)

    expect(loadYamlConfig(config).config.services.service?.customMetrics).toEqual({
      build: {
        label: 'Build',
        valueType: 'string',
        source: { url: 'https://metrics.example.internal/metrics' },
        prometheus: { name: 'build_info', valueLabel: 'version' }
      },
      temperature: {
        label: 'Temperature',
        valueType: 'number',
        unit: { suffix: 'rpm' },
        chart: 'none',
        source: { url: 'https://metrics.example.internal/data' },
        jq: { expression: '.rpm' }
      }
    })
  })

  it('groups compatible numeric metrics into a shared chart', () => {
    const config = getConfig()
    config.configFile = writeConfig(`
service:
  custom_metrics:
    read_rate:
      label: Read
      unit: bytes_per_second
      chart: line
      chart_group: disk_io
      source: { url: https://metrics.example.internal/stats }
      jq: .read
    write_rate:
      label: Write
      unit: bytes_per_second
      chart: line
      chart_group: disk_io
      source: { url: https://metrics.example.internal/stats }
      jq: .write
`)

    const service = loadYamlConfig(config).config.services.service
    expect(service?.customMetrics).toMatchObject({
      read_rate: { chartGroup: 'disk_io' },
      write_rate: { chartGroup: 'disk_io' }
    })
  })

  it('rejects incompatible chart group members', () => {
    const config = getConfig()
    config.configFile = writeConfig(`
service:
  custom_metrics:
    requests:
      label: Requests
      unit: count
      chart: line
      chart_group: traffic
      source: { url: https://metrics.example.internal/stats }
      jq: .requests
    bytes:
      label: Bytes
      unit: bytes
      chart: line
      chart_group: traffic
      source: { url: https://metrics.example.internal/stats }
      jq: .bytes
`)

    const service = loadYamlConfig(config).config.services.service
    expect(service?.customMetrics).toBeUndefined()
    expect(service?.customMetricErrors?.requests).toBe('chart_group traffic metrics must use the same unit and chart')
    expect(service?.customMetricErrors?.bytes).toBe('chart_group traffic metrics must use the same unit and chart')
  })

  it('clears the error after the file is fixed', () => {
    const config = getConfig()
    const configPath = writeConfig('bad: [unclosed\n')
    config.configFile = configPath

    expect(loadYamlConfig(config).error).toBeDefined()

    fs.writeFileSync(configPath, 'a:\n  url: https://a.example.com\n')

    const result = loadYamlConfig(config)
    expect(result.error).toBeUndefined()
    expect(result.config.services.a).toEqual({ url: 'https://a.example.com' })
  })
})
