import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import { getConfig } from '@/lib/config'
import { resolveIcon } from '@/lib/icons'

const { source } = vi.hoisted(() => ({ source: vi.fn() }))

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn()
  }
}))

vi.mock('@/lib/selfhst-icon-cache', () => ({
  getSelfhstIconCache: () => ({ source })
}))

describe('resolveIcon', () => {
  const config = getConfig()
  config.iconsDir = '/app/icons'

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ name: 'plex.svg' }, { name: 'grafana.svg' }]), { status: 200 }))
    source.mockImplementation((url: string) => (url.endsWith('-light.svg') || url.endsWith('-dark.svg') ? null : '/api/selfhst-icons/cached.svg'))
    vi.mocked(fs.readFileSync).mockImplementation(
      (filePath) => (String(filePath).endsWith('icon-contrast.json') ? JSON.stringify({ 'https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/plex.svg': 'dark' }) : undefined) as never
    )
  })

  afterEach(() => {
    vi.resetAllMocks()
    config.enableAutomaticIcons = true
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

  it('resolves a selfhst reference to the local cache', async () => {
    const result = await resolveIcon(config, {
      iconLabel: 'selfhst:PlEx',
      title: 'Plex',
      containerName: 'plex'
    })
    expect(result).toEqual({
      type: 'image',
      src: '/api/selfhst-icons/cached.svg',
      alt: 'Plex',
      contrast: 'dark'
    })
  })

  it('keeps selfhst URLs remote when building the static demo', async () => {
    const result = await resolveIcon(config, {
      iconLabel: 'selfhst:plex',
      title: 'Plex',
      containerName: 'plex',
      cacheSelfhst: false
    })

    expect(result).toEqual({
      type: 'image',
      src: 'https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/plex.svg',
      alt: 'Plex',
      contrast: 'dark'
    })
    expect(source).not.toHaveBeenCalled()
  })

  it('returns a placeholder for an unknown selfhst reference', async () => {
    const result = await resolveIcon(config, {
      iconLabel: 'selfhst:unknown',
      title: 'Plex',
      containerName: 'plex'
    })
    expect(result).toEqual({ type: 'placeholder', initials: 'P' })
  })

  it('treats a bare name as a path inside ICONS_DIR', async () => {
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

  it('resolves a subdirectory path inside ICONS_DIR', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)

    const result = await resolveIcon(config, {
      iconLabel: 'media/plex.svg',
      title: 'Plex',
      containerName: 'plex'
    })
    expect(result).toEqual({
      type: 'image',
      src: '/icons/media/plex.svg',
      alt: 'Plex'
    })
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
      src: '/api/selfhst-icons/cached.svg',
      alt: 'Plex',
      contrast: 'dark'
    })
  })

  it('skips automatic matching when enableAutomaticIcons is false', async () => {
    config.enableAutomaticIcons = false

    const result = await resolveIcon(config, {
      imageName: 'linuxserver/plex',
      title: 'Plex',
      containerName: 'plex'
    })
    expect(result).toEqual({ type: 'placeholder', initials: 'P' })
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
