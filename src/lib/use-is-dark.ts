import { useSyncExternalStore } from 'react'

function subscribe(callback: () => void): () => void {
  const observer = new MutationObserver(callback)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}

function getSnapshot(): boolean {
  return document.documentElement.classList.contains('dark')
}

function getServerSnapshot(): boolean {
  // index.astro renders <html class="dark"> by default; the inline theme
  // script may flip this before hydration, which useSyncExternalStore will
  // reconcile on the client.
  return true
}

export function useIsDark(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
