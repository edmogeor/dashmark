# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Removed

- `selfhst:<slug>` icon references. Icons are now set with an `http(s)` URL, a path inside `ICONS_DIR`, or `placeholder`; leave `icon` unset to auto-match.

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
