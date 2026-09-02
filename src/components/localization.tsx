import { createContext, useContext, type ReactNode } from 'react'
import { defaultLocale, getMessages, type Locale, type Messages } from '@/i18n'

type Localization = {
  locale: Locale
  messages: Messages
}

const LocalizationContext = createContext<Localization>({
  locale: defaultLocale,
  messages: getMessages()
})

export function LocalizationProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocalizationContext value={{ locale, messages: getMessages(locale) }}>{children}</LocalizationContext>
}

export function useLocalization(): Localization {
  return useContext(LocalizationContext)
}
