# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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
