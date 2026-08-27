---
title: YAML configuration (optional)
description: Override Docker cards and add standalone cards with config.yml.
---

Mount a host directory at `/data`. Use these paths for configuration and custom assets:

| Path | Purpose |
| --- | --- |
| `/data/config.yml` | Dashboard settings and card overrides. |
| `/data/icons` | Custom icon files. |
| `/data/custom.css` | Custom stylesheet when `CUSTOM_STYLESHEET` points to it. |

## Create config.yml

Create `data/config.yml`. The reserved `settings` key is for dashboard-wide options. Every other top-level key is a service name.

```yaml
settings:
  category_order: [Media, Home]
  show_metrics: true

plex:
  title: Plex
  url: https://plex.example.com
  icon: selfhst:plex
  category: Media
  order: 1

github:
  title: GitHub
  url: https://github.com
  category: External
```

`plex` overrides a matching container or Compose service. `github` has no matching container, so it becomes a standalone card. Standalone cards require `url` and do not have Docker status, CPU, memory, or network metrics.

YAML service values override Docker labels. YAML `settings` values override environment variables. Lists can be YAML arrays, a single value, or a comma-separated string.

When a key could match more than one name, Dashmark resolves it in this order: host-qualified container name, host-qualified Compose service name, unqualified container name, then unqualified Compose service name.

## Override one host

With named `DOCKER_HOSTS`, prefix the service name with the host ID:

```yaml
plex:
  category: Media

home/plex:
  title: Home Plex
  url: https://plex.home.example.com

vps/plex:
  title: VPS Plex
  url: https://plex.vps.example.com
```

Host-qualified entries take precedence over unqualified ones.

## Service fields

Use these fields under a service name: `title`, `description`, `url`, `icon`, `category`, `host`, `order`, `hidden`, `show_status`, `access`, `search_aliases`, and `metrics`. `host` adds a host badge to a standalone card or forces one on a Docker-backed card.

Dashmark rejects unknown or invalid YAML keys and writes a configuration error to its logs. Start with the shipped [`data/config.yml`](https://github.com/edmogeor/dashmark/blob/main/data/config.yml) example for the complete metrics structure.

## Secrets

Never put a literal token in `config.yml`. Point `auth_token` at an environment variable or Docker secret file:

```yaml
settings:
  auth_token:
    env: DASHMARK_AUTH_TOKEN
```

`CONFIG_FILE` itself is environment-only because Dashmark needs its path before it can read YAML.
