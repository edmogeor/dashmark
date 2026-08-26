# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.3] - 2026-08-26

### Changed

- Allow shared caches to reuse status and resource API responses for up to five seconds based on their polling interval, when their group, username, email, and dashboard-token headers match.

### Removed

- Remove the Jellyfin catalog metrics.

## [0.3.2] - 2026-08-26

### Changed

- Allow catalog metric selections without options to omit their empty `{}` mapping.
- Add bounded JSON pagination for catalog metrics.

### Added

- Add an Authentik catalog metric for unique users with unexpired sessions.

## [0.3.1] - 2026-08-26

### Added

- Add styled scrolling and directional edge fades for metric tooltips with more than four rows.

### Changed

- Show a loading state for counter-based rate metrics until a second sample can calculate their rate.

## [0.3.0] - 2026-08-26

### Added

- Add CrowdSec Web UI alert and active-decision catalog metrics.
- Add Jellyfin, Paperless, NZBGet, Prowlarr, and Seerr catalog metrics available in Homepage.
- Generate a metrics catalog that lists required inputs and credential options from catalog definitions.
- Map state metric values to custom badge text with `state_labels`, falling back to the raw value with underscores humanized.
- Map state metric values to badge colors with `state_colors`.
- Add Zerobyte backup health catalog metric aggregating all enabled backup schedules.
- Aggregate numeric catalog metrics across discovered provider resources with `for_each`.
- Add Plex movie, show, and album catalog metrics.
- Add starter custom metrics for popular monitoring, media, and download services, including grouped charts.
- Bind catalog metrics to private local sources and apply numeric transforms after extraction.
- Add generic Socket.IO custom metrics with handshake auth, login, and request acknowledgements.
- Add HTTP Basic authentication for custom metric sources and OPNsense CPU, active-memory, and WAN catalog metrics.
- Add catalog metrics for Home Assistant, Paperless-ngx, Authentik, Bazarr, CrowdSec, NZBGet, Plex, Prowlarr, and Seerr.
- Add generic URL-component parameters for reusable catalog metrics, including Home Assistant entity state.
- Add plain-text extraction and JSON-body parameters for reusable catalog metrics.
- Disclose AI-assisted development in the README.
- Add an About dialog from the Dashmark logo with version, update, GitHub, and Buy Me a Coffee links.
- Group compatible custom metrics into multi-series charts with `chart_group`.
- Expose semantic CSS hooks for metric tooltips and charts, plus separate chart color variables.
- Let numeric custom metrics choose a step, line, area, or no history chart.
- Show selected custom metrics alongside built-in loading rows.
- Store resource metric history in SQLite and display live ticker charts in resource tooltips.
- Configure custom numeric and text metrics from JSON or Prometheus sources.

### Changed

- Use Inter as the dashboard font.
- Align resource-tooltip refreshes with each card's metric collection interval.
- Let selected catalog metrics try anonymous access before resolving optional credentials after HTTP 401 or 403.
- Show Docker host badges when multiple Docker hosts or a standalone host badge are configured; implicit hosts use `host`.
- Introduce the canonical `service.metrics` mapping with `source_url`, `collection`, `container`, `charts`, `catalog`, and `local`; `collection.interval` and `collection.retention` use duration strings.
- Add `shared_metric_sources` for local metrics that use the same HTTP API connection across cards.
- Group related Plex and Bazarr metrics in shared history charts, graph AdGuard latency as a line, and retain Paperless document history.
- Rename the OPNsense active-memory metric to Memory.
- Render state metric badges with the shadcn badge pill, truncating long labels instead of clipping.
- Persist error toasts until dismissed, with a close button and a two-second debounce, matching the server-disconnect toast.
- Center the About dialog header.
- Split metric override parsing into focused helpers for catalog merging and chart-group validation.
- **Breaking:** consolidate user-mounted files under `/data`. The default configuration file is now `/data/config.yml`, custom icons are read from `/data/icons`, and custom stylesheets can be mounted at `/data/custom.css`. Update existing `/app/config.yml` and `/app/icons` mounts or set the corresponding path overrides.
- **Breaking:** rename `SHOW_RESOURCE_USAGE` and `RESOURCE_USAGE_ACCESS` to `SHOW_METRICS` and `METRICS_ACCESS`.
- **Breaking:** rename the `dashmark.stats` Docker label to `dashmark.metrics`.
- **Breaking:** replace the YAML `stats` field with `metrics.container`.
- **Breaking:** reject unknown or removed YAML keys instead of ignoring them.
- **Breaking:** reserve the top-level YAML `settings` key for dashboard configuration; rename any service with that name.
- **Breaking:** limit `/demo` to the GitHub Pages build; self-hosted deployments now return `404` for that route.
- **Breaking:** make `GET /api/resources` serve the latest background-collected sample. API clients must handle `resource: null` and `pending: true` before the first sample is available.
- Restrict individual metrics with YAML `visible_to` fields or `dashmark.metrics_access.<metric>` labels, where dots in the label suffix represent metric-key slashes.
- Allow dashboard settings in the YAML `settings` mapping. YAML values override environment variables, including `port`, and `auth_token` supports environment-variable or secret-file references; `CONFIG_FILE` remains environment-only.
- Collect live metrics only in the background and serve tooltip data from the latest collected sample.
- Preserve metric labels while showing per-row loading and unavailable states.
- Show memory usage as a percentage, with bytes and percentage in chart hover details.
- Render area charts with linear, series-color gradients.
- Remove unused chart, dialog, and progress component APIs.
- Simplify custom metric validation and collection paths.

