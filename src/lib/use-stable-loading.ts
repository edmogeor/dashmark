import { useEffect, useRef, useState } from 'react'
import { LOADING_DELAY_MS, LOADING_MIN_DURATION_MS } from './constants'

/**
 * Converts a raw loading signal into a stable spinner signal.
 *
 * - Waits `delay` ms before showing the spinner, so fast loads don't flash.
 * - Once shown, keeps the spinner visible for at least `minDuration` ms.
 */
export function useStableLoading(
  isLoading: boolean,
  delay = LOADING_DELAY_MS,
  minDuration = LOADING_MIN_DURATION_MS
): boolean {
  const [show, setShow] = useState(false)
  const showStartRef = useRef<number | null>(null)
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (isLoading) {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
      if (!show && !showTimerRef.current) {
        showTimerRef.current = setTimeout(() => {
          setShow(true)
          showStartRef.current = Date.now()
          showTimerRef.current = null
        }, delay)
      }
    } else {
      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current)
        showTimerRef.current = null
      }
      if (show && !hideTimerRef.current) {
        const shownFor = showStartRef.current ? Date.now() - showStartRef.current : 0
        const remaining = Math.max(0, minDuration - shownFor)
        hideTimerRef.current = setTimeout(() => {
          setShow(false)
          showStartRef.current = null
          hideTimerRef.current = null
        }, remaining)
      }
    }

    return () => {
      if (showTimerRef.current) clearTimeout(showTimerRef.current)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [isLoading, show, delay, minDuration])

  return show
}
