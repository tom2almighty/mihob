[English](./README.en.md)

# mihob

**mihob** 是一个基于 Mihomo 服务端入站（`listeners`）的多节点、多用户代理部署与订阅管理控制平面，采用单二进制 **Hub + Agent** 反向 WebSocket 隧道架构，内置 React 管理控制台与用户自助订阅页。

## 核心特性

- **15 种 Mihomo 服务端入站**：完整支持全部 Mihomo `listeners` 协议，提供表单配置、YAML 深度合并与实时预览。
- **反向隧道与内核热升级**：Agent 主动连接 Hub，节点零管理端口暴露；下发前执行 `mihomo -t` 校验并自动回滚，支持全集群安全热升级。
- **出站分流与 Cloudflare 集成**：支持节点级 WireGuard / MASQUE（内置节点端 WARP 与 Zero Trust JWT 注册）、SOCKS5 / HTTP / 自定义 YAML 与链式节点中转；内置 `cloudflared` 托管及 `-cf` 专属 Agent 镜像。
- **双模板引擎**：支持客户端订阅模板（自定义路径 + 自助订阅页）与节点服务端模板（防滥用审计、解锁分流、`type: mihob-node` 链式代理）。
- **细粒度授权与多维统计**：按地区、标签、协议与正则动态授权，到期或超额自动踢断；提供节点、用户及「用户×节点」流量趋势与多渠道通知告警。
- **证书中心与多主题**：支持 ACME（Cloudflare / 阿里云 DNS / DNSPod / HTTP-01）自动签发续期、多套主题与中英文切换。

## 界面预览

<details>
<summary>点击展开预览</summary>

<br />

<table width="100%">
  <thead>
    <tr>
      <th width="50%" align="center">运行总览（深色模式）</th>
      <th width="50%" align="center">运行总览（浅色模式）</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td width="50%" align="center"><img src="./docs/screenshots/dashboard-dark.png" alt="Dashboard Dark" width="100%" /></td>
      <td width="50%" align="center"><img src="./docs/screenshots/dashboard-light.png" alt="Dashboard Light" width="100%" /></td>
    </tr>
  </tbody>
</table>

<table width="100%">
  <thead>
    <tr>
      <th width="50%" align="center">节点管理</th>
      <th width="50%" align="center">用户管理</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td width="50%" align="center"><img src="./docs/screenshots/nodes.png" alt="Nodes Management" width="100%" /></td>
      <td width="50%" align="center"><img src="./docs/screenshots/users.png" alt="Users Management" width="100%" /></td>
    </tr>
  </tbody>
</table>

<table width="100%">
  <thead>
    <tr>
      <th width="50%" align="center">配置模板</th>
      <th width="50%" align="center">用户订阅</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td width="50%" align="center"><img src="./docs/screenshots/templates.png" alt="Templates" width="100%" /></td>
      <td width="50%" align="center"><img src="./docs/screenshots/subscription.png" alt="Subscription Portal" width="100%" /></td>
    </tr>
  </tbody>
</table>

</details>

## 快速部署

### Docker 镜像说明

| 镜像与 Tag | 说明 |
| --- | --- |
| `ghcr.io/tom2almighty/mihob-hub:latest` / `:vX.Y.Z` | Hub 控制平面（内嵌 Web 控制台） |
| `ghcr.io/tom2almighty/mihob-agent:latest` / `:vX.Y.Z` | 标准轻量 Agent 镜像（内置 `mihob-agent` + `mihomo`） |
| `ghcr.io/tom2almighty/mihob-agent:latest-cf` / `:vX.Y.Z-cf` | Cloudflare Tunnel 增强版 Agent 镜像（额外内置 `cloudflared`，设置 `CF_TUNNEL_TOKEN` 即可由 Agent 同容器托管隧道，无需单独部署 sidecar） |

### Docker Compose 启动（Hub）

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
      MIHOB_ADMIN_PASS: "${MIHOB_ADMIN_PASS:-}"
      TZ: "Asia/Shanghai"
    volumes:
      - ./hub-data:/data
```

```bash
docker compose -f deploy/docker-compose.hub.yml up -d
```

### Docker Compose 启动（Agent）

```yaml
services:
  mihob-agent:
    image: ghcr.io/tom2almighty/mihob-agent:latest # 如需内置 Cloudflare Tunnel，可改为 latest-cf
    container_name: mihob-agent
    restart: unless-stopped
    network_mode: host
    environment:
      MIHOB_HUB_URL: "${MIHOB_HUB_URL:?Set MIHOB_HUB_URL}"
      MIHOB_NODE_TOKEN: "${MIHOB_NODE_TOKEN:?Set MIHOB_NODE_TOKEN}"
      MIHOB_DATA_DIR: "/data"
      # 使用 latest-cf 镜像时可按需开启：
      # CF_TUNNEL_TOKEN: "<CLOUDFLARE_TUNNEL_TOKEN>"
      TZ: "Asia/Shanghai"
    volumes:
      - ./agent-data:/data
```

```bash
MIHOB_HUB_URL="https://hub.example.com" MIHOB_NODE_TOKEN="<token>" \
  docker compose -f deploy/docker-compose.agent.yml up -d