### Fixed

- Show the latest stable release version in the GitHub Pages demo.
- Restore host badges in the GitHub Pages demo.
- Skip development-only lifecycle scripts while installing production Docker image dependencies.
- Anchor nonnegative metric charts at zero and keep overlapping live-value labels within the chart bounds.
- Authenticate AdGuard Home catalog metric requests with its login session.
- Keep zero-valued metric charts anchored at zero and display distinct axis tick labels.
- Stop error toasts from dismissing themselves and repeating while errors flap between polls.
- Silence an error toast for the rest of the session once dismissed; server-disconnect toasts re-arm after recovery.
- Put the container name in the error toast title with the metric and reason beneath.
- Report zero speed for qBittorrent when no torrents exist.
- Read Plex library counts from `MediaContainer.size`, falling back to `totalSize`.
- Authenticate Seerr requests with `X-Api-Key` instead of the rejected Bearer header.
- Bind all catalog metric sources to the `{metrics_url}` base so `dashmark.metrics_url` can redirect collection to a private API base behind authenticated reverse proxies.
- Mock icon resolution in Docker unit tests to avoid external selfh.st requests in CI.
- Close mock Docker server connections during test teardown to prevent CI timeouts.
- Prevent metric chart Y-axes from displaying `NaN` for padded network-rate domains.
- Render chart data with the metric dialog instead of deferring it after the dialog opens.
- Keep network metrics loading until Docker has enough samples to calculate a rate.
- Keep open custom metric charts on their own history instead of replacing them with resource samples.
- Begin metric collection when the server starts and prune expired rows during collection.

## [0.3.0-alpha.20] - 2026-08-26

### Fixed

- Skip development-only lifecycle scripts while installing production Docker image dependencies.

## [0.3.0-alpha.19] - 2026-08-26

### Added

- Add CrowdSec Web UI alert and active-decision catalog metrics.

### Changed

- Let selected catalog metrics try anonymous access before resolving optional credentials after HTTP 401 or 403.

## [0.3.0-alpha.18] - 2026-08-26

### Changed

- Show Docker host badges when multiple Docker hosts or a standalone host badge are configured; implicit hosts use `host`.

### Fixed

- Anchor nonnegative metric charts at zero and keep overlapping live-value labels within the chart bounds.

## [0.3.0-alpha.17] - 2026-08-26

### Added

- Add Jellyfin, Paperless, NZBGet, Prowlarr, and Seerr catalog metrics available in Homepage.

## [0.3.0-alpha.16] - 2026-08-26

### Fixed

- Authenticate AdGuard Home catalog metric requests with its login session.

## [0.3.0-alpha.15] - 2026-08-26

### Added

- Generate a metrics catalog that lists required inputs and credential options from catalog definitions.

### Changed

- **Breaking:** replace the YAML metric list and related per-service metric keys with the canonical `service.metrics` mapping. Use `source_url`, `collection`, `container`, `charts`, `catalog`, and `local`; `collection.interval` and `collection.retention` now use duration strings.
- Add `shared_metric_sources` for local metrics that use the same HTTP API connection across cards.
- Group related Plex and Bazarr metrics in shared history charts, graph AdGuard latency as a line, and retain Paperless document history.
- Rename the OPNsense active-memory metric to Memory.

