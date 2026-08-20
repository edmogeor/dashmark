import { useEffect, useRef, useState } from 'react'
import { Sun, Moon } from 'lucide-react'
import { strings } from '@/lib/strings'

type Theme = 'light' | 'dark'

const REVEAL_TIMEOUT_MS = 4000

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
  const [revealed, setRevealed] = useState(false)
  const isTouch = useRef(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setMounted(true)
    isTouch.current = window.matchMedia('(hover: none)').matches

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

  useEffect(() => {
    if (!revealed || !isTouch.current) return
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target as Element).closest('[data-theme-toggle]')) {
        setRevealed(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [revealed])

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
  }, [])

  function clearHideTimer() {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
  }

  function show() {
    setRevealed(true)
    clearHideTimer()
  }

  function hide() {
    setRevealed(false)
    clearHideTimer()
  }

  function showThenAutoHide() {
    show()
    hideTimer.current = setTimeout(hide, REVEAL_TIMEOUT_MS)
  }

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

  function handleClick() {
    if (!mounted) return
    if (!isTouch.current) {
      handleToggle()
      return
    }
    if (revealed) handleToggle()
    showThenAutoHide()
  }

  const isDark = resolved === 'dark'
  const Icon = isDark ? Moon : Sun
  const ariaLabel = getAriaLabel(mounted, override, isDark)
  const glowBackground = isDark
    ? 'radial-gradient(circle, rgba(180,220,255,0.5) 0%, rgba(130,170,255,0.28) 35%, rgba(140,130,255,0.12) 55%, transparent 70%)'
    : 'radial-gradient(circle, rgba(255,214,130,0.6) 0%, rgba(255,150,80,0.35) 35%, rgba(255,100,90,0.15) 55%, transparent 70%)'

  return (
    <button
      type="button"
      data-theme-toggle
      onClick={handleClick}
      onPointerEnter={() => {
        if (!isTouch.current) show()
      }}
      onPointerLeave={() => {
        if (!isTouch.current) hide()
      }}
      onBlur={hide}
      className="group fixed top-0 right-0 z-50 h-18 w-18 cursor-pointer bg-transparent p-0"
      aria-label={ariaLabel}
      aria-expanded={revealed}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-16 h-32 w-32 transition-[opacity,transform] duration-500 ease-out"
        style={{
          background: glowBackground,
          filter: 'blur(18px)',
          opacity: revealed ? 1 : 0,
          transform: revealed ? 'scale(1)' : 'scale(0.6)'
        }}
      />
      <span
        className="absolute top-0 right-0 flex h-16 w-16 items-start justify-end transition-[transform,opacity] duration-300 ease-out"
        style={{
          clipPath: 'polygon(100% 0, 0 0, 100% 100%)',
          transform: !mounted
            ? 'translate(100%, -100%)'
            : revealed
              ? 'translate(0, 0)'
              : 'translate(25%, -25%)',
          opacity: mounted ? 1 : 0
        }}
      >
        <span className="absolute inset-0 bg-surface-hover transition-colors group-hover:bg-surface-active dark:bg-card dark:group-hover:bg-secondary" />
        <Icon className="relative z-10 mr-2 mt-2 h-6 w-6 text-foreground/40 transition-colors group-hover:text-foreground/60" />
      </span>
    </button>
  )
}
