import { toast } from 'sonner'
import { ERROR_TOAST_DEBOUNCE_MS } from './constants'

type PendingToast = ReturnType<typeof setTimeout>

const pendingTimers = new Map<string, PendingToast>()
const rememberedDismissals = new Set<string>()
const clearingIds = new Set<string>()

export function showErrorToast(id: string, title: string, description?: string): void {
  clearingIds.delete(id)
  if (rememberedDismissals.has(id) || pendingTimers.has(id)) return
  pendingTimers.set(id, setTimeout(() => {
    pendingTimers.delete(id)
    toast.error(title, {
      id,
      ...(description === undefined ? {} : { description }),
      duration: Infinity,
      closeButton: true,
      onDismiss: () => {
        if (clearingIds.has(id)) return
        rememberedDismissals.add(id)
      }
    })
  }, ERROR_TOAST_DEBOUNCE_MS))
}

export function clearErrorToast(id: string): void {
  const timer = pendingTimers.get(id)
  if (timer) {
    clearTimeout(timer)
    pendingTimers.delete(id)
  }
  clearingIds.add(id)
  toast.dismiss(id)
  rememberedDismissals.delete(id)
}
