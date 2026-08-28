import { useMemo } from 'react'
import Fuse from 'fuse.js'
import type { Card } from '@/lib/docker'
import { SEARCH_FUZZY_THRESHOLD } from '@/lib/constants'
import { strings } from '@/lib/strings'

const UNCATEGORISED = strings.category.uncategorised
const UNCATEGORISED_KEY = ''

function normalizeUrlSearch(value: string): string {
  return value.replace(/^https?:\/\/(?:www\.)?/i, '')
}

function categoryName(card: Card): string {
  return card.category?.trim() || UNCATEGORISED
}

function categoryKey(category: string | undefined): string {
  return category?.trim().toLowerCase() ?? UNCATEGORISED_KEY
}

function selectedCategoryKey(category: string): string {
  return category === UNCATEGORISED ? UNCATEGORISED_KEY : categoryKey(category)
}

function categoryOrderByKey(categoryOrder: string[]): Map<string, number> {
  const order = new Map<string, number>()
  for (const category of categoryOrder) {
    const key = categoryKey(category)
    if (key && !order.has(key)) order.set(key, order.size)
  }
  return order
}

export type CategoryItem = {
  key: string
  category: string
  cards: Card[]
}

export function buildCategoryItems(cards: Card[], categoryOrder: string[] = []): CategoryItem[] {
  const configuredNames = new Map(categoryOrder.map((category) => [categoryKey(category), category]))
  const groups = new Map<string, CategoryItem>()
  for (const card of cards) {
    const key = categoryKey(card.category)
    const existing = groups.get(key)
    if (existing) {
      existing.cards.push(card)
      continue
    }
    groups.set(key, {
      key,
      category: configuredNames.get(key) ?? categoryName(card),
      cards: [card]
    })
  }

  const order = categoryOrderByKey(categoryOrder)
  return [...groups.values()].sort((a, b) => {
    if (a.key === UNCATEGORISED_KEY) return 1
    if (b.key === UNCATEGORISED_KEY) return -1

    const orderA = order.get(a.key)
    const orderB = order.get(b.key)
    if (orderA !== undefined || orderB !== undefined) {
      return (orderA ?? Infinity) - (orderB ?? Infinity)
    }

    return a.category.localeCompare(b.category)
  })
}

type DashboardViewModel = {
  hasResults: boolean
  hasCategories: boolean
  isSearching: boolean
  shouldUseCategoryContainers: boolean
  flatCards: Card[]
  willRenderMasonry: boolean
  categoryItems: CategoryItem[]
  categories: { name: string; count: number }[]
}

export function useDashboardViewModel(cards: Card[], search: string, selectedCategory: string | null, hasError: boolean, categoryOrder: string[]): DashboardViewModel {
  const filtered = useMemo(() => {
    const selected = selectedCategory === null ? null : selectedCategoryKey(selectedCategory)
    const categoryFiltered = selected !== null ? cards.filter((card) => categoryKey(card.category) === selected) : cards

    const query = normalizeUrlSearch(search.trim())
    if (!query) return categoryFiltered

    const fuse = new Fuse(categoryFiltered, {
      keys: ['title', 'url', 'category', 'searchAliases'],
      threshold: SEARCH_FUZZY_THRESHOLD,
      ignoreLocation: true,
      shouldSort: false
    })
    return fuse.search(query).map((result) => result.item)
  }, [cards, search, selectedCategory])

  const categoryItems = useMemo(() => buildCategoryItems(filtered, categoryOrder), [filtered, categoryOrder])
  const uncategorised = categoryItems.find((item) => item.key === UNCATEGORISED_KEY)?.cards ?? []
  const hasCategories = useMemo(() => cards.some((card) => Boolean(card.category?.trim())), [cards])
  const isSearching = search.trim().length > 0
  const categoryCount = categoryItems.length
  const shouldUseCategoryContainers = hasCategories && selectedCategory === null && !isSearching
  const flatCards = shouldUseCategoryContainers ? uncategorised : filtered
  const willRenderMasonry = !hasError && categoryCount > 0 && shouldUseCategoryContainers
  const categories = useMemo(() => buildCategoryItems(cards, categoryOrder).map(({ category, cards }) => ({ name: category, count: cards.length })), [cards, categoryOrder])

  return {
    hasResults: filtered.length > 0,
    hasCategories,
    isSearching,
    shouldUseCategoryContainers,
    flatCards,
    willRenderMasonry,
    categoryItems,
    categories
  }
}
