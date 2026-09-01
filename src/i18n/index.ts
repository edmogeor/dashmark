import { en } from './en'

export const locales = ['en-US'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'en-US'

type Localized<T> = T extends (...args: infer Args) => string ? (...args: Args) => string : T extends string ? string : { [Key in keyof T]: Localized<T[Key]> }

export type Messages = Localized<typeof en>

// Future locale catalogs use this helper to remain structurally complete.
export function defineMessages(messages: Messages): Messages {
  return messages
}

const messagesByLocale: Record<Locale, Messages> = {
  'en-US': defineMessages(en)
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

export function statusLabel(value: string): string {
  return isKnownStatus(value) ? strings.status[value] : value
}
