export const en = {
  app: {
    title: 'Dashmark'
  },
  meta: {
    description: 'A lightweight dashboard of links to your Docker services.'
  },
  category: {
    all: 'All categories',
    uncategorised: 'Uncategorized'
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
    waitingForNetwork: 'Waiting for next refresh',
    unavailable: 'Unavailable'
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
  time: {
    today: 'Today',
    yesterday: 'Yesterday'
  },
  errors: {
    unableToLoadServices: 'Unable to load services',
    statusUpdateFailed: 'Status update failed:',
    serverUnreachable: 'Could not reach the server.',
    liveUpdatesUnavailable: 'Live updates are unavailable. Data may be out of date.',
    dockerUnreachable: 'Docker is unreachable. Check DOCKER_HOSTS and the Docker socket mount.',
    configInvalid: 'The config file is invalid.',
    missingGroupsHeader: 'Access groups are enabled but the groups header was not received from the reverse proxy.',
    expectedHeader: (header: string) => `Expected header: ${header}`
  }
} as const
