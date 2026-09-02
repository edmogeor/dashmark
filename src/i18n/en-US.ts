export const enUS = {
  app: {
    title: 'Dashmark',
    about: 'About Dashmark',
    createdBy: 'Created by',
    copyright: 'Copyright © 2026 edmogeor'
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
    unavailable: 'Unavailable',
    loading: (label: string) => `Loading ${label}`,
    metricUnavailable: (title: string) => `${title} metric unavailable`
  },
  dashboard: {
    noServices: 'No services found',
    moreGroups: (count: number, formattedCount: string) => `Show ${formattedCount} more group${count === 1 ? '' : 's'}`
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
  common: {
    close: 'Close',
    true: 'True',
    false: 'False'
  },
  about: {
    latestStableVersion: 'Latest stable version',
    installedVersion: 'Installed version',
    checkingForUpdates: 'Checking for updates',
    updateAvailable: (version: string) => `Update available: ${version}`,
    upToDate: 'You are up to date.'
  },
  metrics: {
    title: 'Metrics',
    networkUsage: 'Network usage',
    viewHistory: (label: string) => `View ${label} history`,
    chart: (label: string) => `${label} chart`,
    liveDetails: (label: string) => `Live ${label} details`,
    collectionFailed: 'Metric data is unavailable.',
    configurationInvalid: 'Metric configuration is invalid.'
  },
  time: {
    today: 'Today',
    yesterday: 'Yesterday',
    dateTime: (date: string, time: string) => `${date}, ${time}`,
    ranges: {
      day: '24h',
      week: '7d',
      month: '30d'
    }
  },
  uptime: {
    noChecks: 'No checks were recorded',
    successfulChecks: (count: number, formattedCount: string) => `${formattedCount} successful check${count === 1 ? '' : 's'}`,
    failedChecks: (count: number, formattedCount: string) => `${formattedCount} failed check${count === 1 ? '' : 's'}`,
    slowestResponse: (value: string) => `slowest response ${value}`,
    bucketSummary: (time: string, checks: string, responseTime?: string) => `${time}: ${checks}${responseTime ? `, ${responseTime}` : ''}`,
    up: 'Up',
    down: 'Down',
    partial: 'Partial',
    noData: 'No data',
    successful: 'Successful',
    failed: 'Failed',
    slowest: 'Slowest',
    history: 'Uptime history',
    period: 'Uptime period',
    availability: 'availability for the selected period'
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
