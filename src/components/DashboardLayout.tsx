import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, motion, type Transition } from 'framer-motion'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import type { Virtualizer } from '@tanstack/virtual-core'
import { AppCard } from './AppCard'
import { useLocalization } from './localization'
import type { CategoryItem } from './use-dashboard-view-model'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CircleAlert } from 'lucide-react'
import type { Card as CardType } from '@/lib/docker'
import type { DashmarkError } from '@/lib/errors'
import { getTextDirection } from '@/i18n'
import { LAYOUT_ANIMATION_DELAY_MS } from '@/lib/constants'
import { cn } from '@/lib/utils'

const COLUMN_WIDTH = 300
const COLUMN_GUTTER = 20
const MASONRY_OVERSCAN = 3
const POSITION_TRANSITION: Transition = { duration: 0.25, ease: 'easeOut' }
const CARD_ESTIMATE_BASE = 54
const CARD_ESTIMATE_DELTA = 128

function measureElement<T extends Element>(element: T, entry: ResizeObserverEntry | undefined, instance: Virtualizer<Window, T>): number {
  const borderBox = entry?.borderBoxSize
  if (Array.isArray(borderBox) && borderBox[0]) return borderBox[0].blockSize
  return instance.options.estimateSize(instance.indexFromElement(element))
}

function estimateCategoryHeight(index: number, items: CategoryItem[]): number {
  return CARD_ESTIMATE_BASE + (items[index]?.cards.length ?? 1) * CARD_ESTIMATE_DELTA
}

type AnimatedGridItemProps = {
  children: ReactNode
  className?: string
  style?: CSSProperties
  layoutId?: string
  dataIndex?: number
  measureElement?: (element: HTMLDivElement | null) => void
  isReentry?: boolean
  delay?: number
  animate?: boolean
  enableLayout?: boolean
}

function AnimatedGridItem({ children, className, style, layoutId, dataIndex, measureElement, isReentry = false, delay = 0, animate = true, enableLayout = true }: AnimatedGridItemProps) {
  const hidden = isReentry ? { opacity: 0 } : { opacity: 0, y: 12 }
  const shown = isReentry ? { opacity: 1 } : { opacity: 1, y: 0 }
  return (
    <motion.div
      ref={measureElement}
      layoutId={layoutId}
      data-index={dataIndex}
      className={className}
      style={style}
      layout={enableLayout ? 'position' : false}
      initial={hidden}
      animate={animate ? shown : hidden}
      exit={{ opacity: 0, transition: { duration: 0.15, ease: 'easeOut' } }}
      transition={{ duration: 0.3, ease: 'easeOut', delay: isReentry ? 0 : delay, layout: POSITION_TRANSITION }}
    >
      {children}
    </motion.div>
  )
}

type CategoryColumnProps = {
  data: CategoryItem
  twoColumn: boolean
  showStatus: boolean
  showMetrics: boolean
  isLoading: boolean
  openInNewTab: boolean
  enableCardLayout: boolean
}

