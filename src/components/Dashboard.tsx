import { useDeferredValue, useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { LayoutGroup, motion, type Transition } from 'framer-motion'
import { SearchBar } from './SearchBar'
import { CategoryFilter } from './CategoryFilter'
import { DashboardLayout, useDelayedLayoutAnimation } from './DashboardLayout'
import { useDashboardViewModel } from './use-dashboard-view-model'
import { Card, CardContent } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { User } from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'
import type { Card as CardType } from '@/lib/docker'
import type { DashmarkError } from '@/lib/errors'
import { useStableLoading } from '@/lib/use-stable-loading'
import { useRealtimeStatus } from './use-realtime'
import { usePageOverflow } from '@/lib/use-page-overflow'
import type { Locale } from '@/i18n'
import { cn } from '@/lib/utils'
import { badgeColor } from '@/lib/badge-color'
import { STATUS_TOAST_ID, TOOLTIP_DELAY_MS } from '@/lib/constants'
import { TooltipControllerProvider, useTooltipController } from './tooltip-controller'
import { AboutDialog } from './AboutDialog'
import { useIsDark } from '@/lib/use-is-dark'
import { clearErrorToast, showErrorToast } from '@/lib/error-toasts'
import { LocalizationProvider, useLocalization } from './localization'

const POSITION_TRANSITION: Transition = { duration: 0.25, ease: 'easeOut' }
const brandMarkDarkPath = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/brand/logo-mark-dark.svg`
const brandMarkLightPath = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/brand/logo-mark-light.svg`

function GroupBadge({ group, colorIndex }: { group: string; colorIndex: number }) {
  return (
    <span className={cn('dashmark-group-badge inline-flex select-none items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', badgeColor(colorIndex))}>
      <User className="h-3.5 w-3.5" />
      {group}
    </span>
  )
}

function UserGroupsBadge({ groups, colorOffset }: { groups: string[]; colorOffset: number }) {
  const { locale, messages } = useLocalization()
  const { activeTooltip, setActiveTooltip } = useTooltipController()
  const tooltipId = 'more-groups'

  function handleMoreGroupsPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.pointerType !== 'touch') return

    event.preventDefault()
    setActiveTooltip(activeTooltip === tooltipId ? null : tooltipId)
  }

  return (
    <div className="dashmark-user-groups ms-3 flex items-center gap-1.5">
      <GroupBadge group={groups[0]} colorIndex={colorOffset} />
      {groups.length > 1 && (
        <TooltipProvider delayDuration={TOOLTIP_DELAY_MS}>
          <Tooltip open={activeTooltip === tooltipId} onOpenChange={(open) => setActiveTooltip(open ? tooltipId : null)}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={messages.dashboard.moreGroups(groups.length - 1, new Intl.NumberFormat(locale).format(groups.length - 1))}
                className="dashmark-group-badge dashmark-group-badge-overflow inline-flex cursor-help select-none items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                onClick={(event) => event.preventDefault()}
                onPointerDown={handleMoreGroupsPointerDown}
              >
                +{new Intl.NumberFormat(locale).format(groups.length - 1)}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6} align="end" collisionPadding={16} className="flex flex-col items-start gap-1.5 py-2.5">
              {groups.slice(1).map((group, index) => (
                <GroupBadge key={group} group={group} colorIndex={colorOffset + index + 1} />
              ))}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  )
}

type DashboardProps = {
  locale: Locale
  initialCards: CardType[]
  initialError?: DashmarkError
  initialShowSearch?: boolean
  initialShowStatus?: boolean
  initialShowMetrics?: boolean
  initialShowBranding?: boolean
  initialOpenInNewTab?: boolean
  enableRealtime?: boolean
  categoryOrder?: string[]
  showHeader?: boolean
  showGroups?: boolean
  greeting?: string
  userGroups?: string[]
}

type DashboardGreetingProps = {
  greeting?: string
  showGroups: boolean
  userGroups: string[]
  groupColorOffset: number
  hasSearch: boolean
}

