import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import type { Card } from './docker'
import { isStatusResponse, type ContainerStatus } from './status'
import { strings } from './strings'
import { STATUS_TOAST_ID } from './constants'

function mergeStatuses(cards: Card[], statuses: Record<string, ContainerStatus>): Card[] {
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
  interval,
  setCards,
  setUnavailable,
  setLoading
}: {
  enabled: boolean
  interval: number
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
    let timeout: ReturnType<typeof setTimeout> | null = null

    async function pollStatus() {
      setLoading(true)
      try {
        const res = await fetch('/api/status', { signal: controller.signal })
        if (!res.ok) throw new Error(`Status endpoint returned ${res.status}`)
        const data: unknown = await res.json()
        if (controller.signal.aborted) return
        if (!isStatusResponse(data)) throw new Error('Status endpoint returned an invalid response')
        if ('error' in data) {
          setUnavailable(true)
          showStatusToast(data.error.message)
        } else {
          setUnavailable(false)
          statusToastRecovering.current = true
          statusToastDismissed.current = false
          toast.dismiss(STATUS_TOAST_ID)
          setCards(prev => mergeStatuses(prev, data.statuses))
        }
      } catch {
        if (controller.signal.aborted) return
        setUnavailable(true)
        showStatusToast(strings.errors.serverUnreachable)
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
          timeout = setTimeout(pollStatus, interval)
        }
      }
    }

    pollStatus()

    return () => {
      controller.abort()
      if (timeout) clearTimeout(timeout)
    }
  }, [enabled, interval, setCards, setUnavailable, setLoading])
}
