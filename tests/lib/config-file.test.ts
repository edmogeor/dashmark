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
services:
  valid:
    url: https://valid.example.com
    order: 2
    access_groups: [admins]
  invalid:
    hidden: "false"
    access_groups: admins
  not-a-service: null
`)

    expect(loadYamlConfig(config)).toEqual({
      config: {
        services: {
          valid: {
            url: 'https://valid.example.com',
            order: 2,
            access_groups: ['admins']
          },
          invalid: {}
        }
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
    config.configFile = writeConfig('services:\n  bad: [unclosed\n')

    const result = loadYamlConfig(config)

    expect(result.config).toEqual({})
    expect(result.error?.code).toBe('CONFIG_INVALID')
    expect(result.error?.message).toBeDefined()
  })

  it('re-reads the config when the file changes', () => {
    const config = getConfig()
    const configPath = writeConfig('services:\n  a:\n    url: https://a.example.com\n')
    config.configFile = configPath

    expect(loadYamlConfig(config).config.services?.a).toEqual({ url: 'https://a.example.com' })

    fs.writeFileSync(configPath, 'services:\n  b:\n    url: https://b.example.com\n    title: B\n')

    const result = loadYamlConfig(config)
    expect(result.config.services?.b).toEqual({ url: 'https://b.example.com', title: 'B' })
    expect(result.config.services?.a).toBeUndefined()
  })

  it('clears the error after the file is fixed', () => {
    const config = getConfig()
    const configPath = writeConfig('services: [unclosed\n')
    config.configFile = configPath

    expect(loadYamlConfig(config).error).toBeDefined()

    fs.writeFileSync(configPath, 'services:\n  a:\n    url: https://a.example.com\n')

    const result = loadYamlConfig(config)
    expect(result.error).toBeUndefined()
    expect(result.config.services?.a).toEqual({ url: 'https://a.example.com' })
  })
})
