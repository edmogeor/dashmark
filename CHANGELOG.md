# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `ACCESS_GROUPS_HEADER=auto` now also detects oauth2-proxy (`X-Forwarded-Groups`) and Keycloak Gatekeeper (`X-Auth-Groups`) group headers, enabling Keycloak, Pocket ID, and Zitadel behind oauth2-proxy.
- `DISABLE_BRANDING` environment variable to hide the Dashmark logo next to the search bar.
- YAML config entries can be keyed by compose service name (via `com.docker.compose.service`) in addition to container name.

### Changed

- Invalid `ACCESS_GROUPS_HEADER` values fall back to `auto` with an error log instead of failing at request time.
- Selfhst icon references now require a `selfhst:` prefix (e.g. `selfhst:plex`); bare names are treated as custom files.
- YAML config is now a flat map of services; the `services:` wrapper and the unused `settings` key are gone.

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
