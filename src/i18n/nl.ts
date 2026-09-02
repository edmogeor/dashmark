import type { Messages } from './index'

export const nl = {
  app: { title: 'Dashmark', about: 'Over Dashmark', createdBy: 'Gemaakt door', copyright: 'Copyright © 2026 edmogeor' },
  meta: { description: 'Een lichtgewicht dashboard met koppelingen naar je Docker-services.' },
  category: { all: 'Alle categorieën', uncategorised: 'Zonder categorie' },
  greeting: { morning: 'Goedemorgen', afternoon: 'Goedemiddag', evening: 'Goedenavond' },
  search: { placeholder: 'Zoeken', clear: 'Zoekopdracht wissen' },
  card: {
    description: 'Beschrijving',
    resourceUsage: 'Metrieken',
    cpu: 'CPU',
    memory: 'Geheugen',
    received: 'Netwerk in',
    sent: 'Netwerk uit',
    waitingForNetwork: 'Wachten op volgende verversing',
    unavailable: 'Niet beschikbaar',
    loading: (label: string) => `${label} laden`,
    metricUnavailable: (title: string) => `Metriek van ${title} niet beschikbaar`
  },
  dashboard: { noServices: 'Geen services gevonden', moreGroups: (count: number, formattedCount: string) => `Nog ${formattedCount} groep${count === 1 ? '' : 'en'} tonen` },
  status: {
    loading: 'Status laden',
    created: 'gemaakt',
    restarting: 'opnieuw starten',
    running: 'actief',
    removing: 'verwijderen',
    paused: 'gepauzeerd',
    exited: 'gestopt',
    dead: 'inactief',
    healthy: 'gezond',
    unhealthy: 'ongezond',
    starting: 'starten'
  },
  theme: { toggle: 'Thema wisselen', switchToSystem: 'Naar systeemthema', switchToLight: 'Naar lichte modus', switchToDark: 'Naar donkere modus' },
  common: { close: 'Sluiten', true: 'Waar', false: 'Onwaar' },
  about: {
    latestStableVersion: 'Nieuwste stabiele versie',
    installedVersion: 'Geïnstalleerde versie',
    checkingForUpdates: 'Zoeken naar updates',
    updateAvailable: (version: string) => `Update beschikbaar: ${version}`,
    upToDate: 'Je bent bijgewerkt.'
  },
  metrics: {
    title: 'Metrieken',
    networkUsage: 'Netwerkgebruik',
    viewHistory: (label: string) => `Geschiedenis van ${label} bekijken`,
    chart: (label: string) => `Grafiek van ${label}`,
    liveDetails: (label: string) => `Livegegevens van ${label}`,
    collectionFailed: 'Metriekgegevens zijn niet beschikbaar.',
    configurationInvalid: 'Metriekconfiguratie is ongeldig.'
  },
  time: { today: 'Vandaag', yesterday: 'Gisteren', dateTime: (date: string, time: string) => `${date}, ${time}`, ranges: { day: '24 u', week: '7 d', month: '30 d' } },
  uptime: {
    noChecks: 'Er zijn geen controles geregistreerd',
    successfulChecks: (count: number, formattedCount: string) => `${formattedCount} succesvolle controle${count === 1 ? '' : 's'}`,
    failedChecks: (count: number, formattedCount: string) => `${formattedCount} mislukte controle${count === 1 ? '' : 's'}`,
    slowestResponse: (value: string) => `traagste respons ${value}`,
    bucketSummary: (time: string, checks: string, responseTime?: string) => `${time}: ${checks}${responseTime ? `, ${responseTime}` : ''}`,
    up: 'Beschikbaar',
    down: 'Niet beschikbaar',
    partial: 'Gedeeltelijk',
    noData: 'Geen gegevens',
    successful: 'Geslaagd',
    failed: 'Mislukt',
    slowest: 'Traagste',
    history: 'Beschikbaarheidsgeschiedenis',
    period: 'Beschikbaarheidsperiode',
    availability: 'beschikbaarheid voor de geselecteerde periode'
  },
  errors: {
    unableToLoadServices: 'Kan services niet laden',
    statusUpdateFailed: 'Statusupdate mislukt:',
    serverUnreachable: 'Kan de server niet bereiken.',
    liveUpdatesUnavailable: 'Live-updates zijn niet beschikbaar. Gegevens kunnen verouderd zijn.',
    dockerUnreachable: 'Docker is niet bereikbaar. Controleer DOCKER_HOSTS en de Docker-socketkoppeling.',
    configInvalid: 'Het configuratiebestand is ongeldig.',
    missingGroupsHeader: 'Toegangsgroepen zijn ingeschakeld, maar de groepsheader is niet ontvangen van de reverse proxy.',
    expectedHeader: (header: string) => `Verwachte header: ${header}`
  }
} satisfies Messages
