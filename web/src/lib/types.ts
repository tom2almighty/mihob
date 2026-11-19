export type Protocol =
  | "vless"
  | "vmess"
  | "trojan"
  | "hysteria2"
  | "tuic"
  | "anytls"
  | "shadowsocks"

export const PROTOCOL_LABELS: Record<Protocol, string> = {
  vless: "VLESS",
  vmess: "VMess",
  trojan: "Trojan",
  hysteria2: "Hysteria2",
  tuic: "TUIC v5",
  anytls: "AnyTLS",
  shadowsocks: "Shadowsocks",
}

export interface Admin {
  id: number
  username: string
  created_at: string
  updated_at: string
}

export interface Node {
  id: number
  name: string
  host: string
  region: string
  token: string
  enabled: boolean
  traffic_limit: number
  traffic_used: number
  upload_used: number
  download_used: number
  traffic_multiplier: number
  reset_day: number
  last_reset_at: string | null
  remark: string
  mihomo_version: string
  agent_version: string
  config_hash: string
  config_status: "synced" | "pending" | "error"
  config_error: string
  last_seen_at: string | null
  created_at: string
  updated_at: string
  online: boolean
  mihomo_running: boolean
  cpu_percent: number
  mem_used: number
  mem_total: number
  active_connections: number
  up_rate: number
  down_rate: number
  inbound_count: number
}

export interface InboundSettings {
  security?: "none" | "tls" | "reality"
  sni?: string
  alpn?: string[]
  skip_cert_verify?: boolean
  client_fingerprint?: string
  network?: "tcp" | "ws" | "grpc" | "xhttp"
  ws_path?: string
  ws_host?: string
  grpc_service_name?: string
  xhttp_path?: string
  xhttp_mode?: string
  reality_dest?: string
  reality_server_names?: string[]
  reality_private_key?: string
  reality_public_key?: string
  reality_short_ids?: string[]
  flow?: string
  alter_id?: number
  cipher?: string
  up_mbps?: number
  down_mbps?: number
  ignore_client_bandwidth?: boolean
  obfs?: string
  obfs_password?: string
  masquerade?: string
  hop_ports?: string
  congestion_controller?: string
  max_idle_time?: number
  udp_relay_mode?: string
  padding_scheme?: string
  ss_cipher?: string
  ss_server_password?: string
  udp?: boolean
}

export interface Inbound {
  id: number
  node_id: number
  name: string
  tag: string
  protocol: Protocol
  listen: string
  port: number
  cert_id: number | null
  enabled: boolean
  settings: InboundSettings
  created_at: string
  updated_at: string
}

export interface Certificate {
  id: number
  name: string
  domain: string
  sans: string[]
  source: "self_signed" | "manual" | "acme"
  acme_provider?: string
  acme_email?: string
  acme_credentials?: Record<string, string>
  cert_pem?: string
  issuer: string
  not_before: string | null
  not_after: string | null
  auto_renew: boolean
  last_error: string
  created_at: string
  updated_at: string
}

export interface User {
  id: number
  username: string
  email: string
  uuid: string
  password: string
  ss_key_16: string
  ss_key_32: string
  sub_token: string
  enabled: boolean
  traffic_limit: number
  traffic_used: number
  upload_used: number
  download_used: number
  expire_at: string | null
  template_id: number | null
  node_ids: number[]
  remark: string
  created_at: string
  updated_at: string
}

export interface Template {
  id: number
  name: string
  description: string
  content: string
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface TrafficPoint {
  bucket: string
  upload: number
  download: number
}

export interface DashboardData {
  summary: {
    total_nodes: number
    online_nodes: number
    total_users: number
    active_users: number
    expiring_soon_users: number
    total_certs: number
    expiring_certs: number
    active_connections: number
    up_rate: number
    down_rate: number
    total_traffic: number
  }
  nodes: Node[]
  top_users: User[]
  traffic_hourly: TrafficPoint[]
}

export interface InstallCommands {
  hub_url: string
  token: string
  docker_compose: string
  docker_run: string
  binary_install: string
}

export interface SystemSettings {
  hub_public_url: string
  acme_email: string
  agent_image: string
  sub_path: string
}

export interface PublicSubNode {
  name: string
  region: string
  online: boolean
  protocols: string[]
}

export interface PublicSubInfo {
  username: string
  enabled: boolean
  status: "active" | "expiring" | "expired" | "exhausted" | "disabled"
  traffic_limit: number
  traffic_used: number
  upload_used: number
  download_used: number
  expire_at: string | null
  sub_url: string
  download_url: string
  raw_url: string
  nodes: PublicSubNode[]
  yaml?: string
}
