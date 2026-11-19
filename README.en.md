[简体中文](./README.md)

# mihob

## Overview

mihob is a Hub + Agent control plane for deploying and managing multi-node, multi-user Mihomo (`listeners`) proxy servers and client subscriptions in a single binary.

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
