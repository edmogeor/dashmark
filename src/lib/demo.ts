import type { Card } from './docker'

type DemoService = Omit<Card, 'accessGroups' | 'icon'> & { imageName: string; accessGroups?: string[] }

export const demoServices = [
  { id: 'plex', title: 'Plex', description: 'Your media library', url: 'https://plex.example.com', imageName: 'plexinc/pms-docker:latest', category: 'Media', searchAliases: ['movies', 'tv'], hasContainer: true, accessGroups: ['media'] },
  { id: 'jellyfin', title: 'Jellyfin', description: 'Open-source media streaming', url: 'https://jellyfin.example.com', imageName: 'jellyfin/jellyfin:latest', category: 'Media', searchAliases: ['movies', 'music'], hasContainer: true },
  { id: 'radarr', title: 'Radarr', description: 'Movie collection manager', url: 'https://radarr.example.com', imageName: 'linuxserver/radarr:latest', category: 'Media', searchAliases: ['movies'], hasContainer: true, state: 'paused' },
  { id: 'sonarr', title: 'Sonarr', description: 'TV series manager', url: 'https://sonarr.example.com', imageName: 'linuxserver/sonarr:latest', category: 'Media', searchAliases: ['television'], hasContainer: true },
  { id: 'home-assistant', title: 'Home Assistant', description: 'Home automation', url: 'https://home.example.com', imageName: 'ghcr.io/home-assistant/home-assistant:stable', category: 'Home', searchAliases: ['smart home'], hasContainer: true, accessGroups: ['family'] },
  { id: 'adguard', title: 'AdGuard Home', description: 'Network-wide ad blocking', url: 'https://dns.example.com', imageName: 'adguard/adguardhome:latest', category: 'Home', searchAliases: ['dns', 'adblock'], hasContainer: true },
  { id: 'nextcloud', title: 'Nextcloud', description: 'Files, calendars, and contacts', url: 'https://cloud.example.com', imageName: 'nextcloud:latest', category: 'Productivity', searchAliases: ['files', 'calendar'], hasContainer: true },
  { id: 'paperless', title: 'Paperless-ngx', description: 'Document archive', url: 'https://documents.example.com', imageName: 'ghcr.io/paperless-ngx/paperless-ngx:latest', category: 'Productivity', searchAliases: ['documents', 'archive'], hasContainer: true },
  { id: 'vaultwarden', title: 'Vaultwarden', description: 'Password manager', url: 'https://vault.example.com', imageName: 'vaultwarden/server:latest', category: 'Security', searchAliases: ['passwords'], hasContainer: true },
  { id: 'grafana', title: 'Grafana', description: 'Metrics dashboards', url: 'https://grafana.example.com', imageName: 'grafana/grafana:latest', category: 'Monitoring', searchAliases: ['metrics'], hasContainer: true, health: 'unhealthy', accessGroups: ['admins', 'operators'] },
  { id: 'uptime-kuma', title: 'Uptime Kuma', description: 'Service availability', url: 'https://status.example.com', imageName: 'louislam/uptime-kuma:latest', category: 'Monitoring', searchAliases: ['status'], hasContainer: true, health: 'starting' },
  { id: 'portainer', title: 'Portainer', description: 'Container management', url: 'https://containers.example.com', imageName: 'portainer/portainer-ce:latest', category: 'Infrastructure', searchAliases: ['docker'], hasContainer: true, accessGroups: ['admins'] },
  { id: 'proxmox', title: 'Proxmox', description: 'Virtualisation management', url: 'https://proxmox.example.com', imageName: 'proxmox:latest', category: 'Infrastructure', searchAliases: ['virtual machines'], hasContainer: true },
  { id: 'traefik', title: 'Traefik', description: 'Reverse proxy', url: 'https://proxy.example.com', imageName: 'traefik:v3', category: 'Infrastructure', searchAliases: ['proxy'], hasContainer: true },
  { id: 'immich', title: 'Immich', description: 'Photo backup', url: 'https://photos.example.com', imageName: 'ghcr.io/immich-app/immich-server:latest', category: 'Photos', searchAliases: ['images'], hasContainer: true },
  { id: 'syncthing', title: 'Syncthing', description: 'Private file synchronisation', url: 'https://sync.example.com', imageName: 'syncthing/syncthing:latest', category: 'Productivity', searchAliases: ['sync'], hasContainer: true },
  { id: 'mealie', title: 'Mealie', description: 'Recipe manager', url: 'https://recipes.example.com', imageName: 'ghcr.io/mealie-recipes/mealie:v2', category: 'Home', searchAliases: ['recipes'], hasContainer: true },
  { id: 'actual', title: 'Actual Budget', description: 'Personal finance', url: 'https://budget.example.com', imageName: 'actualbudget/actual-server:latest', category: 'Productivity', searchAliases: ['finance'], hasContainer: true }
] satisfies DemoService[]
