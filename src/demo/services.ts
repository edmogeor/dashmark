import type { Card } from '@/lib/docker'

type DemoService = Omit<Card, 'access' | 'icon'> & { imageName: string; access?: string[] }

const demoResourceStats: NonNullable<Card['resourceStats']> = ['cpu', 'memory', 'network']
const demoHosts = ['home-server', 'vps'] as const

function mockResourceUsage(index: number): NonNullable<Card['resourceUsage']> {
  const gibibyte = 1_024 * 1_024 * 1_024
  return {
    cpuPercent: 1.5 + (index * 3.7) % 42,
    memoryUsage: (160 + index * 73) * 1_024 * 1_024,
    memoryLimit: (index % 3 + 1) * gibibyte,
    receivedBytesPerSecond: (12 + index * 9) * 1_024,
    sentBytesPerSecond: (4 + index * 5) * 1_024,
  }
}

const demoServiceDefinitions = [
  {
    id: 'plex', title: 'Plex', url: 'https://plex.example.com', imageName: 'plexinc/pms-docker:latest', category: 'Media', searchAliases: ['movies', 'tv'], hasContainer: true, access: ['media'],
    resourceStats: ['cpu', 'memory', 'network'], metrics: ['gatus/uptime'],
    resourceUsage: {
      cpuPercent: 24.6,
      memoryUsage: 1_350 * 1_024 * 1_024,
      memoryLimit: 4 * 1_024 * 1_024 * 1_024,
      receivedBytesPerSecond: 2.4 * 1_024 * 1_024,
      sentBytesPerSecond: 380 * 1_024,
    },
  },
  { id: 'jellyfin', title: 'Jellyfin', url: 'https://jellyfin.example.com', imageName: 'jellyfin/jellyfin:latest', category: 'Media', searchAliases: ['movies', 'music'], hasContainer: true },
  { id: 'radarr', title: 'Radarr', url: 'https://radarr.example.com', imageName: 'linuxserver/radarr:latest', category: 'Media', searchAliases: ['movies'], hasContainer: true, state: 'paused' },
  { id: 'sonarr', title: 'Sonarr', url: 'https://sonarr.example.com', imageName: 'linuxserver/sonarr:latest', category: 'Media', searchAliases: ['television'], hasContainer: true },
  {
    id: 'home-assistant', title: 'Home Assistant', url: 'https://home.example.com', imageName: 'ghcr.io/home-assistant/home-assistant:stable', category: 'Home', searchAliases: ['smart home'], hasContainer: true, access: ['family'],
    resourceStats: ['cpu', 'memory'],
    resourceUsage: {
      cpuPercent: 3.8,
      memoryUsage: 720 * 1_024 * 1_024,
      memoryLimit: 2 * 1_024 * 1_024 * 1_024,
      receivedBytesPerSecond: 86 * 1_024,
      sentBytesPerSecond: 19 * 1_024,
    },
  },
  { id: 'adguard', title: 'AdGuard Home', url: 'https://dns.example.com', imageName: 'adguard/adguardhome:latest', category: 'Home', searchAliases: ['dns', 'adblock'], hasContainer: true },
  { id: 'nextcloud', title: 'Nextcloud', url: 'https://cloud.example.com', imageName: 'nextcloud:latest', category: 'Productivity', searchAliases: ['files', 'calendar'], hasContainer: true },
  { id: 'paperless', title: 'Paperless-ngx', url: 'https://documents.example.com', imageName: 'ghcr.io/paperless-ngx/paperless-ngx:latest', category: 'Productivity', searchAliases: ['documents', 'archive'], hasContainer: true },
  { id: 'vaultwarden', title: 'Vaultwarden', url: 'https://vault.example.com', imageName: 'vaultwarden/server:latest', category: 'Security', searchAliases: ['passwords'], hasContainer: true },
  { id: 'grafana', title: 'Grafana', url: 'https://grafana.example.com', imageName: 'grafana/grafana:latest', category: 'Monitoring', searchAliases: ['metrics'], hasContainer: true, health: 'unhealthy', access: ['admins', 'operators'] },
  { id: 'uptime-kuma', title: 'Uptime Kuma', url: 'https://status.example.com', imageName: 'louislam/uptime-kuma:latest', category: 'Monitoring', searchAliases: ['status'], hasContainer: true, health: 'starting' },
  {
    id: 'portainer', title: 'Portainer', url: 'https://containers.example.com', imageName: 'portainer/portainer-ce:latest', category: 'Infrastructure', searchAliases: ['docker'], hasContainer: true, access: ['admins'],
    resourceStats: ['cpu', 'memory', 'network'],
    resourceUsage: {
      cpuPercent: 1.2,
      memoryUsage: 94 * 1_024 * 1_024,
      memoryLimit: 512 * 1_024 * 1_024,
      receivedBytesPerSecond: 14 * 1_024,
      sentBytesPerSecond: 8 * 1_024,
    },
  },
  { id: 'proxmox', title: 'Proxmox', url: 'https://proxmox.example.com', imageName: 'proxmox:latest', category: 'Infrastructure', searchAliases: ['virtual machines'], hasContainer: true },
  { id: 'traefik', title: 'Traefik', url: 'https://proxy.example.com', imageName: 'traefik:v3', category: 'Infrastructure', searchAliases: ['proxy'], hasContainer: true },
  { id: 'immich', title: 'Immich', url: 'https://photos.example.com', imageName: 'ghcr.io/immich-app/immich-server:latest', category: 'Photos', searchAliases: ['images'], hasContainer: true },
  { id: 'syncthing', title: 'Syncthing', url: 'https://sync.example.com', imageName: 'syncthing/syncthing:latest', category: 'Productivity', searchAliases: ['sync'], hasContainer: true },
  { id: 'mealie', title: 'Mealie', url: 'https://recipes.example.com', imageName: 'ghcr.io/mealie-recipes/mealie:v2', category: 'Home', searchAliases: ['recipes'], hasContainer: true },
  { id: 'actual', title: 'Actual Budget', url: 'https://budget.example.com', imageName: 'actualbudget/actual-server:latest', category: 'Productivity', searchAliases: ['finance'], hasContainer: true },
] satisfies DemoService[]

export const demoServices = demoServiceDefinitions.map((service, index) => ({
  ...service,
  host: demoHosts[index % demoHosts.length],
  hostColor: index % demoHosts.length,
  resourceStats: service.resourceStats ?? demoResourceStats,
  resourceUsage: service.resourceUsage ?? mockResourceUsage(index),
}))
