import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import type { Card } from './docker'
import type { DashmarkError } from './errors'
import { strings } from './strings'
import { STATUS_POLL_INTERVAL_MS, STATUS_TOAST_ID } from './constants'

type StatusMap = Record<string, { state?: string; health?: string }>

type StatusResponse = {
  statuses?: StatusMap
  error?: DashmarkError
}

function mergeStatuses(cards: Card[], statuses: StatusMap): Card[] {
  return cards.map(card => {
    if (!card.hasContainer) return card
    const status = statuses[card.id]
    if (!status) {
      if (card.state === undefined && card.health === undefined) return card
      return { ...card, state: undefined, health: undefined }
    }
    if (card.state === status.state && card.health === status.health) return card
    return { ...card, state: status.state, health: status.health }
  })
}

export function useStatusPolling({
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
  const statusToastDismissed = useRef(false)
  const statusToastRecovering = useRef(false)

  function showStatusToast(description: string) {
    statusToastRecovering.current = false
    if (statusToastDismissed.current) return
    toast.error(strings.errors.statusUpdateFailed, {
      description,
      id: STATUS_TOAST_ID,
      duration: Infinity,
      closeButton: true,
      onDismiss: () => {
        if (statusToastRecovering.current) return
        statusToastDismissed.current = true
      }
    })
  }

  useEffect(() => {
    if (!enabled) return

    const controller = new AbortController()
    let interval: ReturnType<typeof setInterval> | null = null

    async function pollStatus() {
      setLoading(true)
      try {
        const res = await fetch('/api/status', { signal: controller.signal })
        const data = (await res.json()) as StatusResponse
        if (controller.signal.aborted) return
        if (data.error) {
          setUnavailable(true)
          showStatusToast(data.error.message)
        } else if (data.statuses) {
          setUnavailable(false)
          statusToastRecovering.current = true
          statusToastDismissed.current = false
          toast.dismiss(STATUS_TOAST_ID)
          setCards(prev => mergeStatuses(prev, data.statuses!))
        }
      } catch {
        if (controller.signal.aborted) return
        setUnavailable(true)
        showStatusToast(strings.errors.serverUnreachable)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    pollStatus()
    interval = setInterval(pollStatus, STATUS_POLL_INTERVAL_MS)

    return () => {
      controller.abort()
      if (interval) clearInterval(interval)
    }
  }, [enabled, setCards, setUnavailable, setLoading])
}
