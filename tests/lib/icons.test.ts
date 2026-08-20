import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import { getConfig } from '@/lib/config'
import { resolveIcon } from '@/lib/icons'

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn()
  }
}))

describe('resolveIcon', () => {
  const config = getConfig()
  config.iconsDir = '/app/icons'

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { name: 'plex.svg' },
        { name: 'grafana.svg' }
      ]
    } as Response)
  })

  afterEach(() => {
    vi.resetAllMocks()
    config.disableAutomaticIcons = false
  })

  it('returns placeholder for icon=none', async () => {
    const result = await resolveIcon(config, {
      iconLabel: 'none',
      title: 'Plex',
      containerName: 'plex'
    })
    expect(result).toEqual({ type: 'placeholder', initials: 'P' })
  })

  it('returns placeholder for icon=placeholder', async () => {
    const result = await resolveIcon(config, {
      iconLabel: 'placeholder',
      title: 'Plex',
      containerName: 'plex'
    })
    expect(result).toEqual({ type: 'placeholder', initials: 'P' })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('uses direct URL for http icons', async () => {
    const result = await resolveIcon(config, {
      iconLabel: 'https://example.com/icon.svg',
      title: 'Plex',
      containerName: 'plex'
    })
    expect(result).toEqual({
      type: 'image',
      src: 'https://example.com/icon.svg',
      alt: 'Plex'
    })
  })

  it('resolves selfhst reference to CDN URL', async () => {
    const result = await resolveIcon(config, {
      iconLabel: 'selfhst:plex',
      title: 'Plex',
      containerName: 'plex'
    })
    expect(result).toEqual({
      type: 'image',
      src: 'https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/plex.svg',
      alt: 'Plex'
    })
  })

  it('treats a bare name as a custom file, not a selfhst reference', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)

    const result = await resolveIcon(config, {
      iconLabel: 'plex',
      title: 'Plex',
      containerName: 'plex'
    })
    expect(result).toEqual({
      type: 'image',
      src: '/icons/plex',
      alt: 'Plex'
    })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('resolves custom file icon when present', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)

    const result = await resolveIcon(config, {
      iconLabel: 'custom.png',
      title: 'Plex',
      containerName: 'plex'
    })
    expect(result).toEqual({
      type: 'image',
      src: '/icons/custom.png',
      alt: 'Plex'
    })
  })

  it('falls back to placeholder for missing custom file', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)

    const result = await resolveIcon(config, {
      iconLabel: 'missing.png',
      title: 'Plex',
      containerName: 'plex'
    })
    expect(result).toEqual({ type: 'placeholder', initials: 'P' })
  })

  it('auto-matches container image to selfhst icon', async () => {
    const result = await resolveIcon(config, {
      imageName: 'linuxserver/plex',
      title: 'Plex',
      containerName: 'plex'
    })
    expect(result).toEqual({
      type: 'image',
      src: 'https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/plex.svg',
      alt: 'Plex'
    })
  })

  it('skips automatic matching when disableAutomaticIcons is set', async () => {
    config.disableAutomaticIcons = true

    const result = await resolveIcon(config, {
      imageName: 'linuxserver/plex',
      title: 'Plex',
      containerName: 'plex'
    })
    expect(result).toEqual({ type: 'placeholder', initials: 'P' })
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
