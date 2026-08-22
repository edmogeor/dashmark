<div align="center">
  <img src="public/brand/icon.svg" width="140" alt="Dashmark logo"/>
  <h1>Dashmark</h1>
  <p>A lightweight dashboard of links to your Docker services.</p>
  <p>
    <a href="https://github.com/edmogeor/dashmark/actions/workflows/ci.yml">
      <img src="https://github.com/edmogeor/dashmark/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"/>
    </a>
    <a href="https://github.com/fallow-rs/fallow">
      <img src="https://raw.githubusercontent.com/edmogeor/dashmark/badges/badge.svg" alt="fallow health"/>
    </a>
    <a href="./LICENSE">
      <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"/>
    </a>
  </p>
</div>

Dashmark reads your Docker daemon and turns each labeled container into a link on the dashboard. You shape those links with `dashmark.*` labels on your containers, which set the title, icon, category, and more. Dashmark is one small Node.js service. It reads container labels and shows a clean, minimal  Astro-based dashboard.

![Dashmark dashboard](assets/screenshot.png)

<!-- toc -->

- [Features](#features)
- [Quick start](#quick-start)
- [How it works](#how-it-works)
- [Configuration](#configuration)
  - [Environment variables](#environment-variables)
  - [Styling hooks](#styling-hooks)
  - [Docker labels](#docker-labels)
  - [YAML config file](#yaml-config-file)
  - [Icons](#icons)
  - [Access groups](#access-groups)
- [Security](#security)
- [Development](#development)
- [License](#license)

<!-- tocstop -->

## Features

- **Label-driven.** Dashmark lists your containers and turns each one into a card, shaped by `dashmark.*` labels for the title, URL, icon, category, and more.
- **Traefik friendly.** Reuse your existing Traefik router rules as card URLs, so you do not set a URL twice.
- **Group with categories.** Cards group under labels like `Media` or `Monitoring`.
- **Search and filter.** Find a service by name, category, or a custom alias.
- **Live status.** Each card shows whether its container is running and healthy. Status refreshes every 30 seconds.
- **Automatic icons.** With no icon set, Dashmark guesses the icon from the image name, using the [selfhst](https://selfh.st/) index.
- **Custom icons.** Name a selfhst reference, link to an image, or point at a file in your icons directory.
- **Access groups.** Hide cards from users who should not see them, using groups from Authentik or Authelia.
- **YAML config.** Define cards by hand for services Docker does not run.
- **Self-hosted and small.** One container, one read-only socket mount, no external database.

## Quick start

Dashmark is a Docker image. The easiest way to run it is with Docker Compose.

Create a `docker-compose.yml` (see the [annotated example](https://github.com/edmogeor/dashmark/blob/main/docker-compose.yml) for every option):

```yaml
services:
  dashmark:
    image: ghcr.io/edmogeor/dashmark:latest
    container_name: dashmark
    ports:
      - "127.0.0.1:4321:4321"
    volumes:
      - ./config.yml:/app/config.yml:ro
      - ./icons:/app/icons:ro
    environment:
      - DOCKER_HOST=tcp://dockerproxy:2375
    depends_on:
      - dockerproxy
    restart: unless-stopped

  dockerproxy:
    image: wollomatic/socket-proxy:1
    container_name: dashmark-dockerproxy
    restart: unless-stopped
    read_only: true
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges
    command:
      - "-loglevel=info"
      - "-listenip=0.0.0.0"
      - "-allowfrom=dashmark"
      - "-allowGET=/version"
      - "-allowGET=/v1\\..{1,2}/containers/.*"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
```

Then start it:

```bash
docker compose up -d
```

Open http://localhost:4321. Dashmark shows a card for every running container that has a URL.

## How it works

Dashmark connects to your Docker socket read-only via HTTP—or reads a manual YAML config—to automatically discover containers and turn them into interactive dashboard cards based on container labels.

Cards auto-refresh every 30 seconds to reflect real-time container states and health checks. You can easily organize them with categories and icons, and restrict visibility using access groups synced from your identity provider.

## Configuration

You can configure Dashmark with environment variables, Docker labels, or a YAML file. YAML wins when both set the same value.

### Environment variables

| Variable | Default | What it does |
| --- | --- | --- |
| `DOCKER_HOST` | `unix:///var/run/docker.sock` | Docker socket or TCP endpoint |
| `CONFIG_FILE` | `/app/config.yml` | Optional YAML config file path |
| `ICONS_DIR` | `/app/icons` | Folder for custom icon files |
| `CUSTOM_STYLESHEET` | unset | Absolute path to a CSS file mounted into the container. Dashmark serves it at `/custom.css` and loads it after its built-in styles. |
| `ENABLE_ACCESS_GROUPS` | `false` | When `true`, filter cards by the groups header |
| `ACCESS_GROUPS_HEADER` | `auto` | Group header. `auto` detects Authentik, Authelia, oauth2-proxy, or Keycloak Gatekeeper |
| `USER_NAME_HEADER` | auto | Header for `{full_name}` |
| `USER_FIRST_NAME_HEADER` | auto | Header for `{first_name}` |
| `USER_LAST_NAME_HEADER` | auto | Header for `{last_name}` |
| `USER_USERNAME_HEADER` | auto | Header for `{username}` |
| `USER_EMAIL_HEADER` | auto | Header for `{email}` |
| `SHOW_HEADER` | `true` | Show a greeting header with the user's name and group tags |
| `SHOW_GROUP_TAGS` | `true` | Show the user's group tags in the header when a card uses access groups |
| `SHOW_THEME_TOGGLE` | `true` | Show the light/dark toggle. When `false`, Dashmark always follows the system preference |
| `CUSTOM_HEADER` | unset | Header greeting template. Supports the tags listed below |
| `GREETING_MORNING` | `Good morning` | The morning greeting, used by `{greeting}` and the default greeting |
| `GREETING_AFTERNOON` | `Good afternoon` | The afternoon greeting |
| `GREETING_EVENING` | `Good evening` | The evening greeting |
| `SHOW_SEARCH` | `true` | Show the search bar and category filter |
| `SHOW_STATUS` | `true` | Show the state and health badge on cards |
| `ENABLE_AUTOMATIC_ICONS` | `true` | When `false`, Dashmark does not guess icons. Cards without an icon show initials |
| `SHOW_BRANDING` | `true` | Show the Dashmark logo next to the search bar |
| `NEW_TAB` | `false` | When `true`, card links open in a new tab |
| `PORT` | `4321` | HTTP port Dashmark listens on |
| `AUTH_TOKEN` | unset | Optional shared secret. When set, Dashmark only serves requests that include `X-Dashmark-Token: <token>`. Set the same token in your reverse proxy, and have it overwrite the header. Off by default |

### Styling hooks

Mount a stylesheet into the container and set `CUSTOM_STYLESHEET` to its absolute path. Dashmark serves it at `/custom.css` and loads it after its built-in styles, so selectors with equal specificity override the built-in Tailwind styles.

[`config/custom.css.example`](config/custom.css.example) contains a complete copyable stylesheet using every supported class below.

```yaml
services:
  dashmark:
    volumes:
      - ./custom.css:/app/custom.css:ro
    environment:
      - CUSTOM_STYLESHEET=/app/custom.css
```

Use the stable, semantic `dashmark-*` classes below rather than Tailwind utility classes or DOM position.

| Area | Classes |
| --- | --- |
| Page | `dashmark`, `dashmark-main`, `dashmark-content`, `dashmark-results` |
| Header | `dashmark-header`, `dashmark-greeting`, `dashmark-user-groups`, `dashmark-group-badge` |
| Search | `dashmark-search-panel`, `dashmark-brand`, `dashmark-search`, `dashmark-search-input`, `dashmark-search-clear` |
| Category filter | `dashmark-category-filter`, `dashmark-category-filter-menu`, `dashmark-category-filter-option` |
| Categories | `dashmark-category-grid`, `dashmark-category`, `dashmark-category-header`, `dashmark-category-title`, `dashmark-category-apps` |
| App cards | `dashmark-app-grid`, `dashmark-app-link`, `dashmark-app-card`, `dashmark-app-content`, `dashmark-app-icon`, `dashmark-app-title`, `dashmark-app-url`, `dashmark-app-status` |
| States | `dashmark-empty-state`, `dashmark-error`, `dashmark-error-panel` |
| Theme toggle | `dashmark-theme-toggle`, `dashmark-theme-toggle-control`, `dashmark-theme-toggle-icon` |

### Docker labels

Put labels on your containers to shape their cards. Every label starts with the `dashmark.` prefix.

| Label | What it does |
| --- | --- |
| `dashmark.hidden` | `"true"` hides the container completely |
| `dashmark.url` | The URL the card links to. You can also set this in YAML or reuse an existing Traefik rule |
| `dashmark.title` | The display title. Falls back to the container name |
| `dashmark.description` | A short description shown in a tooltip |
| `dashmark.icon` | A `selfhst:<slug>` reference, URL, path inside `ICONS_DIR`, or `placeholder`. Leave it unset to let Dashmark guess from the image name. Selfhst icons that are too dark or too light automatically switch to their `-light` or `-dark` monochrome variant. |
| `dashmark.category` | The group name |
| `dashmark.access_groups` | Comma-separated group allow-list |
| `dashmark.search_aliases` | Comma-separated extra search terms |
| `dashmark.order` | Sort order within a category. Lower numbers come first |

Example:

```yaml
services:
  plex:
    image: plexinc/pms-docker
    labels:
      - "dashmark.title=Plex"
      - "dashmark.description=Media server"
      - "dashmark.url=https://plex.example.com"
      - "dashmark.icon=plex.svg"
      - "dashmark.category=Media"
      - "dashmark.order=1"
```

If you do not set `dashmark.url`, Dashmark builds one from a Traefik label that looks like `traefik.http.routers.<name>.rule` with a `Host(...)` rule. It defaults to `https://`. Dashmark only does this when the container also has at least one `dashmark.*` label (or a matching YAML entry). A container with only Traefik labels does not appear.

So if you already route a service with Traefik, you do not need `dashmark.url`, as long as you set another `dashmark.*` label to opt in:

```yaml
services:
  plex:
    image: plexinc/pms-docker
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.plex.rule=Host(`plex.example.com`)"
      - "dashmark.title=Plex"
      - "dashmark.icon=plex.svg"
      - "dashmark.category=Media"
```

Dashmark reads the Traefik router rule and links the card to `https://plex.example.com`.

After you change a container's labels, recreate it so Docker applies the new labels:

```bash
docker compose up -d
```

### YAML config file

The optional YAML file at `CONFIG_FILE` lets you define cards by hand, or override labels for a container. YAML values beat Docker labels for the same container.

Each top-level key is a service, named by **container name or Compose service name**. If a key matches a running container, it overrides that container's `dashmark.*` labels. If no container matches, the key still shows a card, but without a state badge. With Docker Compose, you can use the service name (for example `plex`) instead of the generated container name (for example `stack_plex_1`).

```yaml
plex:
  title: Plex
  description: Media server
  url: https://plex.example.com
  icon: selfhst:plex
  category: Media
  order: 1
  search_aliases:
    - movies
    - watch later
  access_groups:
    - media
    - admins

nzbget:
  url: https://nzbget.example.com
  category: Downloads
  order: 2
```

Each service accepts these fields: `title`, `description`, `url`, `icon`, `category`, `order`, `hidden`, `access_groups`, and `search_aliases`. See [`config/config.example.yml`](https://github.com/edmogeor/dashmark/blob/main/config/config.example.yml) for a commented example.

#### Custom cards

A key that does not match any running container becomes a standalone card, as long as it has a `url`. These cards have no state badge, since there is no container behind them. Use any name you like:

```yaml
github:
  title: GitHub
  url: https://github.com
  icon: selfhst:github
  category: External

router-admin:
  title: Router
  url: http://192.168.1.1
  category: Network
```

If a container with the same name later starts, the key switches to overriding that container's labels instead.

### Icons

Dashmark picks a card's icon in this order:

1. `icon: placeholder` shows the title's initials. Use this to turn off guessing for one container.
2. An `http(s)` URL is used directly.
3. A `selfhst:` reference, such as `selfhst:plex`, looks up the case-insensitive slug in the selfhst index.
4. Any other value is a path inside `ICONS_DIR` (subdirectories are allowed). A missing file shows initials.
5. With no icon set, Dashmark guesses the icon from the image name, using the selfhst index.
6. If nothing matches, it falls back to initials.

The [selfhst](https://selfh.st/) index is included in the image. If it is missing, Dashmark fetches it from the GitHub API instead.

### Access groups

Turn on `ENABLE_ACCESS_GROUPS=true` to filter cards by group. Your reverse proxy must send a groups header with each request. Dashmark shows a card when the card's `access_groups` overlap with the user's groups. Cards with no `access_groups` are visible to everyone.

Serve Dashmark behind a proxy that handles login, so the header is trustworthy. When the header is missing, Dashmark shows an error. It also sets the `Vary` header so shared caches treat requests with different groups separately.

`ACCESS_GROUPS_HEADER=auto` (the default) detects the groups header from these providers, in order:

| Provider | Groups header |
| --- | --- |
| Authentik | `X-Authentik-Groups` |
| Authelia | `Remote-Groups` |
| oauth2-proxy (Keycloak, Pocket ID, Zitadel) | `X-Forwarded-Groups` or `X-Auth-Request-Groups` |
| Keycloak Gatekeeper (louketo) | `X-Auth-Groups` |

Keycloak, Pocket ID, and Zitadel are identity providers that do not add a groups header themselves. Put oauth2-proxy (or a proxy that sets `X-Forwarded-Groups` or `X-Auth-Request-Groups`) in front of them. If your proxy sets a different header, set `ACCESS_GROUPS_HEADER` to that header name. Group values can be comma-, semicolon-, or pipe-separated, or a JSON array of strings.

### Greeting and header

The header is shown by default (`SHOW_HEADER=true`). It shows a greeting above the search bar: the time-of-day greeting followed by the user's first name, for example `Good morning, John!`, `Good afternoon, John!`, or `Good evening, John!`. When no name is available, it shows only the greeting, for example `Good afternoon!`.

Use `CUSTOM_HEADER` to template it instead, for example:

```
CUSTOM_HEADER={greeting}, {first_name}!
```

The template is a plain string that supports these tags, each filled from an auth header your reverse proxy sets:

| Tag | Meaning |
| --- | --- |
| `{greeting}` | The time-of-day greeting (`Good morning`, `Good afternoon`, or `Good evening`) |
| `{full_name}` | The user's full name |
| `{first_name}` | The user's first name |
| `{last_name}` | The user's last name |
| `{username}` | The username |
| `{email}` | The email address |

The time-of-day greeting itself can be customised with `GREETING_MORNING`, `GREETING_AFTERNOON`, and `GREETING_EVENING`. These replace `Good morning`, `Good afternoon`, and `Good evening`, both in the default greeting and in the `{greeting}` tag.

A tag with no matching header shows as empty text. Dashmark detects the name, username, and email headers from Authentik (`X-Authentik-Name`, `X-Authentik-Username`, `X-Authentik-Email`), Authelia (`Remote-Name`, `Remote-User`, `Remote-Email`), oauth2-proxy (`X-Forwarded-Preferred-Username` or `X-Auth-Request-Preferred-Username`, `X-Forwarded-User` or `X-Auth-Request-User`, `X-Forwarded-Email` or `X-Auth-Request-Email`), and Keycloak Gatekeeper (`X-Auth-Name`, `X-Auth-Username`, `X-Auth-Email`). For another proxy, set the matching `USER_*_HEADER` variable.

`{first_name}` and `{last_name}` come from the dedicated Authentik headers `X-Authentik-Given-Name` and `X-Authentik-Family-Name` when they are present. Set `USER_FIRST_NAME_HEADER` and `USER_LAST_NAME_HEADER` for providers that expose dedicated fields under other names. Otherwise, Dashmark splits the full name on spaces: the first word is the first name and the last word is the last name. For example, `John Mary Doe` becomes `John` / `Doe`. A single-word name gives a first name only.

Group tags appear next to the greeting from the groups header (the same one `ACCESS_GROUPS_HEADER` uses). Dashmark only shows them when at least one card has `access_groups` set. Set `SHOW_GROUP_TAGS=false` to hide them entirely.

## Security

If you host Dashmark on the public internet, add a login layer in front of it. We recommend Authentik or Authelia. Both work out of the box with `ACCESS_GROUPS_HEADER=auto`. Keycloak, Pocket ID, and Zitadel also work through oauth2-proxy. Use access groups to control who sees which cards.

Dashmark is reachable only in the way you expose it. Bind it to `127.0.0.1` (as in the example compose file), or put it on a private Docker network with your proxy. Then it cannot be reached from the internet, and you do not need `AUTH_TOKEN`.

Use `AUTH_TOKEN` when Dashmark must be directly reachable and you want it to serve only requests that came through your proxy. Set `AUTH_TOKEN` to a shared secret. Have your proxy set the `X-Dashmark-Token` header to that secret, overwriting anything the client sends. Dashmark then rejects any request without that header. Generate a token with `openssl rand -hex 32`.

Also expose Docker through a [socket proxy](https://github.com/wollomatic/socket-proxy) instead of mounting the raw socket. A socket proxy gives read-only, filtered access to the Docker API. It keeps the full Docker socket away from Dashmark and anything else that reaches the internet.

## Development

```bash
npm install        # install dependencies
npm run dev        # start the dev server against a mock Docker API
npm test           # run the tests (Vitest)
npm run typecheck  # type-check with astro check
npm run build      # build for production
```

`npm run dev` uses a mock Docker API with a handful of labeled cards. It needs no Docker daemon and gives you hot reload. The mock also injects sample auth headers (name, username, email, groups) and enables `SHOW_HEADER`, so you can see the header in action.

Pull requests are welcomed if you'd like to help me develop this image!

## License

MIT
