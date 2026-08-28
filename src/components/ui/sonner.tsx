import { useEffect, useState } from 'react'
import { Toaster as Sonner } from 'sonner'

type ToasterProps = React.ComponentProps<typeof Sonner>

function useDarkMode(): boolean {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    const element = document.documentElement
    const update = () => setIsDark(element.classList.contains('dark'))
    update()

    const observer = new MutationObserver(update)
    observer.observe(element, { attributes: true, attributeFilter: ['class'] })

    return () => observer.disconnect()
  }, [])

  return isDark
}

const Toaster = ({ ...props }: ToasterProps) => {
  const isDark = useDarkMode()

  return <Sonner theme={isDark ? 'dark' : 'light'} position="top-center" richColors {...props} />
}

export { Toaster }