### Fixed

- Keep zero-valued metric charts anchored at zero and display distinct axis tick labels.

### Removed

- **Breaking:** remove YAML `metrics` lists, `metric_providers`, `metrics_url`, `metric_parameters`, `metrics_poll_interval`, `metrics_history_period`, `metrics_access`, and `custom_metrics`, with no aliases. Docker labels remain accepted separately, and catalog metrics no longer need a provider label gate.

## [0.3.0-alpha.14] - 2026-08-25

### Fixed

- Stop error toasts from dismissing themselves and repeating while errors flap between polls.
- Silence an error toast for the rest of the session once dismissed; server-disconnect toasts re-arm after recovery.
- Put the container name in the error toast title with the metric and reason beneath.
- Report zero speed for qBittorrent when no torrents exist.
- Read Plex library counts from `MediaContainer.size`, falling back to `totalSize`.
- Authenticate Seerr requests with `X-Api-Key` instead of the rejected Bearer header.

### Changed

- Remove CrowdSec catalog metrics.

## [0.3.0-alpha.13] - 2026-08-25

### Added

- Map state metric values to custom badge text with `state_labels`, falling back to the raw value with underscores humanized.

### Changed

- Render state metric badges with the shadcn badge pill, truncating long labels instead of clipping.

## [0.3.0-alpha.12] - 2026-08-25

### Fixed

- Bind all catalog metric sources to the `{metrics_url}` base so `dashmark.metrics_url` can redirect collection to a private API base behind authenticated reverse proxies.

### Changed

- Persist error toasts until dismissed, with a close button and a two-second debounce, matching the server-disconnect toast.
- Center the About dialog header.

## [0.3.0-alpha.11] - 2026-08-25

### Added

- Map state metric values to badge colors with `state_colors`.
- Add Zerobyte backup health catalog metric aggregating all enabled backup schedules.

### Changed

- Split metric override parsing into focused helpers for catalog merging and chart-group validation.
- Move `tailwindcss`, `shadcn`, and `@fontsource-variable/geist` to production dependencies.

## [0.3.0-alpha.10] - 2026-08-25

### Added

- Aggregate numeric catalog metrics across discovered provider resources with `for_each`.
- Add Plex movie, show, and album catalog metrics.

## [0.3.0-alpha.9] - 2026-08-25

### Added

- Add starter custom metrics for popular monitoring, media, and download services, including grouped charts.
- Bind catalog metrics to private local sources and apply numeric transforms after extraction.
- Allow cards to select catalog metrics from multiple explicit providers with `metric_providers`.
- Add generic Socket.IO custom metrics with handshake auth, login, and request acknowledgements.
- Add HTTP Basic authentication for custom metric sources and OPNsense CPU, active-memory, and WAN catalog metrics.
- Add catalog metrics for Home Assistant, Paperless-ngx, Authentik, Bazarr, CrowdSec, NZBGet, Plex, Prowlarr, and Seerr.
- Add generic URL-component parameters for reusable catalog metrics, including Home Assistant entity state.
- Add plain-text extraction and JSON-body parameters for reusable catalog metrics.

### Changed

- **Breaking:** consolidate user-mounted files under `/data`. The default configuration file is now `/data/config.yml`, custom icons are read from `/data/icons`, and custom stylesheets can be mounted at `/data/custom.css`. Update existing `/app/config.yml` and `/app/icons` mounts or set the corresponding path overrides.

## [0.3.0-alpha.8] - 2026-08-25

### Fixed

- Mock icon resolution in Docker unit tests to avoid external selfh.st requests in CI.

## [0.3.0-alpha.7] - 2026-08-25

### Added

- Disclose AI-assisted development in the README.

### Fixed

- Close mock Docker server connections during test teardown to prevent CI timeouts.

## [0.3.0-alpha.6] - 2026-08-25

- Add an About dialog from the Dashmark logo with version, update, GitHub, and Buy Me a Coffee links.

- **Breaking:** rename `SHOW_RESOURCE_USAGE` and `RESOURCE_USAGE_ACCESS` to `SHOW_METRICS` and `METRICS_ACCESS`.
- Restrict individual metrics with YAML `metrics_access` or `dashmark.metrics_access.<metric>` labels, where dots in the label suffix represent metric-key slashes.

