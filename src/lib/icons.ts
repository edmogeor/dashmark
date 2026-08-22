import fs from 'node:fs'
import path from 'node:path'
import type { AppConfig } from './config'
import { getInitials } from './initials'
import { isValidUrl } from './labels'
import { isOutsideDirectory } from './paths'
import { fetchSelfhstIcons, fuzzyMatchIcon, type SelfhstIcon } from './selfhst'
import { logger } from './logger'
import { logMessages } from './log-messages'
import { SELFHST_CDN, SELFHST_PREFIX } from './constants'
import { analyzeIconLuminance, type IconContrast } from './icon-luminance'
import { getServiceCandidates, normalizeServiceCandidate } from './service-candidates'

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

function isSelfhstReference(value: string): boolean {
  return value.toLowerCase().startsWith(SELFHST_PREFIX)
}

function resolveSelfhstReference(value: string, icons: SelfhstIcon[]): string | null {
  const reference = normalizeServiceCandidate(value)
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
  | { type: 'image'; src: string; alt: string; contrast?: IconContrast }
  | { type: 'placeholder'; initials: string }

async function imageIcon(src: string, alt: string): Promise<IconResult> {
  const contrast = src.startsWith(SELFHST_CDN) ? (await analyzeIconLuminance(src)) ?? undefined : undefined
  return { type: 'image', src, alt, contrast }
}

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

  if (normalizedLabel === 'placeholder') {
    return makePlaceholder(title)
  }

  if (iconLabel) {
    if (looksLikeUrl(iconLabel) && isValidUrl(iconLabel)) {
      return imageIcon(iconLabel, title)
    }

    if (isSelfhstReference(iconLabel)) {
      const reference = iconLabel.slice(SELFHST_PREFIX.length)
      const icons = await fetchSelfhstIcons()
      const selfhstUrl = resolveSelfhstReference(reference, icons)
      if (selfhstUrl) return imageIcon(selfhstUrl, title)

      logger.warn('icons', logMessages.icons.selfhstReferenceNotFound, { iconLabel })
      return makePlaceholder(title)
    }

    const src = resolveFileIcon(config, iconLabel)
    if (src) {
      return { type: 'image', src, alt: title }
    }
    return makePlaceholder(title)
  }

  if (!config.enableAutomaticIcons) {
    return makePlaceholder(title)
  }

  const icons = await fetchSelfhstIcons()
  const candidates = getServiceCandidates(imageName, containerName, title)
  const match = fuzzyMatchIcon(candidates, icons)
  if (match) {
    return imageIcon(match.url, title)
  }

  return makePlaceholder(title)
}

function makePlaceholder(title: string): IconResult {
  return { type: 'placeholder', initials: getInitials(title) }
}
