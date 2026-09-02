import type { Messages } from './index'

export const it = {
  app: { title: 'Dashmark', about: 'Informazioni su Dashmark', createdBy: 'Creato da', copyright: 'Copyright © 2026 edmogeor' },
  meta: { description: 'Una dashboard leggera di collegamenti ai tuoi servizi Docker.' },
  category: { all: 'Tutte le categorie', uncategorised: 'Senza categoria' },
  greeting: { morning: 'Buongiorno', afternoon: 'Buon pomeriggio', evening: 'Buonasera' },
  search: { placeholder: 'Cerca', clear: 'Cancella ricerca' },
  card: {
    description: 'Descrizione',
    resourceUsage: 'Metriche',
    cpu: 'CPU',
    memory: 'Memoria',
    received: 'Rete in entrata',
    sent: 'Rete in uscita',
    waitingForNetwork: 'In attesa del prossimo aggiornamento',
    unavailable: 'Non disponibile',
    loading: (label: string) => `Caricamento di ${label}`,
    metricUnavailable: (title: string) => `Metrica ${title} non disponibile`
  },
  dashboard: { noServices: 'Nessun servizio trovato', moreGroups: (count: number, formattedCount: string) => `Mostra altri ${formattedCount} grupp${count === 1 ? 'o' : 'i'}` },
  status: {
    loading: 'Caricamento dello stato',
    created: 'creato',
    restarting: 'riavvio',
    running: 'in esecuzione',
    removing: 'rimozione',
    paused: 'in pausa',
    exited: 'arrestato',
    dead: 'inattivo',
    healthy: 'integro',
    unhealthy: 'non integro',
    starting: 'avvio'
  },
  theme: { toggle: 'Cambia tema', switchToSystem: 'Passa al tema di sistema', switchToLight: 'Passa alla modalità chiara', switchToDark: 'Passa alla modalità scura' },
  common: { close: 'Chiudi', true: 'Vero', false: 'Falso' },
  about: {
    latestStableVersion: 'Ultima versione stabile',
    installedVersion: 'Versione installata',
    checkingForUpdates: 'Ricerca aggiornamenti',
    updateAvailable: (version: string) => `Aggiornamento disponibile: ${version}`,
    upToDate: 'Sei aggiornato.'
  },
  metrics: {
    title: 'Metriche',
    networkUsage: 'Utilizzo della rete',
    viewHistory: (label: string) => `Visualizza cronologia di ${label}`,
    chart: (label: string) => `Grafico ${label}`,
    liveDetails: (label: string) => `Dettagli in tempo reale di ${label}`,
    collectionFailed: 'I dati delle metriche non sono disponibili.',
    configurationInvalid: 'La configurazione delle metriche non è valida.'
  },
  time: { today: 'Oggi', yesterday: 'Ieri', dateTime: (date: string, time: string) => `${date}, ${time}`, ranges: { day: '24 h', week: '7 g', month: '30 g' } },
  uptime: {
    noChecks: 'Nessun controllo registrato',
    successfulChecks: (count: number, formattedCount: string) => `${formattedCount} controllo${count === 1 ? '' : 'i'} riuscito${count === 1 ? '' : 'i'}`,
    failedChecks: (count: number, formattedCount: string) => `${formattedCount} controllo${count === 1 ? '' : 'i'} non riuscito${count === 1 ? '' : 'i'}`,
    slowestResponse: (value: string) => `risposta più lenta: ${value}`,
    bucketSummary: (time: string, checks: string, responseTime?: string) => `${time}: ${checks}${responseTime ? `, ${responseTime}` : ''}`,
    up: 'Attivo',
    down: 'Non disponibile',
    partial: 'Parziale',
    noData: 'Nessun dato',
    successful: 'Riusciti',
    failed: 'Non riusciti',
    slowest: 'Più lenta',
    history: 'Cronologia di disponibilità',
    period: 'Periodo di disponibilità',
    availability: 'disponibilità per il periodo selezionato'
  },
  errors: {
    unableToLoadServices: 'Impossibile caricare i servizi',
    statusUpdateFailed: 'Aggiornamento dello stato non riuscito:',
    serverUnreachable: 'Impossibile raggiungere il server.',
    liveUpdatesUnavailable: 'Gli aggiornamenti in tempo reale non sono disponibili. I dati potrebbero non essere aggiornati.',
    dockerUnreachable: 'Docker non è raggiungibile. Controlla DOCKER_HOSTS e il montaggio del socket Docker.',
    configInvalid: 'Il file di configurazione non è valido.',
    missingGroupsHeader: 'I gruppi di accesso sono abilitati, ma l’intestazione dei gruppi non è stata ricevuta dal proxy inverso.',
    expectedHeader: (header: string) => `Intestazione prevista: ${header}`
  }
} satisfies Messages
