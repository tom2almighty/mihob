[简体中文](./README.md)

# mihob

## Overview

**mihob** is a Hub + Agent control plane for deploying and managing multi-node, multi-user **Mihomo** (`listeners`) proxy servers and client subscriptions in a single binary, complete with an embedded React management console and self-service user subscription portal.

### Key Features

- **15 Mihomo Server Listener Protocols**: Full support for `VLESS (Reality / TLS / WS / gRPC / XHTTP)`, `VMess`, `Trojan`, `Hysteria2`, `TUIC v5`, `AnyTLS`, `Shadowsocks (including 2022 EIH)`, `Mieru`, `TrustTunnel`, `ShadowQUIC`, `Snell`, `Sudoku`, `HTTP`, `SOCKS5`, and `Mixed`, with per-inbound YAML deep-merge overrides and live preview.
- **Reverse WebSocket Sync & Safe Core Upgrades**: Agents initiate outbound connections to Hub; config pushes run `mihomo -t` pre-flight validation with automatic rollback, and Mihomo core binaries can be safely hot-upgraded fleet-wide with SHA-256 verification and health-check rollback.
- **Dual Template Engine (Client Subscription + Node Server Config)**:
  - Dynamic client subscription templates with customizable subscription sub-paths and a browser subscription portal.
  - Reusable node server config templates (anti-abuse BT/SMTP blocking, streaming/AI unlock split-routing) plus per-node overrides (`log-level`, `ipv6`, extra YAML) and live merged config preview.
- **Rule-Based Access Control & Traffic Accounting**: Authorize users by node region, tags, protocol, or regex; enforce traffic quotas and expirations with automatic active-connection termination.
- **Centralized Certificate Center**: ACME auto-issuance and renewal (Cloudflare / Alibaba Cloud DNS / DNSPod / HTTP-01), one-click self-signed certs, and manual PEM imports synced automatically to bound nodes.
- **Modern Console Experience**: Light/Dark appearance, built-in and custom tweakcn themes, and Chinese/English i18n.

## Screenshots

> All screenshots below were rendered using mock demo data.

### Dashboard (Dark / Light)

![Dashboard Dark](./docs/screenshots/dashboard-dark.png)

| Dashboard (Light) | Nodes & Core Upgrades |
| :---: | :---: |
| ![Dashboard Light](./docs/screenshots/dashboard-light.png) | ![Nodes Management](./docs/screenshots/nodes.png) |

| Users & Access Policies | Templates (Client & Node Server) |
| :---: | :---: |
| ![Users Management](./docs/screenshots/users.png) | ![Templates](./docs/screenshots/templates.png) |

### User Subscription Portal

![Subscription Portal](./docs/screenshots/subscription.png)

## Development Setup

### Prerequisites

- Go 1.27+
- Node.js 24+
- pnpm 12+

### Environment Variables

Hub environment variables:

| Variable | Description | Default |
| --- | --- | --- |
| `MIHOB_HOST` | HTTP listen host (e.g. `127.0.0.1` or `0.0.0.0`) | `0.0.0.0` |
| `MIHOB_PORT` | HTTP listen port | `8080` |
| `MIHOB_DATA_DIR` | Data directory for SQLite and ACME state | `./data` |
| `MIHOB_ADMIN_USER` | Initial admin username | `admin` |
| `MIHOB_ADMIN_PASS` | Initial admin password (auto-generated on first boot if empty) | Empty |

Agent environment variables:

| Variable | Description | Default |
| --- | --- | --- |
| `MIHOB_HUB_URL` | Hub public URL (required) | None |
| `MIHOB_NODE_TOKEN` | Node authentication token (required) | None |
| `MIHOB_DATA_DIR` | Agent runtime data directory | `./agent-data` |
| `MIHOB_MIHOMO_BIN` | Path to the Mihomo binary | `mihomo` |

### Local Development

```bash
# Install frontend dependencies
cd web && pnpm install --frozen-lockfile

# Terminal 1: Start Hub backend (listens on 0.0.0.0:8080)
go run ./cmd/mihob hub --host 0.0.0.0 --port 8080 --data ./data

# Terminal 2: Start Vite dev server (listens on :5173 with API/WS proxy)
cd web && pnpm dev
```

## Build and Deployment

### Production Build

```bash
# Build frontend assets embedded into the Go binary
cd web && pnpm install --frozen-lockfile && pnpm build

# Build static binary
cd ..
CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o bin/mihob ./cmd/mihob
```

### Binary Deployment

Download prebuilt archives from [GitHub Releases](https://github.com/tom2almighty/mihob/releases) (or compile from source as shown above):

- **Hub** (`mihob_<version>_<os>_<arch>.tar.gz` / `.zip`):

```bash
tar -xzf mihob_<version>_linux_amd64.tar.gz
chmod +x ./mihob

# Start directly (flags can also be set via MIHOB_HOST / MIHOB_PORT / MIHOB_DATA_DIR / MIHOB_ADMIN_PASS)
./mihob hub --host 0.0.0.0 --port 8080 --data ./data
```

If `MIHOB_ADMIN_PASS` is left empty on first start, an initial admin password is generated and printed to the logs. For production, run Hub under `systemd` behind a reverse proxy with HTTPS.

- **Agent** (`mihob-agent_<version>_linux_<arch>.tar.gz`):
  - **Recommended**: Open **Nodes → Deploy → Binary** in the Hub web console and run the one-line install script, which installs `mihomo`, `mihob-agent`, and registers a `systemd` service (`--update` and `--uninstall` are also supported).
  - **Manual run** (requires `mihomo` installed on the node):

```bash
tar -xzf mihob-agent_<version>_linux_amd64.tar.gz
chmod +x ./mihob-agent

./mihob-agent \
  --hub "https://hub.example.com" \
  --token "<NODE_TOKEN>" \
  --data ./agent-data \
  --mihomo-bin /usr/local/bin/mihomo
```

### Docker Compose (Hub)

```yaml
services:
  mihob-hub:
    image: ghcr.io/tom2almighty/mihob-hub:latest
    container_name: mihob-hub
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      MIHOB_HOST: "0.0.0.0"
      MIHOB_PORT: "8080"
      MIHOB_DATA_DIR: "/data"
      MIHOB_ADMIN_USER: "admin"
      MIHOB_ADMIN_PASS: "${MIHOB_ADMIN_PASS:-mihob123456}"
      TZ: "Asia/Shanghai"
    volumes:
      - ./hub-data:/data
```

Start Hub:

```bash
docker compose -f deploy/docker-compose.hub.yml up -d
```

### Docker Compose (Agent)

```yaml
services:
  mihob-agent:
    image: ghcr.io/tom2almighty/mihob-agent:latest
    container_name: mihob-agent
    restart: unless-stopped
    network_mode: host
    environment:
      MIHOB_HUB_URL: "${MIHOB_HUB_URL:?Set MIHOB_HUB_URL}"
      MIHOB_NODE_TOKEN: "${MIHOB_NODE_TOKEN:?Set MIHOB_NODE_TOKEN}"
      MIHOB_DATA_DIR: "/data"
      TZ: "Asia/Shanghai"
    volumes:
      - ./agent-data:/data
```

Start Agent:

```bash
MIHOB_HUB_URL="https://hub.example.com" MIHOB_NODE_TOKEN="<token>" \
  docker compose -f deploy/docker-compose.agent.yml up -d
```

## License

Licensed under [AGPL-3.0](LICENSE).
