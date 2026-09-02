import type { Messages } from './index'

export const pl = {
  app: {
    title: 'Dashmark',
    about: 'O Dashmark',
    createdBy: 'Utworzone przez',
    copyright: 'Prawa autorskie © 2026 edmogeor'
  },
  meta: {
    description: 'Lekki panel z linkami do usług Docker.'
  },
  category: {
    all: 'Wszystkie kategorie',
    uncategorised: 'Bez kategorii'
  },
  greeting: {
    morning: 'Dzień dobry',
    afternoon: 'Dzień dobry',
    evening: 'Dobry wieczór'
  },
  search: {
    placeholder: 'Szukaj',
    clear: 'Wyczyść wyszukiwanie'
  },
  card: {
    description: 'Opis',
    resourceUsage: 'Metryki',
    cpu: 'CPU',
    memory: 'Pamięć',
    received: 'Sieć przychodząca',
    sent: 'Sieć wychodząca',
    waitingForNetwork: 'Oczekiwanie na następne odświeżenie',
    unavailable: 'Niedostępne',
    loading: (label: string) => `Ładowanie ${label}`,
    metricUnavailable: (title: string) => `Metryka ${title} jest niedostępna`
  },
  dashboard: {
    noServices: 'Nie znaleziono usług',
    moreGroups: (count: number, formattedCount: string) => `Pokaż ${formattedCount} dodatkowe ${count === 1 ? 'grupę' : 'grupy'}`
  },
  status: {
    loading: 'Ładowanie stanu',
    created: 'utworzono',
    restarting: 'ponowne uruchamianie',
    running: 'uruchomiono',
    removing: 'usuwanie',
    paused: 'wstrzymano',
    exited: 'zakończono',
    dead: 'martwy',
    healthy: 'w dobrym stanie',
    unhealthy: 'w złym stanie',
    starting: 'uruchamianie'
  },
  theme: {
    toggle: 'Zmień motyw',
    switchToSystem: 'Użyj motywu systemowego',
    switchToLight: 'Użyj jasnego motywu',
    switchToDark: 'Użyj ciemnego motywu'
  },
  common: {
    close: 'Zamknij',
    true: 'Prawda',
    false: 'Fałsz'
  },
  about: {
    latestStableVersion: 'Najnowsza stabilna wersja',
    installedVersion: 'Zainstalowana wersja',
    checkingForUpdates: 'Sprawdzanie aktualizacji',
    updateAvailable: (version: string) => `Dostępna aktualizacja: ${version}`,
    upToDate: 'Masz najnowszą wersję.'
  },
  metrics: {
    title: 'Metryki',
    networkUsage: 'Użycie sieci',
    viewHistory: (label: string) => `Pokaż historię: ${label}`,
    chart: (label: string) => `Wykres: ${label}`,
    liveDetails: (label: string) => `Dane na żywo: ${label}`,
    collectionFailed: 'Dane metryki są niedostępne.',
    configurationInvalid: 'Konfiguracja metryki jest nieprawidłowa.'
  },
  time: {
    today: 'Dzisiaj',
    yesterday: 'Wczoraj',
    dateTime: (date: string, time: string) => `${date}, ${time}`,
    ranges: {
      day: '24 godz.',
      week: '7 dni',
      month: '30 dni'
    }
  },
  uptime: {
    noChecks: 'Nie zarejestrowano żadnych kontroli',
    successfulChecks: (count: number, formattedCount: string) => `${formattedCount} ${count === 1 ? 'udana kontrola' : 'udane kontrole'}`,
    failedChecks: (count: number, formattedCount: string) => `${formattedCount} ${count === 1 ? 'nieudana kontrola' : 'nieudane kontrole'}`,
    slowestResponse: (value: string) => `najwolniejsza odpowiedź: ${value}`,
    bucketSummary: (time: string, checks: string, responseTime?: string) => `${time}: ${checks}${responseTime ? `, ${responseTime}` : ''}`,
    up: 'Działa',
    down: 'Nie działa',
    partial: 'Częściowo',
    noData: 'Brak danych',
    successful: 'Udane',
    failed: 'Nieudane',
    slowest: 'Najwolniejsze',
    history: 'Historia dostępności',
    period: 'Okres dostępności',
    availability: 'dostępność w wybranym okresie'
  },
  errors: {
    unableToLoadServices: 'Nie można załadować usług',
    statusUpdateFailed: 'Aktualizacja stanu nie powiodła się:',
    serverUnreachable: 'Nie można połączyć się z serwerem.',
    liveUpdatesUnavailable: 'Aktualizacje na żywo są niedostępne. Dane mogą być nieaktualne.',
    dockerUnreachable: 'Docker jest nieosiągalny. Sprawdź DOCKER_HOSTS i montowanie gniazda Docker.',
    configInvalid: 'Plik konfiguracji jest nieprawidłowy.',
    missingGroupsHeader: 'Grupy dostępu są włączone, ale nie otrzymano nagłówka grup z odwrotnego serwera proxy.',
    expectedHeader: (header: string) => `Oczekiwany nagłówek: ${header}`
  }
} satisfies Messages
