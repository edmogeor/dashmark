import { useRef, useState, useEffect, type CSSProperties, type ReactNode } from 'react'
import { MARQUEE_SPEED, MARQUEE_FADE_WIDTH } from '@/lib/constants'

export function MarqueeText({ children, className }: { children: ReactNode; className?: string }) {
  const innerRef = useRef<HTMLSpanElement>(null)
  const parentRef = useRef<HTMLSpanElement>(null)
  const [offset, setOffset] = useState(0)
  const duration = Math.abs(offset) / MARQUEE_SPEED
  const fadeDuration = Math.min(duration, MARQUEE_FADE_WIDTH / MARQUEE_SPEED)
  const fadeDelay = duration - fadeDuration
  const parentStyle: CSSProperties & Record<'--marquee-fade-duration' | '--marquee-fade-delay', string> = {
    '--marquee-fade-duration': `${fadeDuration}s`,
    '--marquee-fade-delay': `${fadeDelay}s`
  }
  const innerStyle: CSSProperties & Record<'--marquee-offset' | '--marquee-duration', string> = {
    '--marquee-offset': `${offset}px`,
    '--marquee-duration': `${duration}s`
  }

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
    <span ref={parentRef} data-overflow={offset < 0 ? '' : undefined} className={`group/marquee block leading-none overflow-hidden whitespace-nowrap ${className ?? ''}`} style={parentStyle}>
      <span ref={innerRef} style={innerStyle} className={offset < 0 ? 'marquee-content' : 'block'}>
        {children}
      </span>
    </span>
  )
}
