# mihob

基于 **Mihomo** 服务端入站能力（`listeners:`）的多节点、多用户代理部署与管理控制平面，采用 **Hub + Agent** 架构，全面支持 **Docker** 与 **Linux 单二进制**部署。

## 核心特性

- **Hub + Agent 反向隧道架构**：Agent 主动通过 WebSocket 反向连接 Hub，无需在节点服务器暴露管理端口；内置断线重连、心跳与指标上报。
- **全协议服务端入站支持（15 种）**：
  - `VLESS`（Reality / TLS / TCP / WS / gRPC / XHTTP，`xtls-rprx-vision` 与 VLESS 原生加解密）
  - `VMess`（TLS / Reality / TCP / WS / gRPC）
  - `Trojan`（TLS / Reality / TCP / WS / gRPC）
  - `Hysteria2`（QUIC、带宽控制、Salamander 混淆、伪装、BBR 策略、端口跳跃）
  - `TUIC v5`（QUIC、BBR 拥塞控制、UDP 转发模式）
  - `AnyTLS`（自定义 Padding Scheme）
  - `Shadowsocks`（推荐 `2022-blake3-aes-128-gcm` / `2022-blake3-aes-256-gcm` 多用户模式）
  - `Mieru`（TCP / UDP、多路复用、端口范围、多用户鉴权）
  - `TrustTunnel`（HTTP/2 + HTTP/3 QUIC 隧道、多用户鉴权）
  - `ShadowQUIC`（QUIC + JLS 上游伪装免证书、0-RTT、多用户鉴权）
  - `Snell`（v1–v6、v6 流量整形模式、HTTP/TLS 混淆）
  - `Sudoku`（AEAD + ASCII/Entropy 混淆 + HTTP Mask）
  - `HTTP / HTTPS`、`SOCKS5`、`Mixed`（多用户鉴权 + 可选 TLS 加密）
- **配置安全热重载**：Agent 下发新配置前自动写入证书、注入受控本地 Unix Socket、执行 `mihomo -t` 校验、备份旧配置并通过 `PUT /configs?force=true` 平滑热重载，失败自动回滚。
- **集中证书中心**：支持 **ACME 自动签发与自动续期**（Cloudflare / 阿里云 DNS / DNSPod DNS-01 以及 HTTP-01）、**一键生成自签证书**、**手动导入 PEM**，变更自动同步至关联节点。
- **多用户权限、时间与流量管控**：
  - 为每个用户独立分配可用节点、到期时间、流量配额与 Mihomo 模板；
  - 节点支持独立月流量上限、计费倍率（如 `0.5x` / `2.0x`）与每月重置日；
  - Agent 通过本地 Unix Socket 订阅 `/connections?interval=500` 实时累算 `inboundUser` 流量，超额或到期立即热重载配置并调用 `DELETE /connections/{id}` 踢断活跃连接。
- **Mihomo 模板订阅**：不做重型订阅转换，内置通用 Mihomo 模板并支持自定义多模板管理、占位符（`{{PROXIES}}` / `{{PROXY_NAMES}}`）自动注入、在线按用户预览，响应头自带 `Subscription-Userinfo`。
- **现代管理面板**：Go 单二进制内嵌前端静态资源（React + TypeScript + Tailwind CSS v4 + shadcn/ui + TanStack Query），开箱即用。

## 快速开始

### 1. Docker 部署 Hub

```bash
docker compose -f deploy/docker-compose.hub.yml up -d
```

访问 `http://<hub-ip>:8080`，默认管理员账号为 `admin`，初始密码可通过环境变量 `MIHOB_ADMIN_PASS` 设置（默认为 `mihob123456`，首次登录后请在「系统设置」中修改）。

### 2. 部署节点 Agent

1. 在管理面板进入 **系统设置**，配置 **Hub 公网访问地址**（如 `https://hub.example.com`）。
2. 进入 **节点管理** → **创建节点**，点击节点行的 **部署** 按钮。
3. 直接复制生成的 **Docker Compose**、**Docker Run** 或 **Linux 二进制一键安装命令**在目标 VPS 上执行即可。

Agent Docker 镜像（`deploy/Dockerfile.agent`）已内置官方 `metacubex/mihomo` 内核与 `mihob agent`，单容器即可运行。

### 3. 本地开发

```bash
# 构建前端并编译单二进制
make build

# 运行 Hub
./bin/mihob hub --listen :8080 --data ./data

# 或前后端分离开发
go run ./cmd/mihob hub --listen :8080 --data ./data
cd web && pnpm dev
```

## 目录结构

```text
cmd/mihob/           CLI 入口（mihob hub / mihob agent）
internal/
  acme/              ACME 证书自动签发与续期（lego/v4）
  agent/             Agent 运行时、mihomo 进程守护与流量采集器
  crypto/            密码哈希、JWT、Reality X25519 / SS-2022 / 自签证书生成
  db/                SQLite（纯 Go modernc.org/sqlite）存储与迁移
  hub/               Hub HTTP API、Agent WS 管理器与定时调度器
  mihomogen/         Mihomo 服务端 listeners 与客户端模板生成器
  model/             领域模型定义
  protocol/          Hub <-> Agent WebSocket 通信协议
web/                 React + TypeScript + Tailwind CSS v4 + shadcn/ui 前端面板
deploy/              Hub / Agent Dockerfile 与 docker-compose 配置
```
