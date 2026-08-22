import { useLayoutEffect, useState } from 'react'

export function usePageOverflow(): boolean {
  const [hasPageOverflow, setHasPageOverflow] = useState(false)

  useLayoutEffect(() => {
    const main = document.querySelector('main')
    const visualViewport = window.visualViewport
    const updateOverflow = () => {
      // The visual viewport shrinks when the mobile keyboard opens, unlike the layout viewport.
      const viewportHeight = visualViewport?.height ?? window.innerHeight
      const hasOverflow = main
        ? main.getBoundingClientRect().bottom + window.scrollY > viewportHeight
        : document.documentElement.scrollHeight > viewportHeight
      setHasPageOverflow(current => current === hasOverflow ? current : hasOverflow)
    }

    const observer = new ResizeObserver(updateOverflow)
    if (main) observer.observe(main)
    window.addEventListener('resize', updateOverflow)
    visualViewport?.addEventListener('resize', updateOverflow)
    visualViewport?.addEventListener('scroll', updateOverflow)
    updateOverflow()

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateOverflow)
      visualViewport?.removeEventListener('resize', updateOverflow)
      visualViewport?.removeEventListener('scroll', updateOverflow)
    }
  }, [])

  return hasPageOverflow
}
