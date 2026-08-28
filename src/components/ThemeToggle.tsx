import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Sun, Moon } from 'lucide-react'
import { strings } from '@/lib/strings'
import { THEME_REVEAL_TIMEOUT_MS, THEME_STORAGE_KEY } from '@/lib/constants'

type Theme = 'light' | 'dark'

function getSystemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getStoredOverride(): Theme | null {
  const value = localStorage.getItem(THEME_STORAGE_KEY)
  return value === 'light' || value === 'dark' ? value : null
}

function applyTheme(override: Theme | null): void {
  const root = document.documentElement
  root.classList.toggle('dark', (override ?? getSystemTheme()) === 'dark')
}

function transitionTheme(override: Theme | null, update: () => void): void {
  const apply = () =>
    flushSync(() => {
      update()
      applyTheme(override)
    })

  if (document.startViewTransition) document.startViewTransition(apply)
  else apply()
}

function getAriaLabel(mounted: boolean, override: Theme | null, isDark: boolean): string {
  if (!mounted) return strings.theme.toggle
  if (override) return strings.theme.switchToSystem
  return isDark ? strings.theme.switchToLight : strings.theme.switchToDark
}

function getRevealTransform(mounted: boolean, revealed: boolean): string {
  if (!mounted) return 'translate(100%, -100%)'
  if (revealed) return 'translate(0, 0)'
  return 'translate(25%, -25%)'
}

function getGlowBackground(isDark: boolean): string {
  if (isDark) {
    return 'radial-gradient(circle, rgba(255,214,130,0.6) 0%, rgba(255,150,80,0.35) 35%, rgba(255,100,90,0.15) 55%, transparent 70%)'
  }
  return 'radial-gradient(circle, rgba(180,220,255,0.85) 0%, rgba(130,170,255,0.55) 35%, rgba(140,130,255,0.3) 55%, transparent 80%)'
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
      const nextResolved = currentOverride ?? (e.matches ? 'dark' : 'light')
      transitionTheme(currentOverride, () => {
        setOverride(currentOverride)
        setResolved(nextResolved)
      })
    }

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', listener)
    return () => mq.removeEventListener('change', listener)
  }, [])

  useEffect(() => {
    if (!revealed || !isTouch.current) return
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('[data-theme-toggle]')) {
        setRevealed(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [revealed])

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
    },
    []
  )

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
    hideTimer.current = setTimeout(hide, THEME_REVEAL_TIMEOUT_MS)
  }

  function handleToggle() {
    if (override) {
      localStorage.removeItem(THEME_STORAGE_KEY)
      transitionTheme(null, () => {
        setRevealed(revealed)
        setOverride(null)
        setResolved(getSystemTheme())
      })
    } else {
      const nextOverride = resolved === 'dark' ? 'light' : 'dark'
      localStorage.setItem(THEME_STORAGE_KEY, nextOverride)
      transitionTheme(nextOverride, () => {
        setRevealed(revealed)
        setOverride(nextOverride)
        setResolved(nextOverride)
      })
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
  const Icon = isDark ? Sun : Moon
  const ariaLabel = getAriaLabel(mounted, override, isDark)
  const glowBackground = getGlowBackground(isDark)

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
      className="dashmark-theme-toggle group fixed top-0 right-0 z-50 h-[38px] w-[38px] cursor-pointer bg-transparent p-0"
      aria-label={ariaLabel}
      aria-expanded={revealed}
    >
      <span
        aria-hidden
        className="dashmark-theme-toggle-glow pointer-events-none absolute -top-16 -right-16 h-32 w-32 transition-[opacity,transform] duration-500 ease-out"
        style={{
          background: glowBackground,
          filter: 'blur(18px)',
          opacity: revealed ? 1 : 0,
          transform: revealed ? 'scale(1)' : 'scale(0.6)'
        }}
      />
      <span
        className="dashmark-theme-toggle-control absolute top-0 right-0 flex h-16 w-16 items-start justify-end transition-[transform,opacity] duration-300 ease-out"
        style={{
          clipPath: 'polygon(100% 0, 0 0, 100% 100%)',
          transform: getRevealTransform(mounted, revealed),
          opacity: mounted ? 1 : 0
        }}
      >
        <span className="dashmark-theme-toggle-background absolute inset-0 bg-surface-hover transition-colors group-hover:bg-surface-active dark:bg-card dark:group-hover:bg-secondary" />
        <Icon className="dashmark-theme-toggle-icon relative z-10 mr-2 mt-2 h-6 w-6 text-foreground/40 transition-colors group-hover:text-foreground/60" />
      </span>
    </button>
  )
}