```

### 二进制部署

可从 [GitHub Releases](https://github.com/tom2almighty/mihob/releases) 下载预编译压缩包：

- **Hub**（`mihob_<version>_<os>_<arch>.tar.gz` / `.zip`）：

```bash
tar -xzf mihob_<version>_linux_amd64.tar.gz
chmod +x ./mihob
./mihob hub --host 0.0.0.0 --port 8080 --data ./data
```

首次启动若未设置 `MIHOB_ADMIN_PASS`，将随机生成管理员密码并输出至控制台日志。

- **Agent**（`mihob-agent_<version>_linux_<arch>.tar.gz`）：
  - **推荐**：在控制台「节点管理 → 部署 → Linux 二进制」复制一键安装命令，自动安装 `mihomo`、`mihob-agent`（可选 `--cf-token` 同时安装并托管 `cloudflared`）并注册 `systemd` 服务，支持 `--update` 与 `--uninstall`。
  - **手动运行**：

```bash
tar -xzf mihob-agent_<version>_linux_amd64.tar.gz
chmod +x ./mihob-agent
./mihob-agent --hub "https://hub.example.com" --token "<NODE_TOKEN>" --data ./agent-data --mihomo-bin /usr/local/bin/mihomo
```

## 配置文件与环境变量

Hub 首次启动会自动生成 `{data_dir}/config.yaml`（可用 `--config` 或 `MIHOB_CONFIG` 指定）。优先级：**命令行参数 > 环境变量 > `config.yaml` > 默认值**；业务设置（公网地址、订阅路径、主题等）均可在 Web 控制台热更新。

### Hub 常用环境变量

| 变量名 | 默认值 | 说明 |
| --- | --- | --- |
| `MIHOB_CONFIG` | `<data_dir>/config.yaml` | Hub YAML 配置文件路径 |
| `MIHOB_HOST` | `0.0.0.0` | HTTP 监听主机地址（如 `127.0.0.1` 或 `0.0.0.0`） |
| `MIHOB_PORT` | `8080` | HTTP 监听端口 |
| `MIHOB_DATA_DIR` | `./data` | SQLite 数据库与 ACME 证书存储目录 |
| `MIHOB_ADMIN_USER` | `admin` | 初始管理员用户名 |
| `MIHOB_ADMIN_PASS` | 空 | 初始管理员密码（留空时首次启动随机生成并打印至日志） |
| `MIHOB_TRAFFIC_RETENTION_DAYS` | `365` | 小时级流量历史保留天数（`0` 表示永久保留） |
| `MIHOB_TRUST_PROXY` | `false` | 强制信任反代 `X-Forwarded-For` / `X-Real-IP`（环回与内网反代默认已信任） |
| `MIHOB_CORS_ORIGINS` | 空 | 额外允许的跨域 `Origin` 列表（逗号分隔；默认允许同源及 `hub_public_url`） |
| `MIHOB_ALLOW_PRIVATE_WEBHOOK` | `false` | 允许通知渠道推送至内网/局域网 Webhook 地址（默认拦截私有网段以防 SSRF） |

### Agent 常用环境变量

| 变量名 | 默认值 | 说明 |
| --- | --- | --- |
| `MIHOB_HUB_URL` | 无（必填） | Hub 访问地址 |
| `MIHOB_NODE_TOKEN` | 无（必填） | 节点鉴权 Token |
| `MIHOB_DATA_DIR` | `./agent-data` | Agent 运行数据目录 |
| `MIHOB_MIHOMO_BIN` | `mihomo` | Mihomo 可执行文件路径 |
| `CF_TUNNEL_TOKEN` | 空 | Cloudflare Tunnel Token（设置后自动托管 `cloudflared`；兼容 `TUNNEL_TOKEN`） |
| `CF_TUNNEL_PROTOCOL` | 自动 | Tunnel 传输协议（`quic` 或 `http2`） |
| `CF_TUNNEL_EDGE_IP` | 自动 | Tunnel 边缘 IP 版本（`4` 或 `6`） |
| `CF_TUNNEL_HA_CONNECTIONS` | `4` | Tunnel 高可用连接数（`1` / `2` / `4`） |
| `CF_TUNNEL_LOGLEVEL` | `info` | `cloudflared` 日志级别（`info` / `warn` / `error` / `debug`） |
| `CF_TUNNEL_BIN` | `cloudflared` | `cloudflared` 可执行文件路径 |

## 本地开发与构建

**环境要求**：Go 1.27+ · Node.js 24+ · pnpm 12+

```bash
# 本地开发
cd web && pnpm install --frozen-lockfile
go run ./cmd/mihob hub --host 0.0.0.0 --port 8080 --data ./data   # 终端 1：Hub (:8080)
cd web && pnpm dev                                                 # 终端 2：Vite (:5173)

# 生产构建（前端产物内嵌至 Go 二进制）
cd web && pnpm install --frozen-lockfile && pnpm build
cd .. && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o bin/mihob ./cmd/mihob
```

## 开源许可证

本项目采用 [AGPL-3.0](LICENSE) 开源许可证。
