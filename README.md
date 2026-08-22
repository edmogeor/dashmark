<div align="center">
  <img src="public/brand/icon.svg" width="140" alt="Dashmark logo"/>
  <h1>Dashmark</h1>
  <p>A lightweight dashboard for links to your Docker services.</p>
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

Dashmark discovers labeled Docker containers and turns them into dashboard cards. Use `dashmark.*` labels to set each card's link, title, icon, category, and access. It is a small self-hosted Node.js service with no database.

![Dashmark dashboard](assets/screenshot.png)

## Contents

- [Features](#features)
- [Quick start](#quick-start)
- [How it works](#how-it-works)
- [Configuration](#configuration)
- [Security](#security)
- [Development](#development)
- [License](#license)

## Features

- Discover Docker containers through opt-in labels.
- Reuse Traefik host rules as card links.
- Organise cards with categories, search aliases, and custom ordering.
- Show live container state and health, refreshed every 30 seconds.
- Use automatic, selfhst, remote, local, or placeholder icons.
- Add standalone cards and label overrides with YAML.
- Limit card visibility with groups supplied by your authentication proxy.
- Add a small custom stylesheet without modifying the image.

## Quick start

**You need:** Docker Compose and access to the Docker socket. The example uses a socket proxy so Dashmark does not receive the raw socket.

1. Create `docker-compose.yml`:

   ```yaml
   services:
     dashmark:
       image: ghcr.io/edmogeor/dashmark:latest
       ports:
         - "127.0.0.1:4321:4321"
       environment:
         - DOCKER_HOST=tcp://dockerproxy:2375
       depends_on:
         - dockerproxy
       restart: unless-stopped

     dockerproxy:
       image: wollomatic/socket-proxy:1
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

2. Add a card label to a service in the same Compose project:

   ```yaml
   services:
     plex:
       image: plexinc/pms-docker
       labels:
         - "dashmark.url=https://plex.example.com"
         - "dashmark.title=Plex"
         - "dashmark.category=Media"
   ```

3. Start the services:

   ```bash
   docker compose up -d
   ```

4. Open <http://localhost:4321>.

Dashmark shows a card for each eligible container. After changing labels, recreate the affected container with `docker compose up -d`.

For an annotated Compose file with every option, see [`docker-compose.yml`](docker-compose.yml).

## How it works

Dashmark reads container metadata through the Docker API. A container appears when it has a `dashmark.*` label and a link from `dashmark.url`, a matching YAML entry, or a supported Traefik host rule. Containers with only Traefik labels do not appear.

Dashmark polls for container state and health every 30 seconds by default. Set `STATUS_POLL_INTERVAL` to change the interval in seconds. A YAML entry can override a container's labels or create a standalone card for a service outside Docker.

## Configuration

Configure Dashmark with environment variables, Docker labels, and an optional YAML file. For the same container field, YAML takes precedence over Docker labels.

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `DOCKER_HOST` | `unix:///var/run/docker.sock` | Docker socket or TCP endpoint |
| `CONFIG_FILE` | `/app/config.yml` | Optional YAML configuration file |
| `ICONS_DIR` | `/app/icons` | Directory for local icon files |
| `PORT` | `4321` | HTTP listening port |
| `CUSTOM_STYLESHEET` | unset | Absolute path to a mounted CSS file, served as `/custom.css` |
| `ENABLE_ACCESS_GROUPS` | `false` | Filter cards using a groups request header |
| `ACCESS_GROUPS_HEADER` | `auto` | Groups header name, or automatic provider detection |
| `USER_NAME_HEADER` | `auto` | Header for `{full_name}` |
| `USER_FIRST_NAME_HEADER` | `auto` | Header for `{first_name}` |
| `USER_LAST_NAME_HEADER` | `auto` | Header for `{last_name}` |
| `USER_USERNAME_HEADER` | `auto` | Header for `{username}` |
| `USER_EMAIL_HEADER` | `auto` | Header for `{email}` |
| `SHOW_HEADER` | `true` | Show the greeting header |
| `SHOW_GROUP_TAGS` | `true` | Show the user's group tags when access groups are used |
| `SHOW_THEME_TOGGLE` | `true` | Show the light and dark theme toggle |
| `CUSTOM_HEADER` | unset | Greeting template using the tags below |
| `GREETING_MORNING` | `Good morning` | Morning value for `{greeting}` |
| `GREETING_AFTERNOON` | `Good afternoon` | Afternoon value for `{greeting}` |
| `GREETING_EVENING` | `Good evening` | Evening value for `{greeting}` |
| `SHOW_SEARCH` | `true` | Show search and the category filter |
| `SHOW_STATUS` | `true` | Show container state and health badges |
| `STATUS_POLL_INTERVAL` | `30` | Seconds between container status updates |
| `ENABLE_AUTOMATIC_ICONS` | `true` | Guess icons from image names when no icon is set |
| `SHOW_BRANDING` | `true` | Show the Dashmark logo near search |
| `NEW_TAB` | `false` | Open card links in a new tab |
| `AUTH_TOKEN` | unset | Require `X-Dashmark-Token: <token>` on every request |

### Docker labels

Add labels to opt a container in and configure its card.

| Label | Purpose |
| --- | --- |
| `dashmark.hidden` | Set to `true` to hide the container |
| `dashmark.url` | Card link. May be inferred from a Traefik rule |
| `dashmark.title` | Display title. Defaults to the container name |
| `dashmark.description` | Tooltip text |
| `dashmark.icon` | `selfhst:<slug>`, an image URL, a path in `ICONS_DIR`, or `placeholder` |
| `dashmark.category` | Category name |
| `dashmark.access_groups` | Comma-separated group allow-list |
| `dashmark.search_aliases` | Comma-separated additional search terms |
| `dashmark.order` | Sort order within a category, lower values first |

When `dashmark.url` is absent, Dashmark can derive an HTTPS URL from a Traefik router label such as `traefik.http.routers.plex.rule=Host(\`plex.example.com\`)`. Add another `dashmark.*` label to opt the container in.

### YAML configuration

Mount a YAML file and set `CONFIG_FILE` if it is not mounted at `/app/config.yml`. Each top-level key is a container name or Compose service name. A matching key overrides that container; a non-matching key creates a standalone card and must include `url`.

```yaml
plex:
  title: Plex
  url: https://plex.example.com
  icon: selfhst:plex
  category: Media
  order: 1
  search_aliases:
    - movies
  access_groups:
    - media

github:
  title: GitHub
  url: https://github.com
  category: External
```

Available fields are `title`, `description`, `url`, `icon`, `category`, `order`, `hidden`, `access_groups`, and `search_aliases`. See [`config/config.example.yml`](config/config.example.yml) for a commented example.

### Icons

Dashmark resolves icons in this order:

1. `placeholder` shows title initials and disables guessing for that card.
2. An `http` or `https` URL is used directly.
3. `selfhst:<slug>` selects an icon from the bundled [selfhst](https://selfh.st/) index.
4. Any other value is a path inside `ICONS_DIR`, including subdirectories.
5. With no icon value, Dashmark guesses from the container image name.
6. If no icon is found, Dashmark shows initials.

### Styling

Mount a stylesheet and set `CUSTOM_STYLESHEET` to its absolute container path. Dashmark loads it after its built-in CSS. Use the semantic `dashmark-*` classes rather than Tailwind utilities or DOM position.

```yaml
services:
  dashmark:
    volumes:
      - ./custom.css:/app/custom.css:ro
    environment:
      - CUSTOM_STYLESHEET=/app/custom.css
```

[`config/custom.css.example`](config/custom.css.example) lists every supported styling class.

### Access groups and greetings

Set `ENABLE_ACCESS_GROUPS=true` to show a card only when its `access_groups` overlap with the groups supplied by your reverse proxy. Cards with no access groups remain visible to everyone. Dashmark returns an error when the required header is missing.

`ACCESS_GROUPS_HEADER=auto` checks these headers in order: Authentik (`X-Authentik-Groups`), Authelia (`Remote-Groups`), oauth2-proxy (`X-Forwarded-Groups` or `X-Auth-Request-Groups`), and Keycloak Gatekeeper (`X-Auth-Groups`). Set the variable to a header name for another proxy. Group values may be comma-, semicolon-, or pipe-separated, or a JSON array.

The default header greets the authenticated user. Use `CUSTOM_HEADER`, for example `CUSTOM_HEADER={greeting}, {first_name}!`, to customise it. The available tags are `{greeting}`, `{full_name}`, `{first_name}`, `{last_name}`, `{username}`, and `{email}`. Set the corresponding `USER_*_HEADER` variables when automatic detection does not support your proxy.

## Security

- Do not mount the raw Docker socket into Dashmark. Use a socket proxy with read-only, filtered Docker API access, as shown above.
- Bind Dashmark to `127.0.0.1` or keep it on a private Docker network, then publish it through a reverse proxy.
- When exposing Dashmark, put authentication in the reverse proxy. Authentik and Authelia work with the default group-header detection.
- If Dashmark must be directly reachable, set `AUTH_TOKEN` and configure the proxy to overwrite `X-Dashmark-Token` with that shared secret. Generate one with `openssl rand -hex 32`.

Access group headers are only safe when the proxy removes or overwrites client-supplied values.

## Development

```bash
npm install
npm run dev
npm run lint
npm test
npm run typecheck
npm run build
```

`npm run dev` uses a mock Docker API, sample cards, and sample authentication headers. It does not need a Docker daemon and supports hot reload.

Contributions are welcome. Please open an issue or pull request with a clear description of the change.

## License

[MIT](LICENSE)
