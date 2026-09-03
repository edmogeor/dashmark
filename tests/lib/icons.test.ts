import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getConfig } from '@/lib/config'
import { getIconContrast } from '@/lib/icon-contrast'
import { resolveIcon } from '@/lib/icons'

vi.mock('@/lib/icon-contrast', () => ({ getIconContrast: vi.fn() }))

describe('resolveIcon', () => {
  const config = getConfig()
  let iconsDirectory: string

  beforeEach(() => {
    iconsDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'dashmark-icons-'))
    config.iconsDir = iconsDirectory
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ name: 'plex.svg' }, { name: 'grafana.svg' }]), { status: 200 }))
    vi.mocked(getIconContrast).mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.resetAllMocks()
    config.enableAutomaticIcons = true
    fs.rmSync(iconsDirectory, { recursive: true, force: true })
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
    expect(result).toMatchObject({ type: 'image', alt: 'Plex' })
    expect(result.type === 'image' && result.src).toMatch(/^\/api\/selfhst-icons\/[a-f0-9]{64}\.svg$/)
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
      alt: 'Plex'
    })
  })

  it('uses a contrasting selfhst SVG variant when one is available', async () => {
    vi.mocked(getIconContrast).mockReturnValue('dark')

    const result = await resolveIcon(config, {
      iconLabel: 'https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/portainer.svg',
      title: 'Portainer',
      containerName: 'portainer',
      cacheSelfhst: false
    })

    expect(result).toEqual({
      type: 'image',
      src: 'https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/portainer.svg',
      alt: 'Portainer',
      contrast: 'dark',
      lightSrc: 'https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/portainer-light.svg'
    })
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
    fs.writeFileSync(path.join(iconsDirectory, 'plex'), '')

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
    fs.mkdirSync(path.join(iconsDirectory, 'media'))
    fs.writeFileSync(path.join(iconsDirectory, 'media', 'plex.svg'), '')

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
    fs.writeFileSync(path.join(iconsDirectory, 'custom.png'), '')

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
    expect(result).toMatchObject({ type: 'image', alt: 'Plex' })
    expect(result.type === 'image' && result.src).toMatch(/^\/api\/selfhst-icons\/[a-f0-9]{64}\.svg$/)
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
