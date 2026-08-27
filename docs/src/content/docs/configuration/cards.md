---
title: Card configuration
description: Configure dashboard cards with Docker labels.
---

A container becomes a card when it has a `dashmark.*` label and Dashmark can determine its URL. Traefik labels alone do not create cards.

## Card discovery requirements

For Docker discovery, add at least one `dashmark.*` label. A visible card also needs a valid URL. Set `dashmark.url` explicitly, or let Dashmark derive it from the container's Traefik router `Host(...)` rule.

```yaml
labels:
  dashmark.url: https://radarr.example.com
```

## Optional display and sorting labels

`title`, `description`, `icon`, `category`, and `order` change how the card appears but are not required. When `title` is omitted, Dashmark uses the container name.

```yaml
labels:
  dashmark.title: Radarr
  dashmark.description: Movie collection manager
  dashmark.icon: selfhst:radarr
  dashmark.category: Media
  dashmark.order: "10"
```

`dashmark.order` sorts cards within a category, lowest first. Cards without an order follow ordered cards and are sorted alphabetically by title. Set `CATEGORY_ORDER=Media,Home` to order categories.

## Available labels

| Label | Value and effect |
| --- | --- |
| `dashmark.hidden` | `true` hides the container. |
| `dashmark.url` | Card URL. |
| `dashmark.title` | Display name, defaulting to the container name. |
| `dashmark.description` | Tooltip text. Use `none` to disable automatic descriptions. |
| `dashmark.icon` | `selfhst:<slug>`, an `http(s)` URL, a path in `ICONS_DIR`, or `placeholder`. |
| `dashmark.category` | Category name. Matching ignores case. |
| `dashmark.order` | Numeric order within the category. |
| `dashmark.search_aliases` | Comma-separated additional search terms. |
| `dashmark.access` | Comma-separated groups, usernames, or email addresses. |
| `dashmark.show_status` | `false` hides this card's status badge and usage tooltip. |
| `dashmark.metrics` | `cpu`, `memory`, `network`, or library metrics such as `radarr/queue`. Use `none` to disable built-in metrics. |
| `dashmark.api_url` | Private HTTP(S) API base URL for library metrics. Defaults to the card URL. |
| `dashmark.metrics_access.<metric>` | Comma-separated access entries for one metric. Replace `/` with `.` in a library metric key. |
| `dashmark.metric_*` | Credential for a library metric. Prefer YAML environment-variable or secret-file references because Docker labels are visible through Docker APIs. |

## Traefik URLs

When `dashmark.url` is not set, Dashmark can derive a card URL from a Traefik router rule containing `Host(...)`. It uses `https://` by default. The container still needs at least one `dashmark.*` label or a matching YAML entry, Traefik labels alone do not create a card.

## Icons

Dashmark resolves icons in this order: `placeholder`, an HTTP(S) URL, a `selfhst:` icon, a file under `ICONS_DIR`, automatic image-name matching, then title initials.

```yaml
labels:
  dashmark.icon: /icons/radarr.svg
```

Mount custom icons under `/data/icons`, or set `ICONS_DIR` to another mounted directory.

## Multiple Docker hosts

Name Docker endpoints when Dashmark reads more than one host:

```yaml
environment:
  - DOCKER_HOSTS=home=tcp://home-proxy:2375,vps=tcp://vps-proxy:2375
```

Use the host ID in a YAML override when the same service exists on both hosts. See [YAML configuration](/dashmark/docs/configuration/yaml/#override-one-host).

Host IDs may use letters, numbers, `_`, and `-`, and must be unique. Dashmark continues showing cards from reachable hosts if another host is unavailable. Connect remote hosts through restricted socket proxies on a private network, never expose Docker or a socket proxy publicly.
