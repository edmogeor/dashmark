---
title: Migrating from Homepage
description: Reuse existing Homepage Docker labels in Dashmark.
---

Set `HOMEPAGE_LABEL_FALLBACK=true` to use Homepage Docker labels as fallbacks. Dashmark labels and YAML overrides take precedence.

| Homepage label         | Dashmark equivalent    |
| ---------------------- | ---------------------- |
| `homepage.href`        | `dashmark.url`         |
| `homepage.name`        | `dashmark.title`       |
| `homepage.description` | `dashmark.description` |
| `homepage.icon`        | `dashmark.icon`        |
| `homepage.group`       | `dashmark.category`    |
| `homepage.weight`      | `dashmark.order`       |

## Icons

Absolute Homepage HTTP(S) icon URLs are used directly. Homepage `sh-` selfh.st icons are translated, for example `sh-plex.png` becomes `selfhst:plex`; Dashmark always uses its SVG icon. Homepage `/icons/<file>` paths are translated to `<file>` under Dashmark's `ICONS_DIR`, so mount the same files there. Bare Homepage icon names are translated to Dashboard Icons, for example `code-server.png` becomes `dashboard:code-server`.

Other Homepage icon formats, widgets, status checks, and instance-specific labels are not imported.
