import { getConfig, type AppConfig } from './config'
import { getDiscoveryCoordinator } from './discovery-coordinator'
import { startMetricsCollection } from './metrics'
import { getRealtimeServer, type RealtimeServer } from './realtime-server'
import { getSelfhstIconCache, type SelfhstIconCache } from './selfhst-icon-cache'
import type { Card } from './docker'

export type Runtime = {
  config: AppConfig
  realtime: RealtimeServer
  iconCache: SelfhstIconCache
}

declare global {
  var __dashmarkRuntime: Runtime | undefined
}

function cachedIconSources(cards: readonly Card[]): string[] {
  return cards.flatMap((card) => (card.icon.type === 'image' ? [card.icon.src, card.icon.darkSrc, card.icon.lightSrc].filter((source): source is string => Boolean(source)) : []))
}

export function initializeRuntime(): Runtime {
  if (globalThis.__dashmarkRuntime) return globalThis.__dashmarkRuntime

  const config = getConfig()
  const iconCache = getSelfhstIconCache()
  const coordinator = getDiscoveryCoordinator(config)
  coordinator.onCardsChange((_cardIds, cards) => {
    iconCache.prune(cachedIconSources(cards))
  })
  coordinator.start()
  startMetricsCollection(config)
  return (globalThis.__dashmarkRuntime = { config, realtime: getRealtimeServer(config), iconCache })
}
