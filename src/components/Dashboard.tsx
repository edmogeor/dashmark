import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { motion, type Variants } from 'framer-motion'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import type { Virtualizer } from '@tanstack/virtual-core'
import Fuse from 'fuse.js'
import { SearchBar } from './SearchBar'
import { CategoryFilter } from './CategoryFilter'
import { AppCard } from './AppCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { CircleAlert, User } from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'
import type { Card as CardType } from '@/lib/docker'
import type { DashmarkError } from '@/lib/errors'
import { useStableLoading } from '@/lib/use-stable-loading'
import { useStatusPolling } from '@/lib/use-status-polling'
import { strings } from '@/lib/strings'
import { cn } from '@/lib/utils'
import { SEARCH_FUZZY_THRESHOLD } from '@/lib/constants'

const UNCATEGORISED = strings.category.uncategorised

const COLUMN_WIDTH = 300
const COLUMN_GUTTER = 24
const MASONRY_OVERSCAN = 3

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

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } }
}

const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.08 } }
}

function categoryName(card: CardType): string {
  return card.category?.trim() || UNCATEGORISED
}

function groupByCategory(cards: CardType[]): Record<string, CardType[]> {
  const groups: Record<string, CardType[]> = {}
  for (const card of cards) {
    const category = categoryName(card)
    if (!groups[category]) groups[category] = []
    groups[category].push(card)
  }
  return groups
}

function sortCategories(a: string, b: string): number {
  if (a === UNCATEGORISED) return 1
  if (b === UNCATEGORISED) return -1
  return a.localeCompare(b)
}

function GroupBadge({ group }: { group: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      <User className="h-3.5 w-3.5" />
      {group}
    </span>
  )
}

