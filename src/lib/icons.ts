import fs from 'node:fs'
import path from 'node:path'
import type { AppConfig } from './config'
import { getInitials } from './initials'
import { isValidUrl } from './labels'
import { isOutsideDirectory } from './paths'
import { fetchSelfhstIcons, fuzzyMatchIcon, type SelfhstIcon } from './selfhst'
import { logger } from './logger'
import { logMessages } from './log-messages'

const IMAGE_SUFFIXES = ['-server', '-client', '-web', '-app', '-service', '-core', '-api', '-docker', '-ce', '-ee']

function stripSuffix(name: string): string[] {
  const results: string[] = []
  for (const suffix of IMAGE_SUFFIXES) {
    if (name.endsWith(suffix) && name.length > suffix.length) {
      results.push(name.slice(0, -suffix.length))
    }
  }
  return results
}

function normalizeCandidate(value: string): string {
  return value.toLowerCase().replace(/[_.]/g, '-').replace(/[^a-z0-9-]/g, '')
}

function getImageCandidates(
  imageName: string | undefined,
  containerName: string,
  title: string
): string[] {
  const candidates = new Set<string>()

  const add = (value: string | undefined) => {
    if (!value) return
    const normalized = normalizeCandidate(value)
    if (normalized) candidates.add(normalized)
  }

  if (imageName) {
    const base = imageName.split('/').pop() ?? imageName
    const withoutTag = base.split(':')[0]
    add(withoutTag)
    for (const variant of stripSuffix(withoutTag)) add(variant)
  }

  add(containerName)
  add(title.split(/[^a-zA-Z0-9]+/)[0])

  return [...candidates]
}

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

function looksLikeFile(value: string): boolean {
  return /\.[a-zA-Z0-9]{2,6}$/.test(value)
}

function resolveSelfhstReference(value: string, icons: SelfhstIcon[]): string | null {
  const reference = normalizeCandidate(value)
  return icons.find(icon => icon.reference === reference)?.url ?? null
}

function resolveFileIcon(config: AppConfig, value: string): string | null {
  const iconsDir = path.resolve(config.iconsDir)
  const filePath = path.resolve(iconsDir, value)
  if (isOutsideDirectory(iconsDir, filePath)) {
    logger.warn('icons', logMessages.icons.invalidPath, { value })
    return null
  }

  if (fs.existsSync(filePath)) {
    const relativePath = path.relative(iconsDir, filePath)
    return `/icons/${relativePath.split(path.sep).join('/')}`
  }
  logger.warn('icons', logMessages.icons.fileNotFound, { filePath })
  return null
}

export type IconResult =
  | { type: 'image'; src: string; alt: string }
  | { type: 'placeholder'; initials: string }
  | { type: 'none' }

export async function resolveIcon(
  config: AppConfig,
  options: {
    iconLabel?: string
    imageName?: string
    title: string
    containerName: string
  }
): Promise<IconResult> {
  const { iconLabel, imageName, title, containerName } = options
  const normalizedLabel = iconLabel?.toLowerCase()

  if (normalizedLabel === 'none') {
    return { type: 'none' }
  }

  if (normalizedLabel === 'placeholder') {
    return makePlaceholder(title)
  }

  if (iconLabel) {
    if (looksLikeUrl(iconLabel) && isValidUrl(iconLabel)) {
      return { type: 'image', src: iconLabel, alt: title }
    }

    if (looksLikeFile(iconLabel)) {
      const src = resolveFileIcon(config, iconLabel)
      if (src) {
        return { type: 'image', src, alt: title }
      }
      return makePlaceholder(title)
    }
  }

  if (!iconLabel && config.disableAutomaticIcons) {
    return makePlaceholder(title)
  }

  const icons = await fetchSelfhstIcons(config.iconsCdn)

  if (iconLabel) {
    const selfhstUrl = resolveSelfhstReference(iconLabel, icons)
    if (selfhstUrl) {
      return { type: 'image', src: selfhstUrl, alt: title }
    }

    logger.warn('icons', logMessages.icons.selfhstReferenceNotFound, { iconLabel })
    return makePlaceholder(title)
  }

  const candidates = getImageCandidates(imageName, containerName, title)
  const match = fuzzyMatchIcon(candidates, icons)
  if (match) {
    return { type: 'image', src: match.url, alt: title }
  }

  return makePlaceholder(title)
}

function makePlaceholder(title: string): IconResult {
  return { type: 'placeholder', initials: getInitials(title) }
}