function DashboardGreeting({ greeting, showGroups, userGroups, groupColorOffset, hasSearch }: DashboardGreetingProps) {
  return (
    <div className={`dashmark-greeting-container flex items-end justify-between ${hasSearch ? 'mb-4' : ''}`}>
      <h1 className="dashmark-greeting text-xl leading-[1.2] font-[550] tracking-[-0.02em] sm:text-[1.375rem] lg:text-2xl">{greeting}</h1>
      <div className="flex shrink-0 items-center gap-3">
        {showGroups && userGroups.length > 0 && <UserGroupsBadge groups={userGroups} colorOffset={groupColorOffset} />}
        <AboutDialog />
      </div>
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

function DashboardSearchPanel({ showBranding, search, setSearch, error, categories, hasCategories, totalCards, selectedCategory, setSelectedCategory }: DashboardSearchPanelProps) {
  const { messages } = useLocalization()
  const brandMarkPath = useIsDark() ? brandMarkLightPath : brandMarkDarkPath

  return (
    <Card className="dashmark-search-panel dashmark-card-gradient overflow-hidden bg-background shadow-none dark:bg-surface">
      <CardContent className="dashmark-search-panel-content flex flex-row items-center gap-4 p-5">
        {showBranding && <img src={brandMarkPath} alt={messages.app.title} className="dashmark-brand h-8 w-8 shrink-0" />}
        <div className="min-w-0 flex-1">
          <SearchBar value={search} onChange={setSearch} disabled={!!error} />
        </div>
        {hasCategories && <CategoryFilter categories={categories} total={totalCards} selected={selectedCategory} onSelect={setSelectedCategory} disabled={!!error} />}
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
  groupColorOffset: number
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
  groupColorOffset,
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
          {showHeader && <DashboardGreeting greeting={greeting} showGroups={showGroups} userGroups={userGroups} groupColorOffset={groupColorOffset} hasSearch={showSearch} />}
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

function DashboardContent({
  initialCards,
  initialError,
  initialShowSearch = true,
  initialShowStatus = true,
  initialShowMetrics = true,
  initialShowBranding = true,
  initialOpenInNewTab = false,
  enableRealtime = true,
  categoryOrder = [],
  showHeader = false,
  showGroups = false,
  greeting,
  userGroups = []
}: DashboardProps) {
  const { messages } = useLocalization()
  const [cards, setCards] = useState<CardType[]>(initialCards)
  const [error] = useState<DashmarkError | null>(initialError ?? null)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(enableRealtime && !initialError)
  const showLoading = useStableLoading(isLoading)
  const [statusUnavailable, setStatusUnavailable] = useState(false)
  const hasPageOverflow = usePageOverflow()

  useRealtimeStatus({
    enabled: enableRealtime && !error,
    setCards,
    setUnavailable: setStatusUnavailable,
    setLoading: setIsLoading
  })

  useEffect(() => {
    if (statusUnavailable) showErrorToast(STATUS_TOAST_ID, messages.errors.liveUpdatesUnavailable)
    else clearErrorToast(STATUS_TOAST_ID, { immediate: true })
  }, [statusUnavailable])

  const { hasResults, hasCategories, isSearching, shouldUseCategoryContainers, flatCards, willRenderMasonry, categoryItems, categories } = useDashboardViewModel(
    cards,
    deferredSearch,
    selectedCategory,
    Boolean(error),
    categoryOrder,
    messages.category.uncategorised
  )
  const groupColorOffset = new Set(cards.flatMap((card) => (card.host ? [card.host] : []))).size

  const [masonryLayoutReady, setMasonryLayoutReady] = useState(false)
  const [searchBarDone, setSearchBarDone] = useState(false)
  const cardLayoutEnabled = useDelayedLayoutAnimation(masonryLayoutReady, searchBarDone)

  useEffect(() => {
    if (!willRenderMasonry) setMasonryLayoutReady(true)
  }, [willRenderMasonry])

  function handleMasonryReady() {
    setMasonryLayoutReady(true)
  }

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
          groupColorOffset={groupColorOffset}
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
            <DashboardLayout
              error={error}
              hasResults={hasResults}
              hasCategories={shouldUseCategoryContainers}
              isSearching={isSearching}
              uncategorised={flatCards}
              categoryItems={categoryItems}
              showStatus={initialShowStatus}
              showMetrics={initialShowMetrics}
              isLoading={showLoading || statusUnavailable}
              openInNewTab={initialOpenInNewTab}
              onMasonryReady={handleMasonryReady}
              animateMasonry={searchBarDone}
              enableCardLayout={cardLayoutEnabled}
            />
          </div>
        </div>
      </LayoutGroup>
    </>
  )
}

export function Dashboard(props: DashboardProps) {
  const { locale, ...dashboardProps } = props
  return (
    <LocalizationProvider locale={locale}>
      <TooltipControllerProvider>
        <DashboardContent {...dashboardProps} locale={locale} />
      </TooltipControllerProvider>
    </LocalizationProvider>
  )
}
