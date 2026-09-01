import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import type { Locale } from '@/i18n'

type CachedTranslation = {
  signature: string
  label?: string
}

const cachedTranslations = new Map<string, CachedTranslation>()

function translationFile(key: string): string | undefined {
  const segments = key.split('/')
  const metric = segments.pop()
  if (!metric || segments.length === 0 || !segments.every((segment) => /^[a-z][a-z0-9_-]*$/.test(segment)) || !/^[a-z][a-z0-9_-]*$/.test(metric)) return undefined
  return path.resolve(process.env.DASHMARK_METRICS_DIR ?? 'metrics', ...segments, `${metric}.translations.yml`)
}

export function localizeMetricLabel(locale: Locale, key: string, fallback: string): string {
  const file = translationFile(key)
  if (!file) return fallback

  try {
    const stat = fs.statSync(file)
    const signature = `${stat.mtimeMs}:${stat.size}`
    const cached = cachedTranslations.get(file)
    if (cached?.signature === signature) return cached.label ?? fallback

    const document = yaml.load(fs.readFileSync(file, 'utf8'))
    const translation = document && typeof document === 'object' && !Array.isArray(document) ? (document as Record<string, unknown>)[locale] : undefined
    const configuredLabel = translation && typeof translation === 'object' && !Array.isArray(translation) ? (translation as Record<string, unknown>).label : undefined
    const label = typeof configuredLabel === 'string' && configuredLabel.trim() ? configuredLabel : undefined
    cachedTranslations.set(file, { signature, label })
    return label ?? fallback
  } catch {
    return fallback
  }
}
