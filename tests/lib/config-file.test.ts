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
  it('parses nested service metric configuration', () => {
    const config = getConfig()
    config.configFile = writeConfig(`
service:
  url: https://service.example.test
  metrics:
    collection:
      interval: 30s
      retention: 14d
    container: [cpu, memory]
    catalog:
      test:
        url-parameter:
          inputs:
            resource: garage_door
          overrides:
            display:
              label: Garage door
          visible_to: [admins, operators]
        queue-depth:
    local:
      active_downloads:
        display:
          label: Active downloads
        value:
          unit: count
        source:
          url: http://metrics.example.internal/radarr
        extract:
          jq: '[.records[].queue.size] | add'
`)

    const metrics = loadYamlConfig(config).config.services.service?.metrics as unknown as Record<string, unknown>

    expect(metrics).toMatchObject({
          collection: expect.objectContaining({ intervalMs: expect.anything(), retentionMs: expect.anything() }),
      catalog: expect.objectContaining({
        test: expect.objectContaining({
          'url-parameter': expect.objectContaining({
            inputs: expect.objectContaining({ resource: 'garage_door' }),
            overrides: expect.anything(),
            visibleTo: expect.anything()
          }),
          'queue-depth': {}
        })
      }),
      local: expect.objectContaining({
        active_downloads: expect.objectContaining({
          label: 'Active downloads',
          unit: 'count',
          source: expect.anything(),
          jq: expect.anything()
        })
      })
    })
    expect(metrics.container).toBeDefined()
  })

  it('accepts a mapped container metric configuration', () => {
    const config = getConfig()
    config.configFile = writeConfig(`
service:
  metrics:
    container:
      cpu:
        visible_to: admins
      memory:
        visible_to: [admins, operators]
`)

    const metrics = loadYamlConfig(config).config.services.service?.metrics as unknown as Record<string, unknown>

    expect(metrics.container).toBeDefined()
  })

  it('resolves a local metric source from a shared profile', () => {
    const config = getConfig()
    config.configFile = writeConfig(`
shared_metric_sources:
  home_assistant:
    base_url: http://homeassistant:8123
    authentication:
      kind: token
      header: Authorization
      prefix: "Bearer "
      value: { env: HOME_ASSISTANT_TOKEN }
service:
  metrics:
    local:
      office_temperature:
        display: { label: Office temperature }
        value: { unit: celsius }
        source:
          use: home_assistant
          path: /api/states/sensor.office_temperature
        extract: { jq: '.state | tonumber' }
`)

    const metric = loadYamlConfig(config).config.services.service?.metrics?.local?.office_temperature

    expect(metric?.source).toMatchObject({
      url: 'http://homeassistant:8123/api/states/sensor.office_temperature',
      auth: { type: 'token', header: 'Authorization', prefix: 'Bearer ', value: { env: 'HOME_ASSISTANT_TOKEN' } }
    })
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

  it('returns an empty config with no error when the file is missing', () => {
    const config = getConfig()
    config.configFile = path.join(os.tmpdir(), 'definitely-missing-config.yml')

    expect(loadYamlConfig(config)).toEqual({ config: { settings: {}, services: {} } })
  })

  it('returns an error for malformed YAML', () => {
    const config = getConfig()
    config.configFile = writeConfig('bad: [unclosed\n')

    const result = loadYamlConfig(config)

    expect(result.config).toEqual({ settings: {}, services: {} })
    expect(result.error?.code).toBe('CONFIG_INVALID')
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
})
