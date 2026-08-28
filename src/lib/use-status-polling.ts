import { useEffect } from 'react'
import type { Card } from './docker'
import { isStatusResponse, type ContainerStatus } from './status'
import { strings } from './strings'
import { STATUS_TOAST_ID } from './constants'
import { clearErrorToast, rearmErrorToast, showErrorToast } from './error-toasts'

export function mergeStatuses(cards: Card[], statuses: Record<string, ContainerStatus>): Card[] {
  return cards.map((card) => {
    if (!card.hasContainer) return card
    const status = statuses[card.id]
    if (!status) {
      if (card.state === undefined && card.health === undefined) return card
      return {
        ...card,
        state: undefined,
        health: undefined
      }
    }
    if (card.state === status.state && card.health === status.health) return card
    return { ...card, ...status }
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
  function showStatusToast(description: string) {
    showErrorToast(STATUS_TOAST_ID, strings.errors.statusUpdateFailed, description)
  }

  useEffect(() => {
    if (!enabled) return

    let timeout: ReturnType<typeof setTimeout> | null = null
    let requestController: AbortController | null = null
    let refreshWhenIdle = false
    let stopped = false
    clearErrorToast(STATUS_TOAST_ID)

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        clearErrorToast(STATUS_TOAST_ID, { immediate: true })
        if (timeout) clearTimeout(timeout)
        timeout = null
        requestController?.abort()
        return
      }

      // Background fetches may be throttled or have a stale connection. Abort
      // them on hide and get a fresh status only after the page is visible.
      refreshWhenIdle = true
      pollStatus()
    }

    async function pollStatus() {
      if (stopped || document.visibilityState !== 'visible' || requestController) return

      refreshWhenIdle = false
      const controller = new AbortController()
      requestController = controller
      setLoading(true)
      try {
        const res = await fetch('/api/status', { signal: controller.signal })
        if (!res.ok) throw new Error(`Status endpoint returned ${res.status}`)
        const data: unknown = await res.json()
        if (controller.signal.aborted || stopped) return
        if (!isStatusResponse(data)) throw new Error('Status endpoint returned an invalid response')
        if ('error' in data) {
          setUnavailable(true)
          showStatusToast(data.error.message)
        } else {
          setUnavailable(false)
          clearErrorToast(STATUS_TOAST_ID, { immediate: true })
          rearmErrorToast(STATUS_TOAST_ID)
          setCards((prev) => mergeStatuses(prev, data.statuses))
        }
      } catch {
        if (controller.signal.aborted || stopped) return
        setUnavailable(true)
        showStatusToast(strings.errors.serverUnreachable)
      } finally {
        requestController = null
        if (!stopped && document.visibilityState === 'visible') {
          setLoading(false)
          if (refreshWhenIdle) pollStatus()
          else timeout = setTimeout(pollStatus, interval)
        }
      }
    }

    pollStatus()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      stopped = true
      requestController?.abort()
      if (timeout) clearTimeout(timeout)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [enabled, interval, setCards, setUnavailable, setLoading])
}
