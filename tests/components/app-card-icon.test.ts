import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AppCardIcon } from '@/components/AppCardIcon'
import { useIsDark } from '@/lib/use-is-dark'

vi.mock('@/lib/use-is-dark', () => ({ useIsDark: vi.fn() }))

describe('AppCardIcon', () => {
  it.each([false, true])('selects the configured icon for dark mode=%s', (isDark) => {
    vi.mocked(useIsDark).mockReturnValue(isDark)
    const markup = renderToStaticMarkup(
      createElement(AppCardIcon, {
        title: 'Paseo',
        asCard: false,
        icon: { type: 'image', src: '/icons/base.svg', alt: 'Paseo', lightSrc: '/icons/light.svg', darkSrc: '/icons/dark.svg', explicitTheme: true }
      })
    )

    expect(markup).toContain(`<img src="/icons/${isDark ? 'dark' : 'light'}.svg"`)
  })

  it.each([false, true])('keeps a single custom icon in dark mode=%s', (isDark) => {
    vi.mocked(useIsDark).mockReturnValue(isDark)
    const markup = renderToStaticMarkup(createElement(AppCardIcon, { title: 'Paseo', asCard: false, icon: { type: 'image', src: '/icons/paseo.svg', alt: 'Paseo' } }))

    expect(markup).toContain('<img src="/icons/paseo.svg"')
  })

  it.each([false, true])('keeps automatic catalog contrast handling in dark mode=%s', (isDark) => {
    vi.mocked(useIsDark).mockReturnValue(isDark)
    const markup = renderToStaticMarkup(
      createElement(AppCardIcon, {
        title: 'Paseo',
        asCard: false,
        icon: { type: 'image', src: '/icons/base.svg', alt: 'Paseo', contrast: 'dark', lightSrc: '/icons/light.svg' }
      })
    )

    expect(markup).toContain(`<img src="/icons/${isDark ? 'light' : 'base'}.svg"`)
  })
})
