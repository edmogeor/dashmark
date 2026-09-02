import type { Messages } from './index'

export const fr = {
  app: { title: 'Dashmark', about: 'À propos de Dashmark', createdBy: 'Créé par', copyright: 'Copyright © 2026 edmogeor' },
  meta: { description: 'Un tableau de bord léger de liens vers vos services Docker.' },
  category: { all: 'Toutes les catégories', uncategorised: 'Sans catégorie' },
  greeting: { morning: 'Bonjour', afternoon: 'Bon après-midi', evening: 'Bonsoir' },
  search: { placeholder: 'Rechercher', clear: 'Effacer la recherche' },
  card: {
    description: 'Description',
    resourceUsage: 'Métriques',
    cpu: 'CPU',
    memory: 'Mémoire',
    received: 'Réseau entrant',
    sent: 'Réseau sortant',
    waitingForNetwork: 'En attente de la prochaine actualisation',
    unavailable: 'Indisponible',
    loading: (label: string) => `Chargement de ${label}`,
    metricUnavailable: (title: string) => `Métrique ${title} indisponible`
  },
  dashboard: {
    noServices: 'Aucun service trouvé',
    moreGroups: (count: number, formattedCount: string) => `Afficher ${formattedCount} groupe${count === 1 ? '' : 's'} supplémentaire${count === 1 ? '' : 's'}`
  },
  status: {
    loading: 'Chargement de l’état',
    created: 'créé',
    restarting: 'redémarrage',
    running: 'en cours',
    removing: 'suppression',
    paused: 'en pause',
    exited: 'arrêté',
    dead: 'inactif',
    healthy: 'sain',
    unhealthy: 'non sain',
    starting: 'démarrage'
  },
  theme: { toggle: 'Changer de thème', switchToSystem: 'Utiliser le thème système', switchToLight: 'Utiliser le mode clair', switchToDark: 'Utiliser le mode sombre' },
  common: { close: 'Fermer', true: 'Vrai', false: 'Faux' },
  about: {
    latestStableVersion: 'Dernière version stable',
    installedVersion: 'Version installée',
    checkingForUpdates: 'Recherche de mises à jour',
    updateAvailable: (version: string) => `Mise à jour disponible : ${version}`,
    upToDate: 'Vous êtes à jour.'
  },
  metrics: {
    title: 'Métriques',
    networkUsage: 'Utilisation du réseau',
    viewHistory: (label: string) => `Voir l’historique de ${label}`,
    chart: (label: string) => `Graphique ${label}`,
    liveDetails: (label: string) => `Détails en direct de ${label}`,
    collectionFailed: 'Les données de métrique sont indisponibles.',
    configurationInvalid: 'La configuration de la métrique est invalide.'
  },
  time: { today: 'Aujourd’hui', yesterday: 'Hier', dateTime: (date: string, time: string) => `${date}, ${time}`, ranges: { day: '24 h', week: '7 j', month: '30 j' } },
  uptime: {
    noChecks: 'Aucune vérification enregistrée',
    successfulChecks: (count: number, formattedCount: string) => `${formattedCount} vérification${count === 1 ? '' : 's'} réussie${count === 1 ? '' : 's'}`,
    failedChecks: (count: number, formattedCount: string) => `${formattedCount} vérification${count === 1 ? '' : 's'} échouée${count === 1 ? '' : 's'}`,
    slowestResponse: (value: string) => `réponse la plus lente : ${value}`,
    bucketSummary: (time: string, checks: string, responseTime?: string) => `${time} : ${checks}${responseTime ? `, ${responseTime}` : ''}`,
    up: 'Disponible',
    down: 'Indisponible',
    partial: 'Partiel',
    noData: 'Aucune donnée',
    successful: 'Réussies',
    failed: 'Échouées',
    slowest: 'La plus lente',
    history: 'Historique de disponibilité',
    period: 'Période de disponibilité',
    availability: 'disponibilité pour la période sélectionnée'
  },
  errors: {
    unableToLoadServices: 'Impossible de charger les services',
    statusUpdateFailed: 'Échec de la mise à jour de l’état :',
    serverUnreachable: 'Impossible de joindre le serveur.',
    liveUpdatesUnavailable: 'Les mises à jour en direct ne sont pas disponibles. Les données peuvent être obsolètes.',
    dockerUnreachable: 'Docker est inaccessible. Vérifiez DOCKER_HOSTS et le montage du socket Docker.',
    configInvalid: 'Le fichier de configuration est invalide.',
    missingGroupsHeader: 'Les groupes d’accès sont activés, mais l’en-tête des groupes n’a pas été reçu du proxy inverse.',
    expectedHeader: (header: string) => `En-tête attendu : ${header}`
  }
} satisfies Messages
