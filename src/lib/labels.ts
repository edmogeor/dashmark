import { DASHBOARD_ICONS_PREFIX, LABEL_PREFIX, TRAEFIK_ROUTER_RULE } from './constants'

export type ParsedLabels = {
  hidden: boolean
  url?: string
  metricSources?: Record<string, string>
  title?: string
  description?: string
  icon?: string
  category?: string
  order?: number
  showStatus?: boolean
  resourceStats?: ResourceStat[]
  metrics?: string[]
  metricsPollIntervalMs?: number
  metricsHistoryPeriodMs?: number
  metricsAccess?: Record<string, string[]>
  access: string[]
  searchAliases: string[]
}

export const RESOURCE_STATS = ['cpu', 'memory', 'network'] as const
export type ResourceStat = (typeof RESOURCE_STATS)[number]
const METRIC_KEY = /^[a-z][a-z0-9_-]*(?:\/[a-z][a-z0-9_-]*)*$/

function parseCommaSeparated(value: string | undefined): string[] {
  return (
    value
      ?.split(',')
      .map((item) => item.trim())
      .filter(Boolean) ?? []
  )
}

function parseOptionalBool(value: string | undefined): boolean | undefined {
  if (value?.toLowerCase() === 'true') return true
  if (value?.toLowerCase() === 'false') return false
  return undefined
}

function parseInterval(value: string | undefined): number | undefined {
  const seconds = Number(value)
  return Number.isInteger(seconds) && seconds > 0 ? seconds * 1_000 : undefined
}

function homepageIcon(value: string | undefined): string | undefined {
  if (value && isValidUrl(value)) return value
  if (value?.startsWith('//') && isValidUrl(`https:${value}`)) return `https:${value}`
  const selfhst = /^sh-(.+)$/i.exec(value ?? '')
  // selfh.st variants collapse to SVG, retain the requested format if Dashmark adds raster selfh.st support.
  if (selfhst) return `selfhst:${selfhst[1].replace(/\.(svg|png|webp)$/i, '')}`
  const file = /^\/icons\/(.+)$/.exec(value ?? '')
  if (file) return file[1]
  if (/^(?!mdi-|si-)[a-z0-9][a-z0-9-]*(?:\.(svg|png|webp))?$/i.test(value ?? '')) return `${DASHBOARD_ICONS_PREFIX}${value!.replace(/\.(svg|png|webp)$/i, '').toLowerCase()}`
  return undefined
}

export function parseResourceStats(value: string | string[] | undefined): ResourceStat[] | undefined {
  if (value === undefined) return undefined
  const values = (typeof value === 'string' ? value.split(',') : value).map((item) => item.trim().toLowerCase()).filter(Boolean)
  return RESOURCE_STATS.filter((stat) => values.includes(stat))
}

export function parseLabels(labels: Record<string, string>, homepageLabelFallback = false): ParsedLabels {
  const get = (key: string, homepageKey?: string): string | undefined => labels[`${LABEL_PREFIX}.${key}`] ?? (homepageLabelFallback && homepageKey ? labels[`homepage.${homepageKey}`] : undefined)

  const hidden = get('hidden')?.toLowerCase() === 'true'
  const url = get('url', 'href')
  const title = get('title', 'name')
  const description = get('description', 'description')
  const icon = get('icon') ?? (homepageLabelFallback ? homepageIcon(labels['homepage.icon']) : undefined)
  const category = get('category', 'group')
  const orderRaw = get('order', 'weight')
  const order = orderRaw !== undefined ? Number(orderRaw) : undefined
  const showStatus = parseOptionalBool(get('show_status'))
  const requestedMetrics = parseCommaSeparated(get('metrics'))
  const metrics = requestedMetrics.includes('none') ? [] : requestedMetrics
  const resourceStats = metrics.length > 0 ? parseResourceStats(metrics) : undefined
  const metricsPollIntervalMs = parseInterval(get('metrics_poll_interval'))
  const metricsHistoryPeriodMs = parseInterval(get('metrics_history_period'))
  const access = parseCommaSeparated(get('access'))
  const searchAliases = parseCommaSeparated(get('search_aliases'))
  const metricsAccess: Record<string, string[]> = {}
  const metricSources: Record<string, string> = {}
  for (const [key, value] of Object.entries(labels)) {
    const provider = key.slice(`${LABEL_PREFIX}.metrics_source.`.length)
    if (key.startsWith(`${LABEL_PREFIX}.metrics_source.`) && /^[a-z][a-z0-9_-]*$/.test(provider) && isValidUrl(value)) metricSources[provider] = value
    const encodedKey = key.slice(`${LABEL_PREFIX}.metrics_access.`.length)
    if (!key.startsWith(`${LABEL_PREFIX}.metrics_access.`)) continue
    const metric = encodedKey.replaceAll('.', '/')
    if (METRIC_KEY.test(metric)) metricsAccess[metric] = parseCommaSeparated(value)
  }

  return {
    hidden,
    url,
    ...(Object.keys(metricSources).length > 0 ? { metricSources } : {}),
    title,
    description,
    icon,
    category,
    order: Number.isFinite(order) ? order : undefined,
    showStatus,
    resourceStats: requestedMetrics.includes('none') ? [] : resourceStats,
    ...(metrics.length > 0 ? { metrics } : {}),
    ...(metricsPollIntervalMs !== undefined ? { metricsPollIntervalMs } : {}),
    ...(metricsHistoryPeriodMs !== undefined ? { metricsHistoryPeriodMs } : {}),
    ...(Object.keys(metricsAccess).length > 0 ? { metricsAccess } : {}),
    access,
    searchAliases
  }
}

export function hasCardLabels(labels: Record<string, string>, homepageLabelFallback = false): boolean {
  return Object.entries(labels).some(
    ([key, value]) =>
      key.startsWith(`${LABEL_PREFIX}.`) || (homepageLabelFallback && (/^homepage\.(href|name|description|group|weight)$/.test(key) || (key === 'homepage.icon' && homepageIcon(value) !== undefined)))
  )
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
