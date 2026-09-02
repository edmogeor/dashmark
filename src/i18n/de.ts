import type { Messages } from './index'

export const de = {
  app: { title: 'Dashmark', about: 'Über Dashmark', createdBy: 'Erstellt von', copyright: 'Urheberrecht © 2026 edmogeor' },
  meta: { description: 'Ein schlankes Dashboard mit Links zu deinen Docker-Diensten.' },
  category: { all: 'Alle Kategorien', uncategorised: 'Ohne Kategorie' },
  greeting: { morning: 'Guten Morgen', afternoon: 'Guten Tag', evening: 'Guten Abend' },
  search: { placeholder: 'Suchen', clear: 'Suche löschen' },
  card: {
    description: 'Beschreibung',
    resourceUsage: 'Metriken',
    cpu: 'CPU',
    memory: 'Arbeitsspeicher',
    received: 'Netzwerk eingehend',
    sent: 'Netzwerk ausgehend',
    waitingForNetwork: 'Warte auf nächste Aktualisierung',
    unavailable: 'Nicht verfügbar',
    loading: (label: string) => `${label} wird geladen`,
    metricUnavailable: (title: string) => `Metrik für ${title} nicht verfügbar`
  },
  dashboard: { noServices: 'Keine Dienste gefunden', moreGroups: (_count: number, formattedCount: string) => `${formattedCount} weitere Gruppen anzeigen` },
  status: {
    loading: 'Status wird geladen',
    created: 'erstellt',
    restarting: 'wird neu gestartet',
    running: 'läuft',
    removing: 'wird entfernt',
    paused: 'pausiert',
    exited: 'beendet',
    dead: 'nicht verfügbar',
    healthy: 'fehlerfrei',
    unhealthy: 'fehlerhaft',
    starting: 'wird gestartet'
  },
  theme: { toggle: 'Design wechseln', switchToSystem: 'Zum Systemdesign wechseln', switchToLight: 'Zum hellen Design wechseln', switchToDark: 'Zum dunklen Design wechseln' },
  common: { close: 'Schließen', true: 'Wahr', false: 'Falsch' },
  about: {
    latestStableVersion: 'Neueste stabile Version',
    installedVersion: 'Installierte Version',
    checkingForUpdates: 'Suche nach Aktualisierungen',
    updateAvailable: (version: string) => `Aktualisierung verfügbar: ${version}`,
    upToDate: 'Du bist auf dem neuesten Stand.'
  },
  metrics: {
    title: 'Metriken',
    networkUsage: 'Netzwerknutzung',
    viewHistory: (label: string) => `Verlauf von ${label} anzeigen`,
    chart: (label: string) => `Diagramm für ${label}`,
    liveDetails: (label: string) => `Live-Details für ${label}`,
    collectionFailed: 'Metrikdaten sind nicht verfügbar.',
    configurationInvalid: 'Metrikkonfiguration ist ungültig.'
  },
  time: { today: 'Heute', yesterday: 'Gestern', dateTime: (date: string, time: string) => `${date}, ${time}`, ranges: { day: '24 Std.', week: '7 Tg.', month: '30 Tg.' } },
  uptime: {
    noChecks: 'Keine Prüfungen wurden aufgezeichnet',
    successfulChecks: (count: number, formattedCount: string) => `${formattedCount} erfolgreiche Prüfung${count === 1 ? '' : 'en'}`,
    failedChecks: (count: number, formattedCount: string) => `${formattedCount} fehlgeschlagene Prüfung${count === 1 ? '' : 'en'}`,
    slowestResponse: (value: string) => `langsamste Antwort ${value}`,
    bucketSummary: (time: string, checks: string, responseTime?: string) => `${time}: ${checks}${responseTime ? `, ${responseTime}` : ''}`,
    up: 'Verfügbar',
    down: 'Nicht verfügbar',
    partial: 'Teilweise',
    noData: 'Keine Daten',
    successful: 'Erfolgreich',
    failed: 'Fehlgeschlagen',
    slowest: 'Am langsamsten',
    history: 'Verfügbarkeitsverlauf',
    period: 'Verfügbarkeitszeitraum',
    availability: 'Verfügbarkeit im ausgewählten Zeitraum'
  },
  errors: {
    unableToLoadServices: 'Dienste konnten nicht geladen werden',
    statusUpdateFailed: 'Statusaktualisierung fehlgeschlagen:',
    serverUnreachable: 'Server konnte nicht erreicht werden.',
    liveUpdatesUnavailable: 'Live-Aktualisierungen sind nicht verfügbar. Die Daten können veraltet sein.',
    dockerUnreachable: 'Docker ist nicht erreichbar. Prüfe DOCKER_HOSTS und die Docker-Socket-Einbindung.',
    configInvalid: 'Die Konfigurationsdatei ist ungültig.',
    missingGroupsHeader: 'Zugriffsgruppen sind aktiviert, aber der Gruppen-Header wurde nicht vom Reverse Proxy empfangen.',
    expectedHeader: (header: string) => `Erwarteter Header: ${header}`
  }
} satisfies Messages
