import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getConfig } from '@/lib/config'
import { clearDescriptionCache, resolveDescription } from '@/lib/descriptions'

vi.mock('node:fs', () => ({
  default: { readFileSync: vi.fn() }
}))

const descriptions = [
  {
    reference: 'plex',
    name: 'Plex',
    description: 'Centralized home media playback system with a powerful central server.'
  },
  {
    reference: 'actual',
    name: 'Actual',
    description: 'Local-first personal finance tool.'
  },
  {
    reference: 'home-assistant',
    name: 'Home Assistant',
    description: 'Open source home automation that puts local control and privacy first.'
  }
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

  it('matches an image name to an Awesome Selfhosted description', () => {
    expect(resolveDescription(config, {
      imageName: 'plexinc/pms-docker:latest',
      title: 'Plex',
      containerName: 'plex'
    })).toBe('Centralized home media playback system with a powerful central server.')
  })

  it('matches a service name when no image is available', () => {
    expect(resolveDescription(config, {
      title: 'Actual Budget',
      containerName: 'actual'
    })).toBe('Local-first personal finance tool.')
  })

  it('matches a multi-word service title using a kebab-case reference', () => {
    expect(resolveDescription(config, {
      title: 'Home Assistant',
      containerName: 'homeassistant'
    })).toBe('Open source home automation that puts local control and privacy first.')
  })

  it('skips matching when automatic descriptions are disabled', () => {
    config.enableAutomaticDescriptions = false
    expect(resolveDescription(config, {
      imageName: 'plexinc/pms-docker:latest',
      title: 'Plex',
      containerName: 'plex'
    })).toBeUndefined()
  })
})