- Allow dashboard settings in the YAML `settings` mapping. YAML values override environment variables, including `port`, and `auth_token` supports environment-variable or secret-file references; `CONFIG_FILE` remains environment-only.

### Added

- Group compatible custom metrics into multi-series charts with `chart_group`.
- Expose semantic CSS hooks for metric tooltips and charts, plus separate chart color variables.

### Changed

- Collect live metrics only in the background and serve tooltip data from the latest collected sample.
- Preserve metric labels while showing per-row loading and unavailable states.
- Show memory usage as a percentage, with bytes and percentage in chart hover details.
- Render area charts with linear, series-color gradients.

### Fixed

- Prevent metric chart Y-axes from displaying `NaN` for padded network-rate domains.
- Render chart data with the metric dialog instead of deferring it after the dialog opens.
- Keep network metrics loading until Docker has enough samples to calculate a rate.

## [0.3.0-alpha.3] - 2026-08-24

### Fixed

- Keep open custom metric charts on their own history instead of replacing them with resource samples.
- Begin metric collection when the server starts and prune expired rows during collection.

## [0.3.0-alpha.2] - 2026-08-24

### Added

- Let numeric custom metrics choose a step, line, area, or no history chart.
- Show selected custom metrics alongside built-in loading rows.

## [0.3.0-alpha.1] - 2026-08-24

### Added

- Store resource metric history in SQLite and display live ticker charts in resource tooltips.
- Configure custom numeric and text metrics from JSON or Prometheus sources.

### Changed

- Remove unused chart, dialog, and progress component APIs.
- Simplify custom metric validation and collection paths.

## [0.2.2] - 2026-08-24

### Fixed

- Prevent card links from opening when dismissing an open tooltip.
- Omit network rates for host-networked containers, where Docker does not expose per-container counters.
- Redirect unmatched live-server routes to the dashboard.

### Changed

- Show static resource metrics on every container in the GitHub Pages demo.
- Label network rates as receiving and sending.

## [0.2.1] - 2026-08-24

### Changed

- Prefetch resource metrics on card hover and show per-metric loading indicators.
- Refine card text spacing and mobile resource-tooltip interactions.
- **Breaking:** replace `ENABLE_ACCESS_GROUPS`, `STATUS_BADGE_GROUPS`, and `RESOURCE_USAGE_GROUPS` with `ENABLE_ACCESS_CONTROL`, `STATUS_BADGE_ACCESS`, and `RESOURCE_USAGE_ACCESS`.
- **Breaking:** replace the `dashmark.access_groups` label and YAML `access_groups` field with `dashmark.access` and `access`. Access entries now match authenticated groups, usernames, and emails.

## [0.2.0] - 2026-08-24

### Added

- CPU, memory, and network resource-usage tooltips for Docker-backed cards, fetched only while open.

## [0.1.19] - 2026-08-24

### Added

- Discover labeled Docker containers across multiple hosts with `DOCKER_HOSTS`.
- Support host-qualified YAML overrides for services with the same name on different hosts.

### Changed

- **Breaking:** replace `DOCKER_HOST` with `DOCKER_HOSTS`. For one Docker host, use its endpoint directly; name each endpoint when configuring multiple hosts.

## [0.1.18] - 2026-08-24

### Changed

- Refine app icon spacing for standard and maskable installs, and update the social-image gradient.
- Use automatically resolved descriptions for demo services.

## [0.1.17] - 2026-08-24

### Changed

- Refresh the brand mark across app icons, the in-app logo, favicon, social image, and README screenshot.

## [0.1.16] - 2026-08-24

### Fixed

- Reject distant automatic icon and description matches.

## [0.1.15] - 2026-08-24

### Added

- Automatic service descriptions from the selfh.st app directory, controlled by `ENABLE_AUTOMATIC_DESCRIPTIONS`.

## [0.1.14] - 2026-08-24

### Fixed

- Avoid automatic icon matches for partial or generic service names.

## [0.1.13] - 2026-08-23

### Fixed

- Avoid status disconnect warnings caused by backgrounded dashboard requests.

## [0.1.12] - 2026-08-23

### Added

- Search dashboard cards by their URLs.

## [0.1.11] - 2026-08-23

### Changed

- Use black for the installed app's browser chrome.

