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
  const statusToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipNextFailure = useRef(false)

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

  function clearStatusToastTimer() {
    if (!statusToastTimer.current) return
    clearTimeout(statusToastTimer.current)
    statusToastTimer.current = null
  }

  function scheduleStatusToast(description: string) {
    clearStatusToastTimer()
    statusToastTimer.current = setTimeout(() => {
      statusToastTimer.current = null
      if (document.visibilityState !== 'visible') return
      showStatusToast(description)
    }, 1_000)
  }

  useEffect(() => {
    if (!enabled) return

    const controller = new AbortController()
    let timeout: ReturnType<typeof setTimeout> | null = null
    toast.dismiss(STATUS_TOAST_ID)

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        clearStatusToastTimer()
        toast.dismiss(STATUS_TOAST_ID)
        return
      }

      // A request that was delayed while the page was backgrounded can fail as
      // the connection wakes up. Let the next scheduled poll confirm it first.
      skipNextFailure.current = true
    }

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
          if (skipNextFailure.current) skipNextFailure.current = false
          else scheduleStatusToast(data.error.message)
        } else {
          setUnavailable(false)
          clearStatusToastTimer()
          statusToastRecovering.current = true
          statusToastDismissed.current = false
          toast.dismiss(STATUS_TOAST_ID)
          setCards(prev => mergeStatuses(prev, data.statuses))
        }
      } catch {
        if (controller.signal.aborted) return
        setUnavailable(true)
        if (skipNextFailure.current) skipNextFailure.current = false
        else scheduleStatusToast(strings.errors.serverUnreachable)
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
          timeout = setTimeout(pollStatus, interval)
        }
      }
    }

    pollStatus()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      controller.abort()
      if (timeout) clearTimeout(timeout)
      clearStatusToastTimer()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [enabled, interval, setCards, setUnavailable, setLoading])
}
