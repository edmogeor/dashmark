# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
