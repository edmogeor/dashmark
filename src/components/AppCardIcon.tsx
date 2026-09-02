import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { Card } from '@/lib/docker'
import { getInitials } from '@/lib/initials'
import { useIsDark } from '@/lib/use-is-dark'

type AppCardIconProps = {
  icon: Card['icon']
  title: string
  asCard: boolean
}

function InitialsPlaceholder({ title, asCard }: Pick<AppCardIconProps, 'title' | 'asCard'>) {
  return (
    <div
      className={cn(
        'dashmark-app-icon dashmark-app-icon-placeholder flex aspect-square shrink-0 self-stretch items-center justify-center rounded-[45%] ps-1 text-xl font-[550] text-foreground/50',
        asCard ? 'bg-surface dark:bg-background' : 'bg-card'
      )}
    >
      {getInitials(title)}
      <span aria-hidden="true" className="dashmark-app-icon-glimmer" />
    </div>
  )
}

function useContrastAwareSrc(icon: Card['icon']): string | undefined {
  const isDark = useIsDark()
  if (icon.type !== 'image') return undefined
  if (!icon.contrast) return icon.src
  if (icon.contrast === 'dark' && isDark) return icon.lightSrc ?? icon.src
  if (icon.contrast === 'light' && !isDark) return icon.darkSrc ?? icon.src
  return icon.src
}

export function AppCardIcon({ icon, title, asCard }: AppCardIconProps) {
  const [failedSource, setFailedSource] = useState<string>()
  const src = useContrastAwareSrc(icon)
  return icon.type === 'image' && src && failedSource !== src ? (
    <div className={cn('dashmark-app-icon flex aspect-square shrink-0 self-stretch items-center justify-center rounded-[45%] p-4', asCard ? 'bg-surface dark:bg-background' : 'bg-card')}>
      <img src={src} alt={icon.alt} className="h-full w-full object-contain" loading="lazy" onError={() => setFailedSource(src)} />
      <span aria-hidden="true" className="dashmark-app-icon-glimmer" />
    </div>
  ) : (
    <InitialsPlaceholder title={title} asCard={asCard} />
  )
}
