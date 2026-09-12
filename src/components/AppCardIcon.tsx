import { useId, useState } from 'react'
import { cn } from '@/lib/utils'
import type { Card } from '@/lib/docker'
import { getInitials } from '@/lib/initials'
import { useIsDark } from '@/lib/use-is-dark'

type AppCardIconProps = {
  icon: Card['icon']
  title: string
  asCard: boolean
}

function squircleCorner(centerX: number, centerY: number, startAngle: number, endAngle: number): string {
  return Array.from({ length: 17 }, (_, index) => {
    const angle = startAngle + ((endAngle - startAngle) * index) / 16
    const x = centerX + 45 * Math.sign(Math.cos(angle)) * Math.sqrt(Math.abs(Math.cos(angle)))
    const y = centerY + 45 * Math.sign(Math.sin(angle)) * Math.sqrt(Math.abs(Math.sin(angle)))
    return `L ${x.toFixed(3)} ${y.toFixed(3)}`
  }).join(' ')
}

const SQUIRCLE_PATH = [
  'M 45 0',
  'H 55',
  squircleCorner(55, 45, -Math.PI / 2, 0),
  'V 55',
  squircleCorner(55, 55, 0, Math.PI / 2),
  'H 45',
  squircleCorner(45, 55, Math.PI / 2, Math.PI),
  'V 45',
  squircleCorner(45, 45, Math.PI, (Math.PI * 3) / 2),
  'Z'
].join(' ')

function IconDecoration() {
  const id = useId().replace(/[^a-z0-9]/gi, '')
  const backgroundGradientId = `icon-background-${id}`
  const glimmerGradientId = `icon-glimmer-${id}`
  const glimmerClipId = `icon-glimmer-clip-${id}`

  return (
    <>
      <svg aria-hidden="true" className="pointer-events-none col-start-1 row-start-1 z-0 h-full w-full overflow-visible dashmark-app-icon-shape" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id={backgroundGradientId} x1="0" y1="0" x2="0" y2="100" gradientUnits="userSpaceOnUse">
            <stop stopColor="currentColor" stopOpacity="0.03" />
            <stop offset="0.7" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={SQUIRCLE_PATH} fill="var(--dashmark-app-icon-background)" />
        <path d={SQUIRCLE_PATH} fill={`url(#${backgroundGradientId})`} />
        <path d={SQUIRCLE_PATH} fill="none" stroke="currentColor" strokeOpacity="0.08" vectorEffect="non-scaling-stroke" />
      </svg>
      <svg aria-hidden="true" className="dashmark-app-icon-glimmer pointer-events-none col-start-1 row-start-1 z-20 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <clipPath id={glimmerClipId}>
            <path d={SQUIRCLE_PATH} />
          </clipPath>
          <linearGradient id={glimmerGradientId} x1="0" y1="0" x2="100" y2="0" gradientTransform="rotate(25 50 50)" gradientUnits="userSpaceOnUse">
            <stop offset="0.18" stopColor="currentColor" stopOpacity="0" />
            <stop className="dashmark-app-icon-glimmer-edge" offset="0.36" stopColor="currentColor" />
            <stop className="dashmark-app-icon-glimmer-center" offset="0.5" stopColor="currentColor" />
            <stop className="dashmark-app-icon-glimmer-edge" offset="0.64" stopColor="currentColor" />
            <stop offset="0.82" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g clipPath={`url(#${glimmerClipId})`}>
          <rect className="dashmark-app-icon-glimmer-sheen" width="100" height="100" fill={`url(#${glimmerGradientId})`} />
        </g>
      </svg>
    </>
  )
}

function InitialsPlaceholder({ title, asCard }: Pick<AppCardIconProps, 'title' | 'asCard'>) {
  return (
    <div
      className={cn(
        'dashmark-app-icon dashmark-app-icon-placeholder grid h-full aspect-square shrink-0 place-items-center ps-1 text-xl font-[550] text-foreground/50',
        asCard && 'dashmark-app-icon-as-card'
      )}
    >
      <IconDecoration />
      <span className="relative z-10">{getInitials(title)}</span>
    </div>
  )
}

function useContrastAwareSrc(icon: Card['icon']): string | undefined {
  const isDark = useIsDark()
  if (icon.type !== 'image') return undefined
  return isDark ? (icon.darkSrc ?? icon.src) : (icon.lightSrc ?? icon.src)
}

export function AppCardIcon({ icon, title, asCard }: AppCardIconProps) {
  const [failedSource, setFailedSource] = useState<string>()
  const src = useContrastAwareSrc(icon)
  return icon.type === 'image' && src && failedSource !== src ? (
    <div className={cn('dashmark-app-icon grid h-full aspect-square shrink-0 place-items-center', asCard && 'dashmark-app-icon-as-card')}>
      <IconDecoration />
      <img src={src} alt={icon.alt} className="relative col-start-1 row-start-1 z-10 h-full w-full p-4 object-contain" onError={() => setFailedSource(src)} />
    </div>
  ) : (
    <InitialsPlaceholder title={title} asCard={asCard} />
  )
}
