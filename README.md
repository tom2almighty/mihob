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
| `MIHOB_LISTEN` | HTTP 监听地址 | `:8080` |
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

# 终端 1：启动 Hub 后端（监听 :8080）
go run ./cmd/mihob hub --listen :8080 --data ./data

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
      MIHOB_LISTEN: ":8080"
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

本项目采用 [AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html) 开源许可证。
