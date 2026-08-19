import { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'
import { strings } from '@/lib/strings'

type Theme = 'light' | 'dark'

function getSystemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getStoredOverride(): Theme | null {
  const value = localStorage.getItem('dashmark-theme')
  return value === 'light' || value === 'dark' ? value : null
}

function applyTheme(override: Theme | null) {
  const resolved = override ?? getSystemTheme()
  document.documentElement.classList.toggle('dark', resolved === 'dark')
}

function getAriaLabel(mounted: boolean, override: Theme | null, isDark: boolean): string {
  if (!mounted) return strings.theme.toggle
  if (override) return strings.theme.switchToSystem
  return isDark ? strings.theme.switchToLight : strings.theme.switchToDark
}

export function ThemeToggle() {
  const [resolved, setResolved] = useState<Theme>('dark')
  const [override, setOverride] = useState<Theme | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const initialOverride = getStoredOverride()
    setOverride(initialOverride)
    applyTheme(initialOverride)
    setResolved(initialOverride ?? getSystemTheme())

    const listener = (e: MediaQueryListEvent) => {
      const currentOverride = getStoredOverride()
      setResolved(currentOverride ?? (e.matches ? 'dark' : 'light'))
      applyTheme(currentOverride)
    }

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', listener)
    return () => mq.removeEventListener('change', listener)
  }, [])

  function handleToggle() {
    if (override) {
      localStorage.removeItem('dashmark-theme')
      setOverride(null)
      setResolved(getSystemTheme())
      applyTheme(null)
    } else {
      const nextOverride = resolved === 'dark' ? 'light' : 'dark'
      localStorage.setItem('dashmark-theme', nextOverride)
      setOverride(nextOverride)
      setResolved(nextOverride)
      applyTheme(nextOverride)
    }
  }

  const isDark = resolved === 'dark'
  const Icon = isDark ? Moon : Sun
  const ariaLabel = getAriaLabel(mounted, override, isDark)

  return (
    <button
      type="button"
      onClick={mounted ? handleToggle : undefined}
      className={`group fixed top-0 right-0 z-50 flex h-16 w-16 cursor-pointer items-start justify-end bg-transparent p-0 transition-all duration-500 ease-out ${
        mounted
          ? 'visible translate-x-0 translate-y-0 opacity-100'
          : 'invisible -translate-y-full translate-x-full opacity-0'
      }`}
      style={{ clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }}
      aria-label={ariaLabel}
    >
      <div className="absolute inset-0 bg-surface-hover transition-colors group-hover:bg-surface-active dark:bg-card dark:group-hover:bg-secondary" />
      <Icon className="relative z-10 mr-2 mt-2 h-6 w-6 text-foreground/40 transition-colors group-hover:text-foreground/60" />
    </button>
  )
}
