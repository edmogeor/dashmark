import { LABEL_PREFIX, TRAEFIK_ROUTER_RULE } from './constants'

export type ParsedLabels = {
  hidden: boolean
  url?: string
  title?: string
  description?: string
  icon?: string
  category?: string
  order?: number
  accessGroups: string[]
  searchAliases: string[]
}

function parseCommaSeparated(value: string | undefined): string[] {
  return value?.split(',').map(item => item.trim()).filter(Boolean) ?? []
}

export function parseLabels(labels: Record<string, string>): ParsedLabels {
  const get = (key: string): string | undefined => labels[`${LABEL_PREFIX}.${key}`]

  const hidden = get('hidden')?.toLowerCase() === 'true'
  const url = get('url')
  const title = get('title')
  const description = get('description')
  const icon = get('icon')
  const category = get('category')
  const orderRaw = get('order')
  const order = orderRaw !== undefined ? Number(orderRaw) : undefined
  const accessGroups = parseCommaSeparated(get('access_groups'))
  const searchAliases = parseCommaSeparated(get('search_aliases'))

  return {
    hidden,
    url,
    title,
    description,
    icon,
    category,
    order: Number.isFinite(order) ? order : undefined,
    accessGroups,
    searchAliases
  }
}

export function hasDashmarkLabels(labels: Record<string, string>): boolean {
  return Object.keys(labels).some(key => key.startsWith(`${LABEL_PREFIX}.`))
}

export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && Boolean(parsed.hostname)
  } catch {
    return false
  }
}

function extractTraefikHost(rule: string): string | undefined {
  for (const block of rule.matchAll(/Host\(([^)]*)\)/g)) {
    const host = /`([^`]+)`/.exec(block[1])
    if (host) return host[1]
  }
  return undefined
}

export function traefikUrl(labels: Record<string, string>): string | undefined {
  for (const [key, value] of Object.entries(labels)) {
    if (!TRAEFIK_ROUTER_RULE.test(key)) continue
    const host = extractTraefikHost(value)
    if (host) return `https://${host}`
  }
  return undefined
}
