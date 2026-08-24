import { useDeferredValue, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, LayoutGroup, motion, type Transition } from 'framer-motion'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import type { Virtualizer } from '@tanstack/virtual-core'
import { Popover } from 'radix-ui'
import { SearchBar } from './SearchBar'
import { CategoryFilter } from './CategoryFilter'
import { AppCard } from './AppCard'
import { useDashboardViewModel, type CategoryItem } from './use-dashboard-view-model'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CircleAlert, User } from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'
import type { Card as CardType } from '@/lib/docker'
import type { DashmarkError } from '@/lib/errors'
import { useStableLoading } from '@/lib/use-stable-loading'
import { useStatusPolling } from '@/lib/use-status-polling'
import { usePageOverflow } from '@/lib/use-page-overflow'
import { strings } from '@/lib/strings'
import { cn } from '@/lib/utils'
import { STATUS_POLL_INTERVAL_MS } from '@/lib/constants'

const brandMarkPath = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/brand/logo-mark.svg`
const COLUMN_WIDTH = 300
const COLUMN_GUTTER = 20
const MASONRY_OVERSCAN = 3
const POSITION_TRANSITION: Transition = { duration: 0.25, ease: 'easeOut' }

function measureElement<T extends Element>(
  element: T,
  entry: ResizeObserverEntry | undefined,
  instance: Virtualizer<Window, T>
): number {
  const borderBox = entry?.borderBoxSize
  if (Array.isArray(borderBox) && borderBox[0]) {
    return borderBox[0].blockSize
  }
  // During initial mount the ResizeObserver entry isn't available yet, so
  // return the virtualizer's estimate instead of forcing a synchronous layout.
  const index = instance.indexFromElement(element)
  return instance.options.estimateSize(index)
}

const CARD_ESTIMATE_BASE = 54
const CARD_ESTIMATE_DELTA = 128

function estimateCategoryHeight(index: number, items: CategoryItem[]): number {
  const cardCount = items[index]?.cards.length ?? 1
  return CARD_ESTIMATE_BASE + cardCount * CARD_ESTIMATE_DELTA
}

function GroupBadge({ group }: { group: string }) {
  return (
    <span className="dashmark-group-badge inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      <User className="h-3.5 w-3.5" />
      {group}
    </span>
  )
}

function UserGroupsBadge({ groups }: { groups: string[] }) {
  return (
    <div className="dashmark-user-groups ml-3 flex items-center gap-1.5">
      <GroupBadge group={groups[0]} />
      {groups.length > 1 && (
        <Popover.Root>
          <Popover.Trigger asChild>
            <button
              type="button"
              aria-label={`Show ${groups.length - 1} more groups`}
              className="dashmark-group-badge dashmark-group-badge-overflow inline-flex cursor-pointer items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              +{groups.length - 1}
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content side="bottom" align="end" sideOffset={4} collisionPadding={16} className="z-50 flex flex-col items-start gap-1.5 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-popover-content-transform-origin]">
              {groups.slice(1).map(group => (
                <GroupBadge key={group} group={group} />
              ))}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
    </div>
  )
}

function ErrorPanel({ error }: { error: DashmarkError }) {
  return (
    <AnimatedGridItem
      className="dashmark-error flex items-center justify-center"
      delay={0.08}
    >
      <div className="dashmark-error-panel mx-auto flex w-full max-w-xl gap-4 rounded-lg border border-error-border bg-error-bg p-6 text-error-text">
        <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold">{strings.errors.unableToLoadServices}</p>
          <p className="mt-1 text-sm">{error.message}</p>
          {error.detail && (
            <p className="mt-2 whitespace-pre-wrap text-xs opacity-80">{error.detail}</p>
          )}
        </div>
      </div>
    </AnimatedGridItem>
  )
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
}

function AnimatedGridItem({
  children,
  className,
  style,
  layoutId,
  dataIndex,
  measureElement,
  isReentry = false,
  delay = 0,
  animate = true
}: AnimatedGridItemProps) {
  const hidden = isReentry ? { opacity: 0 } : { opacity: 0, y: 12 }
  const shown = isReentry ? { opacity: 1 } : { opacity: 1, y: 0 }

  return (
    <motion.div
      ref={measureElement}
      layoutId={layoutId}
      data-index={dataIndex}
      className={className}
      style={style}
      layout="position"
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
  showResourceUsage: boolean
  isLoading: boolean
  openInNewTab: boolean
}

function CategoryColumn({ data, twoColumn, showStatus, showResourceUsage, isLoading, openInNewTab }: CategoryColumnProps) {
  const { category, cards } = data
  return (
    <Card className="dashmark-category @container overflow-hidden">
      <CardHeader className="dashmark-category-header p-5 pb-3">
        <CardTitle className="dashmark-category-title text-xs uppercase tracking-widest text-muted-foreground">{category}</CardTitle>
      </CardHeader>
      <CardContent className="p-5 pt-0">
        <div className={cn('dashmark-category-apps grid grid-cols-1 gap-4', twoColumn && '@[520px]:grid-cols-2')}>
          {cards.map(card => (
            <motion.div key={card.id} layoutId={`card-${card.id}`} className="h-full" transition={{ layout: POSITION_TRANSITION }}>
                <AppCard card={card} showStatus={showStatus} showResourceUsage={showResourceUsage} isLoading={isLoading} openInNewTab={openInNewTab} />
            </motion.div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function itemsSignature(items: CategoryItem[]): string {
  return items.map(item => `${item.key}:${item.cards.length}`).join('\0')
}

type MasonryGridProps = {
  items: CategoryItem[]
  entries: Map<string, ItemEntry>
  onReady?: () => void
  animate?: boolean
  showStatus: boolean
  showResourceUsage: boolean
  isLoading: boolean
  openInNewTab: boolean
}

function MasonryGrid({ items, entries, onReady, animate, showStatus, showResourceUsage, isLoading, openInNewTab }: MasonryGridProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const notifiedRef = useRef(false)
  const onReadyRef = useRef(onReady)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    onReadyRef.current = onReady
  }, [onReady])

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return

    const measure = () => {
      setWidth(el.getBoundingClientRect().width)
    }
    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(el)
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
    estimateSize: index => estimateCategoryHeight(index, items),
    getItemKey: index => items[index]?.key ?? index,
    measureElement
  })

  const itemsKey = itemsSignature(items)
  useLayoutEffect(() => {
    // The virtualizer caches lane assignments by index. When the category at a
    // given index changes (e.g. search filters or clears), those cached lanes
    // become stale and can place the last category in the wrong column. Reset
    // the virtualizer's measurements so lanes are reassigned from the current
    // items.
    virtualizer.measure()
  }, [itemsKey, virtualizer])

  const virtualItems = virtualizer.getVirtualItems()
  const visualRank = new Map(
    [...virtualItems]
      .sort((a, b) => a.lane - b.lane || a.start - b.start)
      .map((item, rank) => [item.index, rank])
  )

  const twoColumn = items.some(item => item.cards.length > 1)
  const showGrid = width > 0

  return (
    <div ref={containerRef} className="dashmark-category-grid">
      {showGrid && (
        <div className="dashmark-category-grid-items relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          <AnimatePresence>
            {virtualItems.map(virtualItem => {
              const item = items[virtualItem.index]
              if (!item) return null
              const entry = entries.get(item.key)
              const delay = 0.08 + (visualRank.get(virtualItem.index) ?? 0) * 0.06
              return (
                <AnimatedGridItem
                  key={entry?.key}
                  measureElement={virtualizer.measureElement}
                  dataIndex={virtualItem.index}
                  className="absolute"
                  isReentry={entry?.isReentry}
                  delay={delay}
                  animate={animate}
                  style={{
                    top: virtualItem.start,
                    left: virtualItem.lane * (columnWidth + COLUMN_GUTTER),
                    width: columnWidth
                  }}
                >
                  <CategoryColumn
                    data={item}
                    twoColumn={twoColumn}
                    showStatus={showStatus}
                    showResourceUsage={showResourceUsage}
                    isLoading={isLoading}
                    openInNewTab={openInNewTab}
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

type DashboardProps = {
  initialCards: CardType[]
  initialError?: DashmarkError
  initialShowSearch?: boolean
  initialShowStatus?: boolean
  initialShowResourceUsage?: boolean
  initialShowBranding?: boolean
  initialOpenInNewTab?: boolean
  enableStatusPolling?: boolean
  statusPollIntervalMs?: number
  categoryOrder?: string[]
  mockStatusPolling?: boolean
  showHeader?: boolean
  showGroups?: boolean
  greeting?: string
  userGroups?: string[]
}

type DashboardGreetingProps = {
  greeting?: string
  showGroups: boolean
  userGroups: string[]
  hasSearch: boolean
}

function DashboardGreeting({ greeting, showGroups, userGroups, hasSearch }: DashboardGreetingProps) {
  return (
    <div className={`dashmark-greeting-container flex items-end justify-between ${hasSearch ? 'mb-4' : ''}`}>
      <h1 className="dashmark-greeting text-xl leading-[1.2] font-semibold tracking-tight sm:text-[1.375rem] lg:text-2xl">{greeting}</h1>
      {showGroups && userGroups.length > 0 && <UserGroupsBadge groups={userGroups} />}
    </div>
  )
}

type DashboardSearchPanelProps = {
  showBranding: boolean
  search: string
  setSearch: (search: string) => void
  error: DashmarkError | null
  categories: { name: string; count: number }[]
  hasCategories: boolean
  totalCards: number
  selectedCategory: string | null
  setSelectedCategory: (category: string | null) => void
}

function DashboardSearchPanel({
  showBranding,
  search,
  setSearch,
  error,
  categories,
  hasCategories,
  totalCards,
  selectedCategory,
  setSelectedCategory
}: DashboardSearchPanelProps) {
  return (
    <Card className="dashmark-search-panel overflow-hidden bg-surface shadow-none">
      <CardContent className="dashmark-search-panel-content flex flex-row items-center gap-4 p-5">
        {showBranding && (
          <img src={brandMarkPath} alt={strings.app.title} className="dashmark-brand h-8 w-8 shrink-0 max-[359px]:hidden" />
        )}
        <div className="min-w-0 flex-1">
          <SearchBar value={search} onChange={setSearch} disabled={!!error} />
        </div>
        {hasCategories && (
          <CategoryFilter
            categories={categories}
            total={totalCards}
            selected={selectedCategory}
            onSelect={setSelectedCategory}
            disabled={!!error}
          />
        )}
      </CardContent>
    </Card>
  )
}

type DashboardSearchProps = DashboardSearchPanelProps & {
  showSearch: boolean
  showHeader: boolean
  greeting?: string
  showGroups: boolean
  userGroups: string[]
  hasPageOverflow: boolean
  masonryLayoutReady: boolean
  onAnimationComplete: () => void
}

function DashboardSearch({
  showSearch,
  showHeader,
  showBranding,
  greeting,
  showGroups,
  userGroups,
  hasPageOverflow,
  masonryLayoutReady,
  search,
  setSearch,
  error,
  categories,
  hasCategories,
  totalCards,
  selectedCategory,
  setSelectedCategory,
  onAnimationComplete
}: DashboardSearchProps) {
  if (!showSearch && !showHeader) return null

  return (
    <motion.div layout="position" className="dashmark-header dashboard-search sticky top-0 z-10 mb-6" data-overflow={hasPageOverflow || undefined}>
      <div className="pt-14 lg:pt-16">
        <motion.div
          layout="position"
          className="mx-auto w-full max-w-6xl px-6"
          initial={{ opacity: 0, y: 8 }}
          animate={masonryLayoutReady ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
          transition={{ duration: 0.3, ease: 'easeOut', layout: POSITION_TRANSITION }}
          onAnimationComplete={onAnimationComplete}
        >
          {showHeader && (
            <DashboardGreeting greeting={greeting} showGroups={showGroups} userGroups={userGroups} hasSearch={showSearch} />
          )}
          {showSearch && (
            <DashboardSearchPanel
              showBranding={showBranding}
              search={search}
              setSearch={setSearch}
              error={error}
              categories={categories}
              hasCategories={hasCategories}
              totalCards={totalCards}
              selectedCategory={selectedCategory}
              setSelectedCategory={setSelectedCategory}
            />
          )}
        </motion.div>
      </div>
    </motion.div>
  )
}

type DashboardResultsProps = {
  error: DashmarkError | null
  hasResults: boolean
  hasCategories: boolean
  isSearching: boolean
  uncategorised: CardType[]
  categoryItems: CategoryItem[]
  showStatus: boolean
  showResourceUsage: boolean
  isLoading: boolean
  openInNewTab: boolean
  onMasonryReady: () => void
  animateMasonry: boolean
}

type ItemEntry = {
  key: string
  isReentry: boolean
}

function useItemEntries(ids: string[]): Map<string, ItemEntry> {
  const visibleIdsRef = useRef(new Set<string>())
  const versionsRef = useRef(new Map<string, number>())
  const entries = new Map<string, ItemEntry>()

  for (const id of ids) {
    const wasVisible = visibleIdsRef.current.has(id)
    if (!wasVisible) {
      versionsRef.current.set(id, (versionsRef.current.get(id) ?? 0) + 1)
    }
    entries.set(id, {
      key: `${id}-${versionsRef.current.get(id)}`,
      isReentry: visibleIdsRef.current.size > 0 && !wasVisible
    })
  }

  useLayoutEffect(() => {
    visibleIdsRef.current = new Set(ids)
  }, [ids])

  return entries
}

function DashboardResults({
  error,
  hasResults,
  hasCategories,
  isSearching,
  uncategorised,
  categoryItems,
  showStatus,
  showResourceUsage,
  isLoading,
  openInNewTab,
  onMasonryReady,
  animateMasonry
}: DashboardResultsProps) {
  const cardEntries = useItemEntries(uncategorised.map(card => card.id))
  const categoryEntries = useItemEntries(categoryItems.map(item => item.key))

  if (error) return <ErrorPanel error={error} />

  if (!hasResults) {
    return (
      <div className="dashmark-empty-state flex items-center justify-center py-4">
        <p className="dashmark-empty-state-message whitespace-nowrap text-muted-foreground">{strings.dashboard.noServices}</p>
      </div>
    )
  }

  if (!hasCategories) {
    return (
      <div className="dashmark-app-grid grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <AnimatePresence>
          {uncategorised.map((card, index) => {
            const entry = cardEntries.get(card.id)
            return (
              <AnimatedGridItem key={entry?.key} layoutId={`card-${card.id}`} isReentry={isSearching || entry?.isReentry} delay={0.08 + index * 0.06}>
                <AppCard card={card} showStatus={showStatus} showResourceUsage={showResourceUsage} asCard isLoading={isLoading} openInNewTab={openInNewTab} />
              </AnimatedGridItem>
            )
          })}
        </AnimatePresence>
      </div>
    )
  }

  return (
    <MasonryGrid
      items={categoryItems}
      entries={categoryEntries}
      onReady={onMasonryReady}
      animate={animateMasonry}
      showStatus={showStatus}
      showResourceUsage={showResourceUsage}
      isLoading={isLoading}
      openInNewTab={openInNewTab}
    />
  )
}

export function Dashboard({
  initialCards,
  initialError,
  initialShowSearch = true,
  initialShowStatus = true,
  initialShowResourceUsage = true,
  initialShowBranding = true,
  initialOpenInNewTab = false,
  enableStatusPolling = true,
  statusPollIntervalMs = STATUS_POLL_INTERVAL_MS,
  categoryOrder = [],
  mockStatusPolling = false,
  showHeader = false,
  showGroups = false,
  greeting,
  userGroups = []
}: DashboardProps) {
  const [cards, setCards] = useState<CardType[]>(initialCards)
  const [error] = useState<DashmarkError | null>(initialError ?? null)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(!initialError && enableStatusPolling)
  const showLoading = useStableLoading(isLoading)
  const [statusUnavailable, setStatusUnavailable] = useState(false)
  const hasPageOverflow = usePageOverflow()

  useStatusPolling({
    enabled: !error && enableStatusPolling,
    interval: statusPollIntervalMs,
    setCards,
    setUnavailable: setStatusUnavailable,
    setLoading: setIsLoading
  })

  useEffect(() => {
    if (!mockStatusPolling) return

    let timeout = setTimeout(refreshStatus, STATUS_POLL_INTERVAL_MS)
    function refreshStatus() {
      setIsLoading(true)
      timeout = setTimeout(() => {
        setIsLoading(false)
        timeout = setTimeout(refreshStatus, STATUS_POLL_INTERVAL_MS)
      }, 1_000)
    }

    return () => clearTimeout(timeout)
  }, [mockStatusPolling])

  const {
    hasResults,
    hasCategories,
    isSearching,
    shouldUseCategoryContainers,
    flatCards,
    willRenderMasonry,
    categoryItems,
    categories
  } = useDashboardViewModel(cards, deferredSearch, selectedCategory, Boolean(error), categoryOrder)

  const [masonryLayoutReady, setMasonryLayoutReady] = useState(false)
  const [searchBarDone, setSearchBarDone] = useState(false)

  useEffect(() => {
    if (!willRenderMasonry) setMasonryLayoutReady(true)
  }, [willRenderMasonry])

  return (
    <>
      <Toaster />
      <LayoutGroup>
        <DashboardSearch
          showSearch={initialShowSearch}
          showHeader={showHeader}
          showBranding={initialShowBranding}
          greeting={greeting}
          showGroups={showGroups}
          userGroups={userGroups}
          hasPageOverflow={hasPageOverflow}
          masonryLayoutReady={masonryLayoutReady}
          search={search}
          setSearch={setSearch}
          error={error}
          categories={categories}
          hasCategories={hasCategories}
          totalCards={cards.length}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          onAnimationComplete={() => setSearchBarDone(true)}
        />

        <div className={`dashmark-content mx-auto w-full max-w-6xl px-6 pb-12 ${initialShowSearch || showHeader ? '' : 'pt-12'}`}>
          <div className="dashmark-results min-h-0">
            <DashboardResults
              error={error}
              hasResults={hasResults}
              hasCategories={shouldUseCategoryContainers}
              isSearching={isSearching}
              uncategorised={flatCards}
              categoryItems={categoryItems}
              showStatus={initialShowStatus}
              showResourceUsage={initialShowResourceUsage}
              isLoading={showLoading || statusUnavailable}
              openInNewTab={initialOpenInNewTab}
              onMasonryReady={() => setMasonryLayoutReady(true)}
              animateMasonry={searchBarDone}
            />
          </div>
        </div>
      </LayoutGroup>
    </>
  )
}
