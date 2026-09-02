// @vitest-environment happy-dom
import { act, createElement, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardLayout, getMasonryVisualRanks, useDelayedLayoutAnimation } from '@/components/DashboardLayout'
import { LocalizationProvider } from '@/components/localization'
import { TooltipControllerProvider } from '@/components/tooltip-controller'
import type { CategoryItem } from '@/components/use-dashboard-view-model'
import type { Card } from '@/lib/docker'
import type { Locale } from '@/i18n'

let width = 0
let container: HTMLDivElement
let root: Root

class TestResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(): void {
    this.callback([], this as unknown as ResizeObserver)
  }
  disconnect(): void {}
  unobserve(): void {}
}

function card(id: string): Card {
  return { id, title: id, url: 'https://example.com', icon: { type: 'placeholder', initials: id }, searchAliases: [], hasContainer: false, access: [] }
}

function category(id: string): CategoryItem {
  return { key: id, category: id, cards: [card(id)] }
}

function renderLayout(items: CategoryItem[], locale: Locale = 'en-US') {
  act(() => {
    root.render(
      createElement(LocalizationProvider, {
        locale,
        children: createElement(
          TooltipControllerProvider,
          null,
          createElement(DashboardLayout, {
            error: null,
            hasResults: true,
            hasCategories: true,
            isSearching: false,
            uncategorised: [],
            categoryItems: items,
            showStatus: false,
            showMetrics: false,
            isLoading: false,
            openInNewTab: false,
            onMasonryReady: vi.fn(),
            animateMasonry: false,
            enableCardLayout: false
          })
        )
      })
    )
  })
}

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  width = 0
  vi.stubGlobal('ResizeObserver', TestResizeObserver)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const elementWidth = this.classList.contains('dashmark-category-grid') ? width : 0
    return { x: 0, y: 0, top: 0, right: elementWidth, bottom: 0, left: 0, width: elementWidth, height: 0, toJSON: () => ({}) }
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('DashboardLayout', () => {
  it('does not render masonry items at an initial zero width', () => {
    renderLayout([category('a')])
    expect(container.querySelector('.dashmark-category-grid-items')).toBeNull()
  })

  it('reassigns lanes after search and category transitions', () => {
    width = 660
    renderLayout([category('a'), category('b'), category('c')])
    renderLayout([category('b'), category('c')])
    expect([...container.querySelectorAll<HTMLElement>('[data-index]')].slice(-2).map((item) => item.style.left)).toEqual(['0px', '340px'])
    renderLayout([category('c'), category('b')])
    expect([...container.querySelectorAll<HTMLElement>('[data-index]')].slice(-2).map((item) => item.style.left)).toEqual(['0px', '340px'])
  })

  it('orders RTL masonry entry animation from the right lane', () => {
    const ranks = getMasonryVisualRanks(
      [
        { index: 0, lane: 0, start: 0 },
        { index: 1, lane: 1, start: 0 }
      ],
      true
    )
    expect([...ranks.entries()]).toEqual([
      [1, 0],
      [0, 1]
    ])
  })

  it('enables card layout only after both entrance animations and its delay', () => {
    vi.useFakeTimers()
    const enabled = vi.fn()
    function LayoutAnimationProbe({ masonryLayoutReady, searchBarDone }: { masonryLayoutReady: boolean; searchBarDone: boolean }) {
      const value = useDelayedLayoutAnimation(masonryLayoutReady, searchBarDone)
      useEffect(() => enabled(value), [value])
      return null
    }
    act(() => root.render(createElement(LayoutAnimationProbe, { masonryLayoutReady: true, searchBarDone: false })))
    act(() => root.render(createElement(LayoutAnimationProbe, { masonryLayoutReady: true, searchBarDone: true })))
    act(() => vi.advanceTimersByTime(299))
    expect(enabled).toHaveBeenLastCalledWith(false)
    act(() => vi.advanceTimersByTime(1))
    expect(enabled).toHaveBeenLastCalledWith(true)
    vi.useRealTimers()
  })
})
