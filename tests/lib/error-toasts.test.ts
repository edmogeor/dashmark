import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { clearErrorToast, clearStaleErrorToasts, showErrorToast } from '@/lib/error-toasts'
import { ERROR_TOAST_DEBOUNCE_MS, ERROR_TOAST_RESOLVE_GRACE_MS } from '@/lib/constants'

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    dismiss: vi.fn()
  }
}))

type ErrorConfig = { id: string; onDismiss?: () => void }

let sequence = 0
let errorConfigs: ErrorConfig[] = []

function nextId(): string {
  sequence += 1
  return `metric-card-${sequence}:metric-key`
}

beforeEach(() => {
  vi.useFakeTimers()
  errorConfigs = []
  vi.mocked(toast.error).mockImplementation((_message, config) => {
    if (typeof config?.id === 'string') {
      const { id, onDismiss } = config
      errorConfigs.push({
        id,
        onDismiss: onDismiss ? () => onDismiss({ id }) : undefined
      })
    }
    return config?.id ?? ''
  })
  vi.mocked(toast.error).mockClear()
  vi.mocked(toast.dismiss).mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('showErrorToast', () => {
  it('debounces the initial appearance', () => {
    const id = nextId()
    showErrorToast(id, 'Title')
    expect(toast.error).not.toHaveBeenCalled()
    vi.advanceTimersByTime(ERROR_TOAST_DEBOUNCE_MS - 1)
    expect(toast.error).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(errorConfigs[0]?.id).toBe(id)
  })

  it('cancels a pending toast when cleared before showing', () => {
    const id = nextId()
    showErrorToast(id, 'Title')
    clearErrorToast(id)
    vi.advanceTimersByTime(ERROR_TOAST_DEBOUNCE_MS * 2)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('never re-renders a toast that is already on screen', () => {
    const id = nextId()
    showErrorToast(id, 'Title')
    vi.advanceTimersByTime(ERROR_TOAST_DEBOUNCE_MS)
    for (let poll = 0; poll < 5; poll++) {
      showErrorToast(id, 'Title', `message ${poll}`)
      vi.advanceTimersByTime(ERROR_TOAST_DEBOUNCE_MS * 3)
    }
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(toast.dismiss).not.toHaveBeenCalled()
  })

  it('keeps a visible toast through a brief error gap without dismissing or repeating', () => {
    const id = nextId()
    showErrorToast(id, 'Title')
    vi.advanceTimersByTime(ERROR_TOAST_DEBOUNCE_MS)
    clearErrorToast(id)
    vi.advanceTimersByTime(ERROR_TOAST_RESOLVE_GRACE_MS / 2)
    showErrorToast(id, 'Title')
    vi.advanceTimersByTime(ERROR_TOAST_DEBOUNCE_MS + ERROR_TOAST_RESOLVE_GRACE_MS)
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(toast.dismiss).not.toHaveBeenCalled()
  })

  it('dismisses and resets after the resolve grace expires', () => {
    const id = nextId()
    showErrorToast(id, 'Title')
    vi.advanceTimersByTime(ERROR_TOAST_DEBOUNCE_MS)
    clearErrorToast(id)
    vi.advanceTimersByTime(ERROR_TOAST_RESOLVE_GRACE_MS)
    expect(toast.dismiss).toHaveBeenCalledWith(id)
    showErrorToast(id, 'Title')
    vi.advanceTimersByTime(ERROR_TOAST_DEBOUNCE_MS)
    expect(toast.error).toHaveBeenCalledTimes(2)
  })

  it('never re-shows a user-dismissed toast for the rest of the session', () => {
    const id = nextId()
    showErrorToast(id, 'Title')
    vi.advanceTimersByTime(ERROR_TOAST_DEBOUNCE_MS)
    errorConfigs[0]?.onDismiss?.()

    showErrorToast(id, 'Title')
    vi.advanceTimersByTime(ERROR_TOAST_DEBOUNCE_MS * 4)
    expect(toast.error).toHaveBeenCalledTimes(1)

    clearErrorToast(id)
    vi.advanceTimersByTime(ERROR_TOAST_RESOLVE_GRACE_MS)
    showErrorToast(id, 'Title')
    vi.advanceTimersByTime(ERROR_TOAST_DEBOUNCE_MS * 4)
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(toast.dismiss).toHaveBeenCalledTimes(1)
  })

  it('dismisses immediately when requested', () => {
    const id = nextId()
    showErrorToast(id, 'Title')
    vi.advanceTimersByTime(ERROR_TOAST_DEBOUNCE_MS)
    clearErrorToast(id, { immediate: true })
    expect(toast.dismiss).toHaveBeenCalledWith(id)
    showErrorToast(id, 'Title')
    vi.advanceTimersByTime(ERROR_TOAST_DEBOUNCE_MS)
    expect(toast.error).toHaveBeenCalledTimes(2)
  })
})

describe('clearStaleErrorToasts', () => {
  it('clears only episodes outside the active set under the prefix', () => {
    const staleId = `metric-card-shared:${nextId()}`
    const keptId = `metric-card-shared:${nextId()}`
    const otherCardId = `metric-other:${nextId()}`

    for (const [id] of [[staleId], [keptId], [otherCardId]] as const) {
      showErrorToast(id, 'Title')
      vi.advanceTimersByTime(ERROR_TOAST_DEBOUNCE_MS)
    }
    expect(toast.error).toHaveBeenCalledTimes(3)

    clearStaleErrorToasts('metric-card-shared:', new Set([keptId]))
    vi.advanceTimersByTime(ERROR_TOAST_RESOLVE_GRACE_MS)

    expect(vi.mocked(toast.dismiss).mock.calls.map(([id]) => id)).toEqual([staleId])
  })
})
