import { describe, expect, it } from 'vitest'
import { getTextDirection, locales, resolveLocale } from '@/i18n'

const expectedLocales = ['en-US', 'de', 'es', 'fr', 'it', 'nl', 'pl', 'pt-BR', 'ru', 'tr', 'uk', 'ar', 'zh-Hans', 'zh-Hant', 'ja', 'ko']

describe('locales', () => {
  it('includes every bundled locale', () => {
    expect(locales).toEqual(expectedLocales)
  })

  it('resolves supported locales and falls back to US English', () => {
    expect(resolveLocale('ar')).toBe('ar')
    expect(resolveLocale('pt-BR')).toBe('pt-BR')
    expect(resolveLocale('en-GB')).toBe('en-US')
  })
})

describe('getTextDirection', () => {
  it('uses RTL for supported right-to-left language codes', () => {
    expect(getTextDirection('ar')).toBe('rtl')
    expect(getTextDirection('ar-SA')).toBe('rtl')
    expect(getTextDirection('he-IL')).toBe('rtl')
  })

  it('uses LTR for all other locales', () => {
    expect(getTextDirection('en-US')).toBe('ltr')
    expect(getTextDirection('ja-JP')).toBe('ltr')
  })
})