function UserGroupsBadge({ groups }: { groups: string[] }) {
  return (
    <div className="ml-auto flex items-center gap-1.5">
      <GroupBadge group={groups[0]} />
      {groups.length > 1 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex cursor-help items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                +{groups.length - 1}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end" collisionPadding={16} className="flex flex-col items-start gap-1.5">
              {groups.slice(1).map(group => (
                <GroupBadge key={group} group={group} />
              ))}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  )
}

function ErrorPanel({ error }: { error: DashmarkError }) {
  return (
    <motion.div
      className="flex items-center justify-center py-12"
      variants={fadeUp}
      initial="hidden"
      animate="show"
    >
      <div className="mx-auto flex w-full max-w-xl gap-4 rounded-lg border border-error-border bg-error-bg p-6 text-error-text">
        <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold">{strings.errors.unableToLoadServices}</p>
          <p className="mt-1 text-sm">{error.message}</p>
          {error.detail && (
            <p className="mt-2 whitespace-pre-wrap text-xs opacity-80">{error.detail}</p>
          )}
        </div>
      </div>
    </motion.div>
  )
}

type CategoryItem = {
  category: string
  cards: CardType[]
  showStatus: boolean
  isLoading: boolean
}

type CategoryColumnProps = {
  data: CategoryItem
  twoColumn: boolean
  openInNewTab: boolean
}

function CategoryColumn({ data, twoColumn, openInNewTab }: CategoryColumnProps) {
  const { category, cards, showStatus, isLoading } = data
  return (
    <Card className="@container overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground">{category}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={cn('grid grid-cols-1 gap-6', twoColumn && '@[520px]:grid-cols-2')}>
          {cards.map(card => (
            <AppCard key={card.id} card={card} showStatus={showStatus} isLoading={isLoading} openInNewTab={openInNewTab} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function itemsSignature(items: CategoryItem[]): string {
  return items.map(item => `${item.category}:${item.cards.length}`).join('\0')
}

type MasonryGridProps = {
  items: CategoryItem[]
  onReady?: () => void
  animate?: boolean
  openInNewTab: boolean
}

function MasonryGrid({ items, onReady, animate, openInNewTab }: MasonryGridProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const notifiedRef = useRef(false)
  const onReadyRef = useRef(onReady)
  const hasAnimatedRef = useRef(false)
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
    getItemKey: index => items[index]?.category ?? index,
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
      .sort((a, b) => a.start - b.start || a.lane - b.lane)
      .map((item, rank) => [item.index, rank])
  )

  const twoColumn = items.some(item => item.cards.length > 1)
  const showGrid = width > 0

  return (
    <div ref={containerRef}>
      {showGrid && (
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualItems.map(virtualItem => {
            const item = items[virtualItem.index]
            if (!item) return null
            const delay = 0.08 + (visualRank.get(virtualItem.index) ?? 0) * 0.06
            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                className="absolute top-0"
                style={{
                  left: virtualItem.lane * (columnWidth + COLUMN_GUTTER),
                  width: columnWidth,
                  transform: `translateY(${virtualItem.start}px)`
                }}
              >
                <motion.div
                  initial={hasAnimatedRef.current ? false : { opacity: 0, y: 12 }}
                  animate={animate ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
                  transition={{ duration: 0.3, ease: 'easeOut', delay }}
                  onAnimationComplete={() => {
                    hasAnimatedRef.current = true
                  }}
                >
                  <CategoryColumn data={item} twoColumn={twoColumn} openInNewTab={openInNewTab} />
                </motion.div>
              </div>
            )
          })}
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
  initialShowBranding?: boolean
  initialOpenInNewTab?: boolean
  showHeader?: boolean
  showGroups?: boolean
  greeting?: string
  userGroups?: string[]
}

export function Dashboard({
  initialCards,
  initialError,
  initialShowSearch = true,
  initialShowStatus = true,
  initialShowBranding = true,
  initialOpenInNewTab = false,
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
  const [isLoading, setIsLoading] = useState(!initialError)
  const showLoading = useStableLoading(isLoading)
  const [statusUnavailable, setStatusUnavailable] = useState(false)

  useStatusPolling({
    enabled: !error,
    setCards,
    setUnavailable: setStatusUnavailable,
    setLoading: setIsLoading
  })

  const filtered = useMemo(() => {
    const categoryOf = (card: CardType) => categoryName(card).toLowerCase()

    const categoryFiltered = selectedCategory
      ? cards.filter(card => categoryOf(card) === selectedCategory.toLowerCase())
      : cards

    const query = deferredSearch.trim()
    if (!query) return categoryFiltered

    const fuse = new Fuse(categoryFiltered, {
      keys: ['title', 'category', 'searchAliases'],
      threshold: SEARCH_FUZZY_THRESHOLD,
      ignoreLocation: true,
      shouldSort: false
    })
    return fuse.search(query).map(result => result.item)
  }, [cards, deferredSearch, selectedCategory])

  const grouped = useMemo(() => groupByCategory(filtered), [filtered])
  const uncategorised = grouped[UNCATEGORISED] ?? []
  const hasCategories = useMemo(
    () => cards.some(card => Boolean(card.category?.trim())),
    [cards]
  )
  const willRenderMasonry = !error && Object.keys(grouped).length > 0 && hasCategories

  const [masonryLayoutReady, setMasonryLayoutReady] = useState(false)
  const [searchBarDone, setSearchBarDone] = useState(false)

  useEffect(() => {
    if (!willRenderMasonry) setMasonryLayoutReady(true)
  }, [willRenderMasonry])

  const categoryItems = useMemo<CategoryItem[]>(
    () =>
      Object.entries(grouped)
        .sort(([a], [b]) => sortCategories(a, b))
        .map(([category, cards]) => ({
          category,
          cards,
          showStatus: initialShowStatus,
          isLoading: showLoading || statusUnavailable
        })),
    [grouped, initialShowStatus, showLoading, statusUnavailable]
  )
  const categories = useMemo(() => {
    const categoriesByName = groupByCategory(cards)
    return Object.entries(categoriesByName)
      .sort(([a], [b]) => sortCategories(a, b))
      .map(([name, categoryCards]) => ({ name, count: categoryCards.length }))
  }, [cards])

  return (
    <>
      <Toaster />
      {(initialShowSearch || showHeader) && (
        <div className="dashboard-search sticky top-0 z-10 mb-8">
          <div className="pt-18">
            <motion.div
              layout="position"
              className="mx-auto w-full max-w-6xl px-6"
              initial={{ opacity: 0, y: 8 }}
              animate={masonryLayoutReady ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              onAnimationComplete={() => setSearchBarDone(true)}
            >
              {showHeader && (
                <div className={`flex items-center ${initialShowSearch ? 'mb-4' : ''}`}>
                  <h1 className="text-2xl font-semibold tracking-tight">
                    {greeting}
                  </h1>
                  {showGroups && userGroups.length > 0 && (
                    <UserGroupsBadge groups={userGroups} />
                  )}
                </div>
              )}
              {initialShowSearch && (
                <Card className="overflow-hidden bg-surface shadow-none">
                  <CardContent className="flex flex-row items-center gap-4 py-6">
                    {initialShowBranding && (
                      <img src="/brand/icon.svg" alt={strings.app.title} className="h-8 w-8 shrink-0 rounded-lg" />
                    )}
                    <div className="min-w-0 flex-1">
                      <SearchBar value={search} onChange={setSearch} disabled={!!error} />
                    </div>
                    {categories.some(c => c.name !== UNCATEGORISED) && (
                      <CategoryFilter
                        categories={categories}
                        total={cards.length}
                        selected={selectedCategory}
                        onSelect={setSelectedCategory}
                        disabled={!!error}
                      />
                    )}
                  </CardContent>
                </Card>
              )}
            </motion.div>
          </div>
        </div>
      )}

      <div className={`mx-auto w-full max-w-6xl px-6 pb-12 ${initialShowSearch || showHeader ? '' : 'pt-12'}`}>
        <div className="min-h-0">
        {error ? (
          <ErrorPanel error={error} />
        ) : (
          <>
            {Object.keys(grouped).length === 0 ? (
          <div className="flex items-center justify-center py-4">
            <p className="whitespace-nowrap text-muted-foreground">{strings.dashboard.noServices}</p>
          </div>
        ) : !hasCategories ? (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            {uncategorised.map(card => (
              <motion.div key={card.id} variants={fadeUp}>
                <AppCard card={card} showStatus={initialShowStatus} asCard isLoading={showLoading || statusUnavailable} openInNewTab={initialOpenInNewTab} />
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <MasonryGrid items={categoryItems} onReady={() => setMasonryLayoutReady(true)} animate={searchBarDone} openInNewTab={initialOpenInNewTab} />
            )}
          </>
        )}
        </div>
      </div>
    </>
  )
}
