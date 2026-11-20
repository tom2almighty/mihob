[English](./README.en.md)

# mihob

## 项目简介

mihob 是一个基于 Mihomo 服务端入站（`listeners`）的多节点、多用户代理部署与订阅管理控制平面，采用单二进制 Hub + Agent 架构运行。

## 开发环境配置

### 依赖要求

- Go 1.27+
- Node.js 24+
- pnpm 12+

### 环境变量

Hub 常用环境变量：

| 变量名 | 说明 | 默认值 |
| --- | --- | --- |
| `MIHOB_HOST` | HTTP 监听主机地址（如 `127.0.0.1` 或 `0.0.0.0`） | `0.0.0.0` |
| `MIHOB_PORT` | HTTP 监听端口 | `8080` |
| `MIHOB_DATA_DIR` | SQLite 数据库与 ACME 证书存储目录 | `./data` |
| `MIHOB_ADMIN_USER` | 初始管理员用户名 | `admin` |
| `MIHOB_ADMIN_PASS` | 初始管理员密码（留空时首次启动随机生成） | 空 |

Agent 常用环境变量：

| 变量名 | 说明 | 默认值 |
| --- | --- | --- |
| `MIHOB_HUB_URL` | Hub 访问地址（必填） | 无 |
| `MIHOB_NODE_TOKEN` | 节点鉴权 Token（必填） | 无 |
| `MIHOB_DATA_DIR` | Agent 运行数据目录 | `./agent-data` |
| `MIHOB_MIHOMO_BIN` | Mihomo 可执行文件路径 | `mihomo` |

### 本地调试

```bash
# 安装前端依赖
cd web && pnpm install --frozen-lockfile

# 终端 1：启动 Hub 后端（监听 0.0.0.0:8080）
go run ./cmd/mihob hub --host 0.0.0.0 --port 8080 --data ./data

# 终端 2：启动前端开发服务器（监听 :5173，自动代理后端接口）
cd web && pnpm dev
```

## 构建与部署

### 生产构建

```bash
# 构建前端静态产物（将内嵌至 Go 二进制）
cd web && pnpm install --frozen-lockfile && pnpm build

# 编译单二进制可执行文件
cd ..
CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o bin/mihob ./cmd/mihob
```

### 二进制方式运行（非 Docker）

可从 [GitHub Releases](https://github.com/tom2almighty/mihob/releases) 下载对应平台预编译压缩包（或按上方「生产构建」自行编译）：

- **Hub**（`mihob_<version>_<os>_<arch>.tar.gz` / `.zip`）：

```bash
tar -xzf mihob_<version>_linux_amd64.tar.gz
chmod +x ./mihob

# 直接启动（也可通过环境变量 MIHOB_HOST / MIHOB_PORT / MIHOB_DATA_DIR / MIHOB_ADMIN_PASS 配置）
./mihob hub --host 0.0.0.0 --port 8080 --data ./data
```

首次启动未指定 `MIHOB_ADMIN_PASS` 时，控制台日志会打印自动生成的初始管理员密码；生产环境建议配合 `systemd` 守护运行并通过反代提供 HTTPS。

- **Agent**（`mihob-agent_<version>_linux_<arch>.tar.gz`）：
  - **推荐**：在 Hub 控制台「节点管理 → 部署 → 二进制脚本」中复制一键命令，自动安装 `mihomo`、`mihob-agent` 并注册 `systemd` 服务（同样支持 `--update` 更新与 `--uninstall` 卸载）。
  - **手动运行**（节点需先安装 `mihomo` 可执行文件）：

```bash
tar -xzf mihob-agent_<version>_linux_amd64.tar.gz
chmod +x ./mihob-agent

./mihob-agent \
  --hub "https://hub.example.com" \
  --token "<NODE_TOKEN>" \
  --data ./agent-data \
  --mihomo-bin /usr/local/bin/mihomo
```

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
      MIHOB_ADMIN_PASS: "${MIHOB_ADMIN_PASS:-mihob123456}"
      TZ: "Asia/Shanghai"
    volumes:
      - ./hub-data:/data
```

启动命令：

```bash
docker compose -f deploy/docker-compose.hub.yml up -d
```

### Docker Compose 启动（Agent）

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

启动命令：

```bash
MIHOB_HUB_URL="https://hub.example.com" MIHOB_NODE_TOKEN="<token>" \
  docker compose -f deploy/docker-compose.agent.yml up -d
```

## 开源许可证

本项目采用 [AGPL-3.0](LICENSE) 开源许可证。
