import type { AppConfig } from './config'
import { canViewMetric, filterCardsByAccess, getDiscoveredCards, missingAccessIdentity, watchContainerEvents, type Card, type ContainerMetricUsage } from './docker'
import type { DashmarkError } from './errors'
import type { ContainerStatus } from './status'
import { refreshMetricRetention } from './metrics-storage'
import { DISCOVERY_EVENT_DEBOUNCE_MS } from './constants'

type StatusSnapshot = { statuses: Record<string, ContainerStatus>; error?: DashmarkError }

export type DiscoveryCoordinator = {
  start(): void
  ready(): Promise<void>
  getStatusSnapshot(headers: Headers): StatusSnapshot
  getMetricAccess(headers: Headers, cardId: string): ContainerMetricUsage | undefined
  onStatusChange(listener: (cardId: string, status: ContainerStatus) => void): () => void
  onCardsChange(listener: (cardIds: ReadonlySet<string>, cards: readonly Card[]) => void): () => void
  publishMetrics(cardId: string): void
  onMetricsChange(listener: (cardId: string) => void): () => void
  clear(): void
}

function statusesFor(cards: readonly Card[], showStatus: boolean): Record<string, ContainerStatus> {
  if (!showStatus) return {}
  return Object.fromEntries(cards.flatMap((card) => (card.hasContainer ? [[card.id, { state: card.state, health: card.health }]] : [])))
}

function createDiscoveryCoordinator(config: AppConfig): DiscoveryCoordinator {
  let cards: Card[] = []
  let statuses: Record<string, ContainerStatus> = {}
  let error: DashmarkError | undefined
  let refreshTimer: ReturnType<typeof setTimeout> | undefined
  let stopWatching: (() => void) | undefined
  let started = false
  let initialRefresh = Promise.resolve()
  const listeners = new Set<(cardId: string, status: ContainerStatus) => void>()
  const cardListeners = new Set<(cardIds: ReadonlySet<string>, cards: readonly Card[]) => void>()
  const metricListeners = new Set<(cardId: string) => void>()

  const refresh = async (): Promise<void> => {
    const discovered = await getDiscoveredCards(config)
    if (discovered.error) {
      error = discovered.error
      return
    }
    error = undefined
    cards = discovered.cards
    const cardIds = new Set(cards.map((card) => card.id))
    for (const listener of cardListeners) listener(cardIds, cards)
    refreshMetricRetention(
      config,
      cards
        .filter((card) => card.showStatus !== false)
        .map((card) => ({
          cardId: card.id,
          historyPeriodMs: card.metricsHistoryPeriodMs ?? config.metricsHistoryPeriodMs,
          hasResourceMetrics: (card.resourceStats?.length ?? 0) > 0,
          customMetricKeys: card.customMetricKeys ?? [],
          uptimeMetricKeys: card.uptimeMetricKeys ?? []
        }))
    )
    const next = statusesFor(cards, config.showStatus)
    for (const [cardId, status] of Object.entries(next)) {
      if (JSON.stringify(statuses[cardId]) !== JSON.stringify(status)) {
        for (const listener of listeners) listener(cardId, status)
      }
    }
    statuses = next
  }
  const scheduleRefresh = (): void => {
    if (!started) return
    if (refreshTimer) return
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined
      void refresh()
    }, DISCOVERY_EVENT_DEBOUNCE_MS)
    refreshTimer.unref()
  }

  return {
    start: () => {
      if (started) return
      started = true
      stopWatching = watchContainerEvents(config, scheduleRefresh)
      initialRefresh = refresh()
    },
    ready: () => initialRefresh,
    getStatusSnapshot: (headers) => {
      if (error) return { statuses: {}, error }
      const accessError = missingAccessIdentity(config, headers, cards)
      if (accessError) return { statuses: {}, error: accessError }
      const visible = new Set(filterCardsByAccess(cards, config, headers).map((card) => card.id))
      return { statuses: Object.fromEntries(Object.entries(statuses).filter(([cardId]) => visible.has(cardId))) }
    },
    getMetricAccess: (headers, cardId) => {
      if (!canViewMetric(config, headers, undefined, '')) return undefined
      const card = filterCardsByAccess(cards, config, headers).find((candidate) => candidate.id === cardId)
      if (!card || card.showStatus === false || !config.showMetrics) return undefined
      const hasMetrics = (card.resourceStats?.length ?? 0) > 0 || (card.customMetricLabels?.length ?? 0) > 0 || (card.metricErrors?.length ?? 0) > 0
      if (!hasMetrics) return undefined
      return {
        historyPeriodMs: card.metricsHistoryPeriodMs ?? config.metricsHistoryPeriodMs,
        customMetrics: [],
        metricErrors: card.metricErrors ?? [],
        ...(card.metricsAccess ? { metricsAccess: card.metricsAccess } : {}),
        metricsPollIntervalMs: card.metricsPollIntervalMs ?? config.metricsPollIntervalMs
      }
    },
    onStatusChange: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    onCardsChange: (listener) => {
      cardListeners.add(listener)
      return () => cardListeners.delete(listener)
    },
    publishMetrics: (cardId) => {
      for (const listener of metricListeners) listener(cardId)
    },
    onMetricsChange: (listener) => {
      metricListeners.add(listener)
      return () => metricListeners.delete(listener)
    },
    clear: () => {
      started = false
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = undefined
      stopWatching?.()
      stopWatching = undefined
      cards = []
      statuses = {}
      error = undefined
      listeners.clear()
      cardListeners.clear()
      metricListeners.clear()
    }
  }
}

declare global {
  var __dashmarkDiscoveryCoordinator: DiscoveryCoordinator | undefined
}

export function getDiscoveryCoordinator(config: AppConfig): DiscoveryCoordinator {
  return (globalThis.__dashmarkDiscoveryCoordinator ??= createDiscoveryCoordinator(config))
}
