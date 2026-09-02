import { useEffect, useEffectEvent } from 'react'
import type { Card } from '@/lib/docker'
import { realtimeClient } from '@/lib/realtime-client'
import type { RealtimeMetricsResponse } from '@/lib/realtime-protocol'
import type { ContainerStatus } from '@/lib/status'

export function mergeStatuses(cards: Card[], statuses: Record<string, ContainerStatus>): Card[] {
  return cards.map((card) => {
    if (!card.hasContainer) return card
    const status = statuses[card.id]
    if (!status) return card.state === undefined && card.health === undefined ? card : { ...card, state: undefined, health: undefined }
    return card.state === status.state && card.health === status.health ? card : { ...card, ...status }
  })
}

export function useRealtimeStatus({
  enabled,
  setCards,
  setUnavailable,
  setLoading
}: {
  enabled: boolean
  setCards: (update: (prev: Card[]) => Card[]) => void
  setUnavailable: (unavailable: boolean) => void
  setLoading: (loading: boolean) => void
}): void {
  useEffect(() => {
    if (!enabled) return
    setLoading(true)
    return realtimeClient.retainStatus(
      (statuses) => {
        setCards((cards) => mergeStatuses(cards, statuses))
        setLoading(false)
      },
      (unavailable) => setUnavailable(unavailable)
    )
  }, [enabled, setCards, setLoading, setUnavailable])
}

export function useRealtimeMetrics(cardId: string, active: boolean, onMetrics: (metrics: RealtimeMetricsResponse) => void, onUnavailable: (unavailable: boolean) => void): void {
  const handleMetrics = useEffectEvent(onMetrics)
  const handleUnavailable = useEffectEvent(onUnavailable)

  useEffect(() => {
    if (!active) return
    return realtimeClient.retainMetrics(cardId, handleMetrics, handleUnavailable)
  }, [active, cardId])
}
