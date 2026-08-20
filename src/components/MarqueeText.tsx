import { useRef, useState, useEffect, type ReactNode } from 'react'
import { MARQUEE_SPEED, MARQUEE_FADE_WIDTH } from '@/lib/constants'

export function MarqueeText({ children, className }: { children: ReactNode; className?: string }) {
  const innerRef = useRef<HTMLSpanElement>(null)
  const [offset, setOffset] = useState(0)
  const duration = offset ? Math.abs(offset) / MARQUEE_SPEED : 0
  const fadeDuration = Math.min(duration, MARQUEE_FADE_WIDTH / MARQUEE_SPEED)
  const fadeDelay = duration - fadeDuration

  useEffect(() => {
    const inner = innerRef.current
    if (!inner) return
    const parent = inner.parentElement
    if (!parent) return

    const update = () => {
      const overflow = inner.scrollWidth - parent.clientWidth
      setOffset(overflow > 0 ? -overflow : 0)
    }

    update()

    const observer = new ResizeObserver(update)
    observer.observe(parent)
    observer.observe(inner)

    return () => observer.disconnect()
  }, [children])

  return (
    <span
      data-overflow={offset < 0 ? '' : undefined}
      className={`group/marquee block overflow-hidden whitespace-nowrap ${className ?? ''}`}
      style={{
        '--marquee-fade-duration': `${fadeDuration}s`,
        '--marquee-fade-delay': `${fadeDelay}s`
      } as React.CSSProperties}
    >
      <span
        ref={innerRef}
        style={{
          '--marquee-offset': `${offset}px`,
          '--marquee-duration': `${duration}s`
        } as React.CSSProperties}
        className={offset < 0 ? 'marquee-content' : 'block'}
      >
        {children}
      </span>
    </span>
  )
}
