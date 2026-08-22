import { useMemo } from 'react'
import Fuse from 'fuse.js'
import type { Card } from '@/lib/docker'
import { SEARCH_FUZZY_THRESHOLD } from '@/lib/constants'
import { strings } from '@/lib/strings'

const UNCATEGORISED = strings.category.uncategorised

function categoryName(card: Card): string {
  return card.category?.trim() || UNCATEGORISED
}

function groupByCategory(cards: Card[]): Record<string, Card[]> {
  const groups: Record<string, Card[]> = {}
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

export type CategoryItem = {
  category: string
  cards: Card[]
}

type DashboardViewModel = {
  grouped: Record<string, Card[]>
  hasCategories: boolean
  isSearching: boolean
  shouldUseCategoryContainers: boolean
  flatCards: Card[]
  willRenderMasonry: boolean
  categoryItems: CategoryItem[]
  categories: { name: string; count: number }[]
}

export function useDashboardViewModel(
  cards: Card[],
  search: string,
  selectedCategory: string | null,
  hasError: boolean
): DashboardViewModel {
  const filtered = useMemo(() => {
    const selected = selectedCategory?.toLowerCase()
    const categoryFiltered = selected
      ? cards.filter(card => categoryName(card).toLowerCase() === selected)
      : cards

    const query = search.trim()
    if (!query) return categoryFiltered

    const fuse = new Fuse(categoryFiltered, {
      keys: ['title', 'category', 'searchAliases'],
      threshold: SEARCH_FUZZY_THRESHOLD,
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
  const isSearching = search.trim().length > 0
  const categoryCount = Object.keys(grouped).length
  const shouldUseCategoryContainers = hasCategories && selectedCategory === null && !isSearching
  const flatCards = shouldUseCategoryContainers ? uncategorised : filtered
  const willRenderMasonry = !hasError && categoryCount > 0 && shouldUseCategoryContainers
  const categoryItems = useMemo<CategoryItem[]>(
    () => Object.entries(grouped)
      .sort(([a], [b]) => sortCategories(a, b))
      .map(([category, cards]) => ({ category, cards })),
    [grouped]
  )
  const categories = useMemo(() => {
    const categoriesByName = groupByCategory(cards)
    return Object.entries(categoriesByName)
      .sort(([a], [b]) => sortCategories(a, b))
      .map(([name, categoryCards]) => ({ name, count: categoryCards.length }))
  }, [cards])

  return {
    grouped,
    hasCategories,
    isSearching,
    shouldUseCategoryContainers,
    flatCards,
    willRenderMasonry,
    categoryItems,
    categories
  }
}
