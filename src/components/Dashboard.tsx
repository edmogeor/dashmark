import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import Fuse from 'fuse.js'
import { SearchBar } from './SearchBar'
import { CategoryFilter } from './CategoryFilter'
import { AppCard } from './AppCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { CircleAlert, User } from 'lucide-react'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import type { Card as CardType } from '@/lib/docker'
import type { DashmarkError } from '@/lib/errors'
import { useStableLoading } from '@/lib/use-stable-loading'
import { strings } from '@/lib/strings'

const UNCATEGORISED = strings.category.uncategorised
const STATUS_POLL_INTERVAL_MS = 30_000
const STATUS_TOAST_ID = 'status-warning'

const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.06, delayChildren: 0.08 }
  }
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } }
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

export function Dashboard({
  initialCards,
  initialError,
  initialShowSearch = true,
  initialShowStatus = true,
  initialShowBranding = true,
  showHeader = false,
  showGroups = false,
  greeting,
  userGroups = []
}: {
  initialCards: CardType[]
  initialError?: DashmarkError
  initialShowSearch?: boolean
  initialShowStatus?: boolean
  initialShowBranding?: boolean
  showHeader?: boolean
  showGroups?: boolean
  greeting?: string
  userGroups?: string[]
}) {
  const [cards, setCards] = useState<CardType[]>(initialCards)
  const [error] = useState<DashmarkError | null>(initialError ?? null)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const showSearch = initialShowSearch
  const showStatus = initialShowStatus
  const showBranding = initialShowBranding
  const [isLoading, setIsLoading] = useState(!initialError)
  const showLoading = useStableLoading(isLoading)
  const [statusUnavailable, setStatusUnavailable] = useState(false)
  const statusToastDismissed = useRef(false)
  const statusToastRecovering = useRef(false)

  function showStatusToast(description: string) {
    statusToastRecovering.current = false
    if (statusToastDismissed.current) return
    toast.error(strings.errors.statusUpdateFailed, {
      description,
      id: STATUS_TOAST_ID,
      duration: Infinity,
      closeButton: true,
      onDismiss: () => {
        if (statusToastRecovering.current) return
        statusToastDismissed.current = true
      }
    })
  }

  useEffect(() => {
    if (error) return

    const controller = new AbortController()
    let interval: ReturnType<typeof setInterval> | null = null

    async function pollStatus() {
      setIsLoading(true)
      try {
        const res = await fetch('/api/status', { signal: controller.signal })
        const data = await res.json() as {
          statuses?: Record<string, { state?: string; health?: string }>
          error?: DashmarkError
        }
        if (controller.signal.aborted) return
        if (data.error) {
          setStatusUnavailable(true)
          showStatusToast(data.error.message)
        } else if (data.statuses) {
          setStatusUnavailable(false)
          statusToastRecovering.current = true
          statusToastDismissed.current = false
          toast.dismiss(STATUS_TOAST_ID)
          setCards(prev =>
            prev.map(card => {
              if (!card.hasContainer) return card
              const status = data.statuses![card.id]
              if (!status) {
                if (card.state === undefined && card.health === undefined) return card
                return { ...card, state: undefined, health: undefined }
              }
              if (card.state === status.state && card.health === status.health) return card
              return { ...card, state: status.state, health: status.health }
            })
          )
        }
      } catch {
        if (controller.signal.aborted) return
        setStatusUnavailable(true)
        showStatusToast(strings.errors.serverUnreachable)
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    pollStatus()
    interval = setInterval(pollStatus, STATUS_POLL_INTERVAL_MS)

    return () => {
      controller.abort()
      if (interval) clearInterval(interval)
    }
  }, [error])

  const filtered = useMemo(() => {
    const categoryOf = (card: CardType) => categoryName(card).toLowerCase()

    const categoryFiltered = selectedCategory
      ? cards.filter(card => categoryOf(card) === selectedCategory.toLowerCase())
      : cards

    const query = search.trim()
    if (!query) return categoryFiltered

    const fuse = new Fuse(categoryFiltered, {
      keys: ['title', 'category', 'searchAliases'],
      threshold: 0.2,
      ignoreLocation: true,
      shouldSort: false
    })
    return fuse.search(query).map(result => result.item)
  }, [cards, search, selectedCategory])

  const grouped = useMemo(() => groupByCategory(filtered), [filtered])
  const uncategorised = grouped[UNCATEGORISED] ?? []
  const hasCategories = useMemo(
    () => cards.some(card => Boolean(card.category?.trim())),
    [cards]
  )
  const categories = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const card of cards) {
      const category = categoryName(card)
      counts[category] = (counts[category] ?? 0) + 1
    }
    return Object.keys(counts)
      .sort(sortCategories)
      .map(name => ({ name, count: counts[name] ?? 0 }))
  }, [cards])

  return (
    <>
      <Toaster />
      {(showSearch || showHeader) && (
        <div className="dashboard-search sticky top-0 z-10 mb-8">
          <div className="pt-18">
            <motion.div
              layout
              className="mx-auto w-full max-w-6xl px-6"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              {showHeader && (
                <div className={`flex items-center ${showSearch ? 'mb-4' : ''}`}>
                  <h1 className="text-2xl font-semibold tracking-tight">
                    {greeting}
                  </h1>
                  {showGroups && userGroups.length > 0 && (
                    <div className="ml-auto flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        <User className="h-3.5 w-3.5" />
                        {userGroups[0]}
                      </span>
                      {userGroups.length > 1 && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex cursor-help items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                                +{userGroups.length - 1}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" align="end" collisionPadding={16} className="flex flex-col items-start gap-1.5">
                              {userGroups.slice(1).map(group => (
                                <span
                                  key={group}
                                  className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
                                >
                                  <User className="h-3.5 w-3.5" />
                                  {group}
                                </span>
                              ))}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  )}
                </div>
              )}
              {showSearch && (
                <Card className="overflow-hidden bg-surface shadow-none">
                  <CardContent className="flex flex-row items-center gap-4 py-6">
                    {showBranding && (
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

      <div className={`mx-auto w-full max-w-6xl px-6 pb-12 ${showSearch || showHeader ? '' : 'pt-12'}`}>
        <div className="min-h-0">
        {error ? (
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
        ) : (
          <>
            {Object.keys(grouped).length === 0 ? (
          <div className="flex items-center justify-center py-4">
            <p className="whitespace-nowrap text-muted-foreground">{strings.dashboard.noServices}</p>
          </div>
        ) : !hasCategories ? (
          <motion.div
            layout="position"
            className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            variants={staggerContainer}
            initial="hidden"
            animate="show"
          >
            <AnimatePresence mode="popLayout">
              {uncategorised.map(card => (
                <motion.div
                  key={card.id}
                  layout="position"
                  variants={fadeUp}
                  exit={{ opacity: 0, y: -8, transition: { duration: 0.15, ease: 'easeOut' } }}
                >
                  <AppCard card={card} showStatus={showStatus} asCard isLoading={showLoading || statusUnavailable} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        ) : (
          <motion.div
            layout="position"
            className="grid grid-cols-1 gap-6 sm:grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))]"
            variants={staggerContainer}
            initial="hidden"
            animate="show"
          >
            <AnimatePresence mode="popLayout">
              {Object.entries(grouped)
                .sort(([a], [b]) => sortCategories(a, b))
                .map(([category, categoryCards]) => (
                <motion.div
                  key={category}
                  layout="position"
                  variants={fadeUp}
                  exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.2, ease: 'easeOut' } }}
                >
                  <Card className="@container overflow-hidden">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground">{category}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <motion.div
                        layout="position"
                        className="service-grid grid grid-cols-1 gap-6 @[520px]:grid-cols-2"
                      >
                        <AnimatePresence mode="popLayout" initial={false}>
                          {categoryCards.map(card => (
                            <motion.div
                              key={card.id}
                              layout="position"
                              initial={false}
                              exit={{ opacity: 0, y: -8, transition: { duration: 0.15, ease: 'easeOut' } }}
                            >
                              <AppCard card={card} showStatus={showStatus} isLoading={showLoading || statusUnavailable} />
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </motion.div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
            )}
          </>
        )}
        </div>
      </div>
    </>
  )
}
