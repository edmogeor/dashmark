import { useLayoutEffect, useState } from 'react'

export function usePageOverflow(): boolean {
  const [hasPageOverflow, setHasPageOverflow] = useState(false)

  useLayoutEffect(() => {
    const main = document.querySelector('main')
    const updateOverflow = () => {
      const hasOverflow = main
        ? main.getBoundingClientRect().bottom + window.scrollY > window.innerHeight
        : document.documentElement.scrollHeight > window.innerHeight
      setHasPageOverflow(current => current === hasOverflow ? current : hasOverflow)
    }

    const observer = new ResizeObserver(updateOverflow)
    if (main) observer.observe(main)
    window.addEventListener('resize', updateOverflow)
    updateOverflow()

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateOverflow)
    }
  }, [])

  return hasPageOverflow
}