## [0.1.10] - 2026-08-23

### Fixed

- Fetch the web manifest with credentials so an Authentik-protected dashboard remains installable.

## [0.1.9] - 2026-08-23

### Fixed

- Use base-aware manifest, icon, and service-worker URLs so the dashboard remains installable behind a path-prefixed reverse proxy.

## [0.1.8] - 2026-08-23

### Fixed

- Make group overflow tooltips work on touch devices and prevent tooltip taps from activating cards.
- Avoid stale status connection warnings when returning to the dashboard.
- Include the dashboard error panel in the vertically centered result flow and use the standard card entry animation.
- Register the dashboard as an installable web app and provide a PNG icon for desktop shortcuts.
- Show the Dashmark logo in the demo search panel.

## [0.1.7] - 2026-08-22

### Changed

- Tune the theme-toggle hit area and mobile header spacing around group tags.

## [0.1.6] - 2026-08-22

### Changed

- Show the card hover colour while a card is pressed or tapped.
- Deploy the GitHub Pages demo on release tags instead of every `main` commit.
- Reduce the mobile theme-toggle hit area to prevent conflicts with group tags.

## [0.1.5] - 2026-08-22

### Added

- `STATUS_BADGE_GROUPS` to limit card status badges to selected authenticated groups.
- Configurable development group simulation for testing status badge visibility.

### Changed

- Refine responsive dashboard card, search, header, and group-tag layout.

## [0.1.4] - 2026-08-22

### Changed

- Refine dashboard card sizing, spacing, icon treatment, and responsive header layout.
- Restrict the socket-proxy Compose example to the Docker version and container-list endpoints Dashmark needs.

## [0.1.3] - 2026-08-22

### Fixed

- Avoid transient status error toasts during dashboard navigation and recovery.

## [0.1.2] - 2026-08-22

### Added

- Per-service status badge opt-out with `dashmark.show_status=false` or YAML `show_status: false`.

## [0.1.1] - 2026-08-22

### Fixed

- Keep vertically centered dashboard content above virtual keyboards across browsers.

## [0.1.1-alpha.1] - 2026-08-22

### Fixed

- Keep vertically centered dashboard content above virtual keyboards across browsers.

## [0.1.0] - 2026-08-22

### Removed

- Automatic descriptions and the bundled Awesome Selfhosted description index. Configure descriptions explicitly with `dashmark.description` or YAML.

## [0.1.0-alpha.13] - 2026-08-22

### Fixed

- Include the Astro Node adapter and its standalone server dependencies in the production image.

## [0.1.0-alpha.12] - 2026-08-22

### Added

- `CATEGORY_ORDER` for explicitly ordering categories.

### Changed

- Category names now match case-insensitively, preventing separate categories that differ only by casing.

### Fixed

- Remove excess bottom spacing from cards without a status badge.

## [0.1.0-alpha.11] - 2026-08-22

### Fixed

- Account for the mobile software keyboard when calculating dashboard overflow in Chrome and Safari.

## [0.1.0-alpha.10] - 2026-08-22

### Added

- Interactive GitHub Pages demo with mock services, simulated status updates, and share-preview metadata.
- `STATUS_POLL_INTERVAL` to configure container status refresh timing.
- Automatic service descriptions from the bundled Awesome Selfhosted index, controlled by `ENABLE_AUTOMATIC_DESCRIPTIONS`.

### Changed

- Search results now collapse category containers into animated individual cards.
- Development mock services use automatic descriptions when an Awesome Selfhosted match exists.

## [0.1.0-alpha.9] - 2026-08-22

### Changed

- Category containers now fade in lane by lane, from top to bottom.
- User group tags now only show groups configured in accessible link controls.

## [0.1.0-alpha.8] - 2026-08-22

### Changed

- Category-filtered cards and single-category search results now use the flat card grid.
- Flat search-result cards fade in without vertical motion.
- Restored categories to the development mock services.

## [0.1.0-alpha.7] - 2026-08-22

### Added

- Custom stylesheet support through `CUSTOM_STYLESHEET` and semantic `dashmark-*` CSS classes.

### Fixed

- Included `lucide-react` in production dependencies for the standalone server bundle.

### Changed

- Reworked the README for a clearer setup path and more concise configuration guidance.
- Simplified dashboard rendering, status styling, and selfhst icon fetching.

