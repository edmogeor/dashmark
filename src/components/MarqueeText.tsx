import { useRef, useState, useEffect, type ReactNode } from 'react'
import { MARQUEE_SPEED, MARQUEE_FADE_WIDTH } from '@/lib/constants'

export function MarqueeText({ children, className }: { children: ReactNode; className?: string }) {
  const innerRef = useRef<HTMLSpanElement>(null)
  const parentRef = useRef<HTMLSpanElement>(null)
  const [offset, setOffset] = useState(0)
  const duration = offset ? Math.abs(offset) / MARQUEE_SPEED : 0
  const fadeDuration = Math.min(duration, MARQUEE_FADE_WIDTH / MARQUEE_SPEED)
  const fadeDelay = duration - fadeDuration

  useEffect(() => {
    const inner = innerRef.current
    const parent = parentRef.current
    if (!inner || !parent) return

    const observer = new ResizeObserver(() => {
      const overflow = inner.scrollWidth - parent.clientWidth
      setOffset(overflow > 0 ? -overflow : 0)
    })

    observer.observe(parent)
    observer.observe(inner)

    return () => observer.disconnect()
  }, [children])

  return (
    <span
      ref={parentRef}
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