function CategoryColumn({ data, twoColumn, showStatus, showMetrics, isLoading, openInNewTab, enableCardLayout }: CategoryColumnProps) {
  const { category, cards } = data
  return (
    <Card className="dashmark-category dashmark-card-gradient @container overflow-hidden">
      <CardHeader className="dashmark-category-header p-5 pb-3">
        <CardTitle className="dashmark-category-title text-xs uppercase tracking-[0.18em] text-muted-foreground">{category}</CardTitle>
      </CardHeader>
      <CardContent className="p-5 pt-0">
        <div className={cn('dashmark-category-apps grid grid-cols-1 gap-4', twoColumn && '@[520px]:grid-cols-2')}>
          {cards.map((card) => (
            <motion.div
              key={`${card.id}-${enableCardLayout ? 'layout' : 'static'}`}
              initial={false}
              layout={enableCardLayout}
              layoutId={enableCardLayout ? `card-${card.id}` : undefined}
              className="h-full"
              transition={{ layout: POSITION_TRANSITION }}
            >
              <AppCard card={card} showStatus={showStatus} showMetrics={showMetrics} isLoading={isLoading} openInNewTab={openInNewTab} />
            </motion.div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function itemsSignature(items: CategoryItem[]): string {
  return items.map((item) => `${item.key}:${item.cards.length}`).join('\0')
}

export function getMasonryVisualRanks(items: Array<{ index: number; lane: number; start: number }>, isRTL: boolean): Map<number, number> {
  return new Map([...items].sort((a, b) => (isRTL ? b.lane - a.lane : a.lane - b.lane) || a.start - b.start).map((item, rank) => [item.index, rank]))
}

type ItemEntry = { key: string; isReentry: boolean }

export function useDelayedLayoutAnimation(masonryLayoutReady: boolean, searchBarDone: boolean): boolean {
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    if (!masonryLayoutReady || !searchBarDone) return
    const timeout = setTimeout(() => setEnabled(true), LAYOUT_ANIMATION_DELAY_MS)
    return () => clearTimeout(timeout)
  }, [masonryLayoutReady, searchBarDone])
  return enabled
}

function useItemEntries(ids: string[]): Map<string, ItemEntry> {
  const visibleIdsRef = useRef(new Set<string>())
  const versionsRef = useRef(new Map<string, number>())
  const entries = new Map<string, ItemEntry>()
  for (const id of ids) {
    const wasVisible = visibleIdsRef.current.has(id)
    if (!wasVisible) versionsRef.current.set(id, (versionsRef.current.get(id) ?? 0) + 1)
    entries.set(id, { key: `${id}-${versionsRef.current.get(id)}`, isReentry: visibleIdsRef.current.size > 0 && !wasVisible })
  }
  useLayoutEffect(() => {
    visibleIdsRef.current = new Set(ids)
  }, [ids])
  return entries
}

type MasonryGridProps = {
  items: CategoryItem[]
  entries: Map<string, ItemEntry>
  onReady?: () => void
  animate?: boolean
  showStatus: boolean
  showMetrics: boolean
  isLoading: boolean
  openInNewTab: boolean
  enableCardLayout: boolean
}

function MasonryGrid({ items, entries, onReady, animate, showStatus, showMetrics, isLoading, openInNewTab, enableCardLayout }: MasonryGridProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const notifiedRef = useRef(false)
  const onReadyRef = useRef(onReady)
  const [width, setWidth] = useState(0)
  const { locale } = useLocalization()
  const isRTL = getTextDirection(locale) === 'rtl'
  useEffect(() => {
    onReadyRef.current = onReady
  }, [onReady])
  useLayoutEffect(() => {
    const element = containerRef.current
    if (!element) return
    const measure = () =>
      setWidth((current) => {
        const next = element.getBoundingClientRect().width
        return current === next ? current : next
      })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!notifiedRef.current && width > 0) {
      notifiedRef.current = true
      onReadyRef.current?.()
    }
  }, [width])
  const lanes = Math.max(1, Math.floor((width + COLUMN_GUTTER) / (COLUMN_WIDTH + COLUMN_GUTTER)))
  const columnWidth = (width - (lanes - 1) * COLUMN_GUTTER) / lanes
  const virtualizer = useWindowVirtualizer({
    count: items.length,
    lanes,
    gap: COLUMN_GUTTER,
    overscan: MASONRY_OVERSCAN,
    estimateSize: (index) => estimateCategoryHeight(index, items),
    getItemKey: (index) => items[index]?.key ?? index,
    measureElement,
    useAnimationFrameWithResizeObserver: true
  })
  const itemsKey = itemsSignature(items)
  useLayoutEffect(() => {
    // Lane assignments are cached by index and must follow the current items.
    virtualizer.measure()
  }, [itemsKey, virtualizer])
  const virtualItems = virtualizer.getVirtualItems()
  const visualRank = getMasonryVisualRanks(virtualItems, isRTL)
  const twoColumn = items.some((item) => item.cards.length > 1)
  return (
    <div ref={containerRef} className="dashmark-category-grid">
      {width > 0 && (
        <div className="dashmark-category-grid-items relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          <AnimatePresence>
            {virtualItems.map((virtualItem) => {
              const item = items[virtualItem.index]
              if (!item) return null
              const entry = entries.get(item.key)
              return (
                <AnimatedGridItem
                  key={entry?.key}
                  measureElement={virtualizer.measureElement}
                  dataIndex={virtualItem.index}
                  className="absolute"
                  isReentry={entry?.isReentry}
                  delay={0.08 + (visualRank.get(virtualItem.index) ?? 0) * 0.06}
                  animate={animate}
                  enableLayout={enableCardLayout}
                  style={{ top: virtualItem.start, left: virtualItem.lane * (columnWidth + COLUMN_GUTTER), width: columnWidth }}
                >
                  <CategoryColumn
                    data={item}
                    twoColumn={twoColumn}
                    showStatus={showStatus}
                    showMetrics={showMetrics}
                    isLoading={isLoading}
                    openInNewTab={openInNewTab}
                    enableCardLayout={enableCardLayout}
                  />
                </AnimatedGridItem>
              )
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

type DashboardLayoutProps = {
  error: DashmarkError | null
  hasResults: boolean
  hasCategories: boolean
  isSearching: boolean
  uncategorised: CardType[]
  categoryItems: CategoryItem[]
  showStatus: boolean
  showMetrics: boolean
  isLoading: boolean
  openInNewTab: boolean
  onMasonryReady: () => void
  animateMasonry: boolean
  enableCardLayout: boolean
}

function ErrorPanel({ error }: { error: DashmarkError }) {
  const { messages } = useLocalization()
  return (
    <AnimatedGridItem className="dashmark-error flex items-center justify-center" delay={0.08}>
      <div className="dashmark-error-panel mx-auto flex w-full max-w-xl gap-4 rounded-lg border border-error-border bg-error-bg p-6 text-error-text">
        <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="min-w-0">
          <p className="font-[550]">{messages.errors.unableToLoadServices}</p>
          <p className="mt-1 text-sm">{error.message}</p>
          {error.detail && <p className="mt-2 whitespace-pre-wrap text-xs opacity-80">{error.detail}</p>}
        </div>
      </div>
    </AnimatedGridItem>
  )
}

export function DashboardLayout({
  error,
  hasResults,
  hasCategories,
  isSearching,
  uncategorised,
  categoryItems,
  showStatus,
  showMetrics,
  isLoading,
  openInNewTab,
  onMasonryReady,
  animateMasonry,
  enableCardLayout
}: DashboardLayoutProps) {
  const { locale, messages } = useLocalization()
  const isRTL = getTextDirection(locale) === 'rtl'
  const cardEntries = useItemEntries(uncategorised.map((card) => card.id))
  const categoryEntries = useItemEntries(categoryItems.map((item) => item.key))
  if (error) return <ErrorPanel error={error} />
  if (!hasResults)
    return (
      <div className="dashmark-empty-state flex items-center justify-center py-4">
        <p className="dashmark-empty-state-message whitespace-nowrap text-muted-foreground">{messages.dashboard.noServices}</p>
      </div>
    )
  if (!hasCategories)
    return (
      <div className="dashmark-app-grid grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <AnimatePresence>
          {uncategorised.map((card, index) => {
            const entry = cardEntries.get(card.id)
            return (
              <AnimatedGridItem key={entry?.key} layoutId={`card-${card.id}`} isReentry={isSearching || entry?.isReentry} delay={0.08 + (isRTL ? uncategorised.length - index - 1 : index) * 0.06}>
                <AppCard card={card} showStatus={showStatus} showMetrics={showMetrics} asCard isLoading={isLoading} openInNewTab={openInNewTab} />
              </AnimatedGridItem>
            )
          })}
        </AnimatePresence>
      </div>
    )
  return (
    <MasonryGrid
      items={categoryItems}
      entries={categoryEntries}
      onReady={onMasonryReady}
      animate={animateMasonry}
      enableCardLayout={enableCardLayout}
      showStatus={showStatus}
      showMetrics={showMetrics}
      isLoading={isLoading}
      openInNewTab={openInNewTab}
    />
  )
}
