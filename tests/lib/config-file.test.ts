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
  it('ignores malformed service fields instead of returning unsafe values', () => {
    const config = getConfig()
    config.configFile = writeConfig(`
valid:
  url: https://valid.example.com
  order: 2
  show_status: false
  access: [admins]
invalid:
  hidden: "false"
  access: admins
not-a-service: null
`)

    expect(loadYamlConfig(config)).toEqual({
      config: {
        valid: {
          url: 'https://valid.example.com',
          order: 2,
          showStatus: false,
           access: ['admins']
        },
        invalid: {}
      }
    })
  })

  it('returns an empty config with no error when the file is missing', () => {
    const config = getConfig()
    config.configFile = path.join(os.tmpdir(), 'definitely-missing-config.yml')

    expect(loadYamlConfig(config)).toEqual({ config: {} })
  })

  it('returns an error for malformed YAML', () => {
    const config = getConfig()
    config.configFile = writeConfig('bad: [unclosed\n')

    const result = loadYamlConfig(config)

    expect(result.config).toEqual({})
    expect(result.error?.code).toBe('CONFIG_INVALID')
    expect(result.error?.message).toBeDefined()
  })

  it('re-reads the config when the file changes', () => {
    const config = getConfig()
    const configPath = writeConfig('a:\n  url: https://a.example.com\n')
    config.configFile = configPath

    expect(loadYamlConfig(config).config.a).toEqual({ url: 'https://a.example.com' })

    fs.writeFileSync(configPath, 'b:\n  url: https://b.example.com\n  title: B\n')

    const result = loadYamlConfig(config)
    expect(result.config.b).toEqual({ url: 'https://b.example.com', title: 'B' })
    expect(result.config.a).toBeUndefined()
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
      json:
        path: /records
        value_path: /queue/size
        reduce: sum
`)

    expect(loadYamlConfig(config).config.radarr?.customMetrics).toEqual({
      active_downloads: {
        label: 'Active downloads',
        valueType: 'number',
        unit: 'count',
        chart: 'line',
        source: {
          url: 'http://metrics.example.internal/radarr',
          headers: { 'X-Api-Key': { env: 'RADARR_API_KEY' } }
        },
        json: { path: '/records', valuePath: '/queue/size', reduce: 'sum' }
      }
    })
    expect(loadYamlConfig(config).config.radarr?.metrics).toEqual(['cpu', 'active_downloads'])
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
      json: { path: /value }
      prometheus: { name: value }
    invalid_pointer:
      label: Invalid pointer
      source: { url: http://metrics.example.internal/metrics }
      json: { path: value }
`)

    expect(loadYamlConfig(config).config.service?.customMetrics).toEqual({
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
      json: { path: /rpm }
    invalid_chart:
      label: Invalid chart
      chart: scatter
      source: { url: https://metrics.example.internal/data }
      json: { path: /value }
    invalid_text:
      label: Invalid text
      value_type: string
      unit: count
      source: { url: https://metrics.example.internal/data }
      json: { path: /value }
`)

    expect(loadYamlConfig(config).config.service?.customMetrics).toEqual({
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
        json: { path: '/rpm', valuePath: undefined, reduce: undefined }
      }
    })
  })

  it('clears the error after the file is fixed', () => {
    const config = getConfig()
    const configPath = writeConfig('bad: [unclosed\n')
    config.configFile = configPath

    expect(loadYamlConfig(config).error).toBeDefined()

    fs.writeFileSync(configPath, 'a:\n  url: https://a.example.com\n')

    const result = loadYamlConfig(config)
    expect(result.error).toBeUndefined()
    expect(result.config.a).toEqual({ url: 'https://a.example.com' })
  })
})