## [0.1.0-alpha.6] - 2026-08-22

### Added

- `selfhst:<slug>` icon references for explicit selfhst icon selection.

### Changed

- Simplified the dashboard search and result rendering into focused components.
- Declared `@tanstack/virtual-core` as a direct dependency.

## [0.1.0-alpha.5] - 2026-08-20

### Changed

- `AUTH_TOKEN` now checks a dedicated `X-Dashmark-Token` header instead of the `Authorization` header.

## [0.1.0-alpha.4] - 2026-08-20

### Added

- `robots.txt` and a `noindex, nofollow` meta tag to keep the dashboard out of search results.
- Open Graph share preview metadata (`og:title`, `og:description`, `og:image`, `og:url`) so shared links show a preview card on platforms like WhatsApp.

## [0.1.0-alpha.3] - 2026-08-20

### Added

- `ACCESS_GROUPS_HEADER=auto` now also detects oauth2-proxy (`X-Forwarded-Groups`) and Keycloak Gatekeeper (`X-Auth-Groups`) group headers, enabling Keycloak, Pocket ID, and Zitadel behind oauth2-proxy.
- Greeting header with the user's name and group tags, shown by default (`SHOW_HEADER`, `SHOW_GROUP_TAGS`).
- `CUSTOM_HEADER` greeting template with `{greeting}`, `{full_name}`, `{first_name}`, `{last_name}`, `{username}`, and `{email}` tags, plus `GREETING_MORNING`/`GREETING_AFTERNOON`/`GREETING_EVENING` to customise the time-of-day greeting.
- YAML config entries can be keyed by compose service name (via `com.docker.compose.service`) in addition to container name.
- `AUTH_TOKEN` optional shared-secret gate; when set, every request must include `Authorization: Bearer <token>`.
- `SHOW_THEME_TOGGLE` to hide the light/dark toggle and always follow the system preference.
- Fuzzy search that tolerates typos when matching titles, categories, and search aliases.
- Card counts in the category dropdown.
- Glow and touch-friendly reveal behaviour on the theme toggle.

### Changed

- Invalid `ACCESS_GROUPS_HEADER` values fall back to `auto` with an error log instead of failing at request time.
- Boolean environment variables now use positive polarity: `DISABLE_SEARCH` -> `SHOW_SEARCH`, `DISABLE_STATUS` -> `SHOW_STATUS`, `DISABLE_BRANDING` -> `SHOW_BRANDING`, `DISABLE_GROUP_TAGS` -> `SHOW_GROUP_TAGS`, `DISABLE_AUTOMATIC_ICONS` -> `ENABLE_AUTOMATIC_ICONS`, and `ACCESS_GROUPS_ENABLED` -> `ENABLE_ACCESS_GROUPS`.
- Selfhst icon references now require a `selfhst:` prefix (e.g. `selfhst:plex`); bare names are treated as custom files.
- YAML config is now a flat map of services; the `services:` wrapper and the unused `settings` key are gone.
- Status badges cover more container states (`paused`, `created`, `restarting`, `removing`).

### Removed

- `ICONS_CDN` environment variable; the selfhst icon CDN is now hardcoded.
- `DASHMARK_LABEL_PREFIX` environment variable; the label prefix is now always `dashmark`.

## [0.1.0-alpha.2] - 2026-08-19

### Added

- App icon next to the search bar.
- Filter icon for the category dropdown.

### Changed

- Removed the placeholder-icon demo container; NZBGet now uses a selfhst icon.
- Placeholder icons match the surrounding card and no longer change on hover.
- Error toast uses the app's defined colours and reports the reason on a second line.

## [0.1.0-alpha.1] - 2026-08-19

### Added

- Automatic discovery of Docker containers into clickable dashboard cards.
- `dashmark.*` labels for title, description, URL, icon, category, order, hidden, access groups, and search aliases.
- Traefik router rule reuse to derive card URLs without a separate `dashmark.url`.
- Custom icons from `ICONS_DIR`, selfhst icon references, and fuzzy image-name matching.
- YAML config file for manually defined services and label overrides.
- Access-group filtering driven by a groups header from Authentik or Authelia.
- Search and category filtering.
- Live container state and health badges with 30-second polling.
- Light, dark, and system themes.
- Progressive web app manifest and app icons for saving to a home screen.
- Mock Docker API and demo containers for local development.
