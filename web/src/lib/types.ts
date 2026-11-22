export type Protocol =
  | "vless"
  | "vmess"
  | "trojan"
  | "hysteria2"
  | "tuic"
  | "anytls"
  | "shadowsocks"
  | "mieru"
  | "trusttunnel"
  | "shadowquic"
  | "snell"
  | "sudoku"
  | "http"
  | "socks"
  | "mixed"

export const PROTOCOL_LABELS: Record<Protocol, string> = {
  vless: "VLESS",
  vmess: "VMess",
  trojan: "Trojan",
  hysteria2: "Hysteria2",
  tuic: "TUIC v5",
  anytls: "AnyTLS",
  shadowsocks: "Shadowsocks",
  mieru: "Mieru",
  trusttunnel: "TrustTunnel",
  shadowquic: "ShadowQUIC",
  snell: "Snell",
  sudoku: "Sudoku",
  http: "HTTP / HTTPS",
  socks: "SOCKS5",
  mixed: "Mixed (HTTP+SOCKS5)",
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
  tags: string[]
  token: string
  enabled: boolean
  traffic_limit: number
  traffic_used: number
  upload_used: number
  download_used: number
  traffic_multiplier: number
  reset_day: number
  last_reset_at: string | null
  expire_at: string | null
  billing_cycle: string
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
  proxy_name?: string
  client_server?: string
  client_port?: number
  client_tls?: boolean
  // Security
  security?: "none" | "tls" | "reality"
  sni?: string
  alpn?: string[]
  skip_cert_verify?: boolean
  client_fingerprint?: string
  ech_key?: string
  ech_enable?: boolean
  ech_config?: string
  client_auth_type?: string
  client_auth_cert?: string
  port_range?: string
  routing_mark?: number
  listener_rule?: string
  listener_proxy?: string
  network?: "tcp" | "ws" | "grpc" | "xhttp"
  ws_path?: string
  ws_host?: string
  grpc_service_name?: string
  xhttp_path?: string
  xhttp_mode?: string
  xhttp_host?: string
  xhttp_no_sse_header?: boolean
  xhttp_x_padding_bytes?: string
  reality_dest?: string
  reality_server_names?: string[]
  reality_private_key?: string
  reality_public_key?: string
  reality_short_ids?: string[]
  flow?: string
  vless_decryption?: string
  vless_encryption?: string
  alter_id?: number
  cipher?: string
  up_mbps?: number
  down_mbps?: number
  ignore_client_bandwidth?: boolean
  obfs?: string
  obfs_password?: string
  masquerade?: string
  hop_ports?: string
  bbr_profile?: string
  congestion_controller?: string
  cwnd?: number
  max_idle_time?: number
  udp_relay_mode?: string
  padding_scheme?: string
  ss_cipher?: string
  ss_server_password?: string
  udp?: boolean
  mieru_transport?: string
  mieru_port_range?: string
  mieru_multiplexing?: string
  mieru_handshake_mode?: string
  mieru_traffic_pattern?: string
  mieru_tcp_idle_timeout?: number
  mieru_user_hint_mandatory?: boolean
  trusttunnel_network?: string
  trusttunnel_max_connections?: number
  trusttunnel_min_streams?: number
  trusttunnel_max_streams?: number
  name_cert_verify?: string
  shadowquic_jls_addr?: string
  shadowquic_jls_sni?: string
  shadowquic_jls_proxy?: string
  shadowquic_zero_rtt?: boolean
  snell_psk?: string
  snell_version?: number
  snell_mode?: string
  snell_obfs_mode?: string
  snell_obfs_host?: string
  sudoku_key?: string
  sudoku_aead_method?: string
  sudoku_table_type?: string
  sudoku_custom_table?: string
  sudoku_multiplex?: string
  sudoku_padding_min?: number
  sudoku_padding_max?: number
  sudoku_enable_pure_downlink?: boolean
  sudoku_disable_http_mask?: boolean
  sudoku_http_mask_mode?: string
  sudoku_http_mask_tls?: boolean
  sudoku_http_mask_host?: string
  sudoku_path_root?: string
  sudoku_fallback?: string
  extra_server_yaml?: string
  extra_client_yaml?: string
}

export interface Inbound {
  id: number
  node_id: number
  name: string
  tag: string
  tags: string[]
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

export type AccessMode = "all" | "rule" | "manual"
export type MatchMode = "all" | "any"

export interface AccessPolicy {
  node_mode: AccessMode
  node_match?: MatchMode
  node_regions?: string[]
  node_tags?: string[]
  node_name_regex?: string
  node_ids?: number[]
  exclude_node_ids?: number[]

  inbound_mode: AccessMode
  inbound_match?: MatchMode
  inbound_protocols?: Protocol[]
  inbound_tags?: string[]
  inbound_name_regex?: string
  inbound_ids?: number[]
  exclude_inbound_ids?: number[]
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
  access_policy: AccessPolicy
  traffic_limit: number
  traffic_used: number
  upload_used: number
  download_used: number
  expire_at: string | null
  template_id: number | null
  node_ids: number[]
  inbound_count: number
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

export type DashboardRange = "24h" | "7d" | "30d" | "all"

export interface TrafficPoint {
  bucket: string
  upload: number
  download: number
}

export interface NodeTrafficStat {
  node_id: number
  node_name: string
  region: string
  upload: number
  download: number
  total: number
}

export interface UserTrafficStat {
  user_id: number
  username: string
  upload: number
  download: number
  total: number
}

export interface ProtocolTrafficStat {
  protocol: string
  upload: number
  download: number
  total: number
}

export interface DashboardData {
  range: DashboardRange
  summary: {
    total_nodes: number
    online_nodes: number
    expiring_soon_nodes: number
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
  traffic_series: TrafficPoint[]
  node_traffic: NodeTrafficStat[]
  user_traffic: UserTrafficStat[]
  protocol_traffic: ProtocolTrafficStat[]
}

export interface InstallCommands {
  hub_url: string
  token: string
  docker_compose: string
  docker_run: string
  binary_install: string
  binary_update?: string
  binary_uninstall?: string
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
