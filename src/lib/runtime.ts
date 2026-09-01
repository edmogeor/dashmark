import { getConfig, type AppConfig } from './config'
import { getDiscoveryCoordinator } from './discovery-coordinator'
import { startMetricsCollection } from './metrics'
import { getRealtimeServer, type RealtimeServer } from './realtime-server'

export type Runtime = {
  config: AppConfig
  realtime: RealtimeServer
}

declare global {
  var __dashmarkRuntime: Runtime | undefined
}

export function initializeRuntime(): Runtime {
  if (globalThis.__dashmarkRuntime) return globalThis.__dashmarkRuntime

  const config = getConfig()
  getDiscoveryCoordinator(config).start()
  startMetricsCollection(config)
  return (globalThis.__dashmarkRuntime = { config, realtime: getRealtimeServer(config) })
}
