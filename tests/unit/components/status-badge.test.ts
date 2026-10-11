import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { StatusBadge } from '@/components/StatusBadge'

describe('StatusBadge', () => {
  it('shows the reported container health before its state', () => {
    const markup = renderToStaticMarkup(createElement(StatusBadge, { state: 'running', health: 'healthy' }))

    expect(markup).toContain('healthy')
    expect(markup).not.toContain('>running<')
  })
})
