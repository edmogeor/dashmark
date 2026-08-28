import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getConfig } from '@/lib/config'
import { clearDescriptionCache, resolveDescription } from '@/lib/descriptions'

vi.mock('node:fs', () => ({
  default: { readFileSync: vi.fn() }
}))

const descriptions = [
  { reference: 'plex', name: 'Plex', description: 'Media server' },
  { reference: 'code-server', name: 'code-server', description: 'Remote development with VS Code' },
  { reference: 'home-assistant', name: 'Home Assistant', description: 'Home automation focused on privacy' }
]

describe('resolveDescription', () => {
  const config = getConfig()

  beforeEach(() => {
    clearDescriptionCache()
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(descriptions))
  })

  afterEach(() => {
    vi.resetAllMocks()
    config.enableAutomaticDescriptions = true
  })

  it('matches an image name to a selfh.st description', () => {
    expect(
      resolveDescription(config, {
        imageName: 'plexinc/pms-docker:latest',
        title: 'Plex',
        containerName: 'plex'
      })
    ).toBe('Media server')
  })

  it('matches a multi-word service title using a kebab-case reference', () => {
    expect(
      resolveDescription(config, {
        title: 'Home Assistant',
        containerName: 'homeassistant'
      })
    ).toBe('Home automation focused on privacy')
  })

  it('does not use an unrelated partial match', () => {
    expect(
      resolveDescription(config, {
        title: 'Code',
        containerName: 'code'
      })
    ).toBeUndefined()
  })

  it('skips matching when automatic descriptions are disabled', () => {
    config.enableAutomaticDescriptions = false
    expect(
      resolveDescription(config, {
        imageName: 'plexinc/pms-docker:latest',
        title: 'Plex',
        containerName: 'plex'
      })
    ).toBeUndefined()
  })
})
