import { LABEL_PREFIX, TRAEFIK_ROUTER_RULE } from './constants'

export type ParsedLabels = {
  hidden: boolean
  url?: string
  title?: string
  description?: string
  icon?: string
  category?: string
  order?: number
  showStatus?: boolean
  resourceStats?: ResourceStat[]
  metrics?: string[]
  metricProvider?: string
  metricsPollIntervalMs?: number
  metricsHistoryPeriodMs?: number
  access: string[]
  searchAliases: string[]
}

export const RESOURCE_STATS = ['cpu', 'memory', 'network'] as const
export type ResourceStat = typeof RESOURCE_STATS[number]

function parseCommaSeparated(value: string | undefined): string[] {
  return value?.split(',').map(item => item.trim()).filter(Boolean) ?? []
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

function parseMetricProvider(value: string | undefined): string | undefined {
  return value !== undefined && /^[a-z][a-z0-9_-]*$/.test(value) ? value : undefined
}

export function parseResourceStats(value: string | string[] | undefined): ResourceStat[] | undefined {
  if (value === undefined) return undefined
  const values = (typeof value === 'string' ? value.split(',') : value)
    .map(item => item.trim().toLowerCase())
    .filter(Boolean)
  if (values.includes('none')) return []
  return RESOURCE_STATS.filter(stat => values.includes(stat))
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
  const showStatus = parseOptionalBool(get('show_status'))
  const metrics = parseCommaSeparated(get('metrics'))
  const metricProvider = parseMetricProvider(get('metric_provider'))
  const resourceStats = metrics.length > 0 ? parseResourceStats(metrics) : undefined
  const metricsPollIntervalMs = parseInterval(get('metrics_poll_interval'))
  const metricsHistoryPeriodMs = parseInterval(get('metrics_history_period'))
  const access = parseCommaSeparated(get('access'))
  const searchAliases = parseCommaSeparated(get('search_aliases'))

  return {
    hidden,
    url,
    title,
    description,
    icon,
    category,
    order: Number.isFinite(order) ? order : undefined,
    showStatus,
    resourceStats,
    ...(metrics.length > 0 ? { metrics } : {}),
    ...(metricProvider !== undefined ? { metricProvider } : {}),
    ...(metricsPollIntervalMs !== undefined ? { metricsPollIntervalMs } : {}),
    ...(metricsHistoryPeriodMs !== undefined ? { metricsHistoryPeriodMs } : {}),
    access,
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
