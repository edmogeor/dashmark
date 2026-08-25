import { toast } from 'sonner'
import { ERROR_TOAST_DEBOUNCE_MS, ERROR_TOAST_RESOLVE_GRACE_MS } from './constants'

type PendingToast = ReturnType<typeof setTimeout>

type ErrorToastEpisode = {
  showTimer?: PendingToast
  resolveTimer?: PendingToast
  onScreen: boolean
}

const episodes = new Map<string, ErrorToastEpisode>()
const clearingIds = new Set<string>()
const rememberedDismissals = new Set<string>()

function startEpisode(id: string): ErrorToastEpisode {
  let episode = episodes.get(id)
  if (!episode) {
    episode = { onScreen: false }
    episodes.set(id, episode)
  }
  return episode
}

export function showErrorToast(id: string, title: string, description?: string): void {
  clearingIds.delete(id)
  if (rememberedDismissals.has(id)) return
  const episode = startEpisode(id)
  if (episode.resolveTimer !== undefined) {
    clearTimeout(episode.resolveTimer)
    episode.resolveTimer = undefined
  }
  if (episode.onScreen || episode.showTimer !== undefined) return
  episode.showTimer = setTimeout(() => {
    episode.showTimer = undefined
    episode.onScreen = true
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
  }, ERROR_TOAST_DEBOUNCE_MS)
}

export function clearErrorToast(id: string, options?: { immediate?: boolean }): void {
  const episode = episodes.get(id)
  if (!episode) return
  if (episode.showTimer !== undefined) {
    clearTimeout(episode.showTimer)
    episodes.delete(id)
    return
  }
  if (episode.resolveTimer !== undefined) {
    if (!options?.immediate) return
    clearTimeout(episode.resolveTimer)
  }
  const finalize = () => {
    episodes.delete(id)
    if (episode.onScreen) {
      clearingIds.add(id)
      episode.onScreen = false
      toast.dismiss(id)
    }
  }
  if (options?.immediate) finalize()
  else episode.resolveTimer = setTimeout(finalize, ERROR_TOAST_RESOLVE_GRACE_MS)
}

export function rearmErrorToast(id: string): void {
  rememberedDismissals.delete(id)
}

export function clearStaleErrorToasts(prefix: string, activeIds: Set<string>): void {
  for (const id of episodes.keys()) {
    if (id.startsWith(prefix) && !activeIds.has(id)) clearErrorToast(id)
  }
}
