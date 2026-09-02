import { enUS } from './en-US'
import { ar } from './ar'
import { de } from './de'
import { es } from './es'
import { fr } from './fr'
import { it } from './it'
import { ja } from './ja'
import { ko } from './ko'
import { nl } from './nl'
import { pl } from './pl'
import { ptBR } from './pt-BR'
import { ru } from './ru'
import { tr } from './tr'
import { uk } from './uk'
import { zhHans } from './zh-Hans'
import { zhHant } from './zh-Hant'

export const locales = ['en-US', 'de', 'es', 'fr', 'it', 'nl', 'pl', 'pt-BR', 'ru', 'tr', 'uk', 'ar', 'zh-Hans', 'zh-Hant', 'ja', 'ko'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'en-US'

export type TextDirection = 'ltr' | 'rtl'

const rtlLanguageCodes = new Set(['ar', 'fa', 'he', 'ur'])

export function getTextDirection(locale: string): TextDirection {
  return rtlLanguageCodes.has(locale.split('-')[0]!.toLowerCase()) ? 'rtl' : 'ltr'
}

type Localized<T> = T extends (...args: infer Args) => string ? (...args: Args) => string : T extends string ? string : { [Key in keyof T]: Localized<T[Key]> }

export type Messages = Localized<typeof enUS>

// Future locale catalogs use this helper to remain structurally complete.
export function defineMessages(messages: Messages): Messages {
  return messages
}

const messagesByLocale: Record<Locale, Messages> = {
  'en-US': defineMessages(enUS),
  de,
  es,
  fr,
  it,
  nl,
  pl,
  'pt-BR': ptBR,
  ru,
  tr,
  uk,
  ar,
  'zh-Hans': zhHans,
  'zh-Hant': zhHant,
  ja,
  ko
}

export function resolveLocale(value: string | undefined): Locale {
  return locales.includes(value as Locale) ? (value as Locale) : defaultLocale
}

export function getMessages(locale: Locale = defaultLocale): Messages {
  return messagesByLocale[locale]
}

export const strings = getMessages()

// Keep calendar formatting behind the localization boundary so locale selection
// can be introduced without revisiting every date and time display.
export function createDateTimeFormatter(options: Intl.DateTimeFormatOptions, locale: Locale = defaultLocale): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale, options)
}

export function formatDateTime(value: number | Date, options: Intl.DateTimeFormatOptions, locale: Locale = defaultLocale): string {
  return createDateTimeFormatter(options, locale).format(value)
}

function isKnownStatus(value: string): value is keyof typeof strings.status {
  return value in strings.status
}

export function statusLabel(value: string, messages: Messages = strings): string {
  return isKnownStatus(value) ? messages.status[value] : value
}
