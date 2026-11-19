# AGENTS.md

Guidance for coding agents working in the **mihob** repository.

## Project Overview

**mihob** is a Hub + Agent control plane for multi-node, multi-user **Mihomo** (`listeners:`) server deployments.
A single Go binary (`cmd/mihob`) runs either mode (`mihob hub` or `mihob agent`) and embeds the compiled React management console (`web/dist`) via `web/embed.go`.

- **Backend**: Go (`CGO_ENABLED=0`), pure-Go SQLite (`modernc.org/sqlite`), Gorilla WebSocket (Agent reverse tunnel to Hub), `go-acme/lego/v4` (ACME certificates), `gopkg.in/yaml.v3` (Mihomo YAML generation).
- **Frontend**: React 19 + TypeScript + Vite 6 + Tailwind CSS v4 (`@tailwindcss/vite`) + shadcn/ui (`neutral` base color, OKLCH tokens) + TanStack Query v5 + React Hook Form + Zod + `i18next` (`zh-CN` / `en-US`).

---

## Repository Map

```text
cmd/mihob/              CLI entrypoint (`mihob hub` / `mihob agent`)
internal/
  acme/                 ACME issuance & renewal (Cloudflare / AliDNS / DNSPod DNS-01, HTTP-01)
  agent/                Agent runtime, mihomo process supervisor, Unix-socket traffic collector
  crypto/               Bcrypt, JWT, Reality X25519 keypair, SS-2022 PSK, self-signed cert helpers
  db/                   SQLite schema, migrations, CRUD for nodes/inbounds/users/certs/templates/settings
  hub/                  HTTP API, Agent WebSocket manager, scheduler, public subscription endpoints
  mihomogen/            Server `listeners:` config generator & client template renderer
  model/                Shared domain structs & JSON tags
  protocol/             Hub <-> Agent WebSocket wire messages
web/
  embed.go              `//go:embed all:dist` packaging for the Hub binary
  src/
    components/ui/      shadcn/ui primitives (DropdownMenu defaults to `modal = false`)
    components/layout/  `AppShell.tsx` (collapsible sidebar, top bar, Language & Theme switchers)
    components/common/  `PageHeader`, `EmptyState`, `ErrorState`, `CopyButton`, `TrafficProgress`
    lib/                `api.ts` (fetch client + query keys), `auth.tsx`, `theme.tsx`, `i18n.ts`, `types.ts`
    locales/            `zh-CN.json` and `en-US.json` (must always have identical key trees)
    pages/              Route-level lazy pages + feature subdialogs (`nodes/`, `users/`, `certificates/`)
