export const strings = {
  app: {
    title: 'Dashmark'
  },
  meta: {
    lang: 'en',
    description: 'A lightweight dashboard of links to your Docker services.'
  },
  category: {
    all: 'All categories',
    uncategorised: 'Uncategorised'
  },
  greeting: {
    morning: 'Good morning',
    afternoon: 'Good afternoon',
    evening: 'Good evening'
  },
  search: {
    placeholder: 'Search',
    clear: 'Clear search'
  },
  card: {
    description: 'Description',
    resourceUsage: 'Metrics',
    cpu: 'CPU',
    memory: 'Memory',
    received: 'Network in',
    sent: 'Network out',
    loadingResourceUsage: 'Loading resource usage',
    waitingForNetwork: 'Waiting for next refresh',
    unavailable: 'Usage unavailable'
  },
  dashboard: {
    noServices: 'No services found'
  },
  status: {
    loading: 'Loading status',
    created: 'created',
    restarting: 'restarting',
    running: 'running',
    removing: 'removing',
    paused: 'paused',
    exited: 'exited',
    dead: 'dead',
    healthy: 'healthy',
    unhealthy: 'unhealthy',
    starting: 'starting'
  },
  theme: {
    toggle: 'Toggle theme',
    switchToSystem: 'Switch to system theme',
    switchToLight: 'Switch to light mode',
    switchToDark: 'Switch to dark mode'
  },
  errors: {
    unableToLoadServices: 'Unable to load services',
    statusUpdateFailed: 'Status update failed:',
    serverUnreachable: 'Could not reach the server.',
    dockerUnreachable: 'Docker is unreachable. Check DOCKER_HOSTS and the Docker socket mount.',
    configInvalid: 'The config file is invalid.',
    missingGroupsHeader: 'Access groups are enabled but the groups header was not received from the reverse proxy.',
    expectedHeader: (header: string) => `Expected header: ${header}`
  }
} as const

function isKnownStatus(value: string): value is keyof typeof strings.status {
  return value in strings.status
}

export function statusLabel(value: string): string {
  return isKnownStatus(value) ? strings.status[value] : value
}