deploy/                 `Dockerfile.hub`, `Dockerfile.agent`, and `docker-compose.*.yml`
.github/workflows/      `ci.yml` and `release.yml` (triggered on `v*` tags)
```

---

## Build, Test & Development Commands

> **Important**: `web/embed.go` embeds `web/dist`. Always build the frontend **before** running `go build` or `go test` on packages that import `web` if frontend assets changed.

### Frontend (`web/`)
```bash
cd web
pnpm install --frozen-lockfile
pnpm dev          # Vite dev server on :5173 (proxies /api, /sub, /install, /ws to :8080)
pnpm build        # Runs `tsc -b && vite build` -> outputs to web/dist
```

### Backend (repo root)
```bash
go vet ./...
go test -v ./...
go build -trimpath -ldflags="-s -w" -o bin/mihob ./cmd/mihob   # (bin/mihob.exe on Windows)
```

---

## Architecture & Domain Rules

1. **Hub <-> Agent Reverse Tunnel (`internal/hub/ws_manager.go`, `internal/agent/`)**
   - Agents authenticate via `Authorization: Bearer <node_token>` over WebSocket (`/ws/agent`).
   - Any mutation to a node, its inbounds, its referenced certificates, or authorized users/traffic status must trigger `SyncNodeConfig(nodeID)` so active agents hot-reload immediately.
   - Before hot-reloading, the agent writes certs, injects the controlled Unix socket controller, runs `mihomo -t`, backs up the previous config, calls `PUT /configs?force=true`, and rolls back on failure.

2. **Subscription Routing (`internal/hub/server.go`, `internal/hub/handlers_users.go`)**
   - The subscription path prefix is configurable via `SystemSettings.SubPath` (default `"sub"`, stored in `settings` table under key `sub_path`).
   - `normalizeSubPath` rejects reserved first segments (`api`, `ws`, `assets`, `install`, `healthz`, `login`, `nodes`, `certificates`, `users`, `templates`, `settings`, `.well-known`). Keep the frontend validator `isValidSubPath` in `web/src/pages/SettingsPage.tsx` in sync with this list.
   - Requests to `/{sub_path}/{token}`:
     - If `Accept` prefers `text/html` and neither `?raw=1` nor `?download=1` is set, the Hub serves the SPA `index.html` so the browser renders `SubscriptionPage.tsx` (which calls `GET /api/public/sub?path=...`).
     - Otherwise (Mihomo/Clash clients, `curl`, `?raw=1`, `?download=1`), the Hub directly returns the rendered Mihomo YAML with `Subscription-Userinfo` and `Content-Disposition` headers.

3. **Mihomo Config Generation (`internal/mihomogen/`)**
   - Supported protocols: `vless`, `vmess`, `trojan`, `hysteria2`, `tuic`, `anytls`, `shadowsocks`.
   - Shadowsocks 2022 (`2022-blake3-*`) derives per-user EIH subkeys (`<server_psk>:<user_subkey>`); classic SS ciphers fall back to single-password/port behavior.
   - Exclude disabled, expired, or traffic-exhausted users (and nodes over their traffic limit) from generated server `listeners:` and client proxies.

---

## Frontend Conventions

1. **Design System & Styling**
   - Use shadcn/ui **`neutral`** semantic tokens (`bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`, `bg-destructive`, `bg-success`, `bg-warning`). Never hardcode raw Tailwind palette colors (`slate-*`, `zinc-*`, hex) in components.
   - Keep numeric columns, rates, quotas, and timestamps aligned with `tabular-nums` (or `font-mono` for tokens/hosts/ports).
   - Every icon-only button requires an `aria-label` and a `<Tooltip>`.

2. **No Layout Shift / No Dialog Drift**
   - `DropdownMenu` defaults to `modal = false` (`web/src/components/ui/dropdown-menu.tsx`) and `body[data-scroll-locked]` neutralizes scroll-lock margins in `web/src/index.css`. Do not set `modal={true}` on top-bar menus.
   - Notice: When wrapping `<NavLink>` inside Radix `<TooltipTrigger asChild>`, pass a plain string `className` (compute active state with `useMatch`) because Radix `Slot` drops function `className` props.
   - Multi-tab dialog forms (`NodeFormDialog`, `InboundFormDialog`, `UserFormDialog`, `CertFormDialog`, `InstallCommandDialog`) use a fixed-height scrollable tab body (`h-[...] max-h-[58vh] overflow-y-auto`) and jump to the first tab containing validation errors on submit.

3. **State & Cache Hygiene**
   - Use **TanStack Query** (`queryKeys` in `web/src/lib/api.ts`) for all server state.
   - When opening detail/sub-dialogs for an entity (`NodesPage`, `UsersPage`), store the entity **ID** in state and derive the object from `query.data` (or update the query cache via `qc.setQueryData` on mutation) so token resets and edits reflect immediately without reopening the dialog.

4. **Code Splitting**
   - All top-level pages in `web/src/App.tsx` are loaded via `React.lazy`. Vendor chunks are grouped in `web/vite.config.ts` (`vendor-react`, `vendor-charts`, `vendor-ui`, `vendor-data`). Keep individual chunks under the 500 kB warning limit.

5. **Internationalization (i18n)**
   - All user-visible strings (including Zod validation messages, toasts, aria-labels, placeholders, and empty states) must go through `useTranslation()` (`t("...")`).
   - Do not leave hardcoded CJK or English UI copy in `.tsx` / `.ts` files outside `web/src/locales/`.
   - Whenever adding, renaming, or removing a translation key, update **both** `web/src/locales/zh-CN.json` and `web/src/locales/en-US.json` so their key sets remain 100% identical (`web/src/types/i18n.d.ts` derives strict key types from `zh-CN.json`).

---

## Pre-Commit Verification Checklist

Before finishing any task that touches code:

1. **i18n parity check** (if locales or UI text changed):
   Verify `zh-CN.json` and `en-US.json` have identical keys and no untranslated CJK characters exist in `web/src` outside `locales/`.
2. **Frontend typecheck & build**:
   Run `pnpm build` in `web/` and confirm zero TypeScript errors and zero Vite chunk size warnings.
3. **Backend checks**:
   Run `go vet ./...` and `go test ./...` at the repository root.
