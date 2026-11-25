import type { Protocol } from "@/lib/types"

export interface ProtocolSpec {
  protocol: Protocol
  category: "stream" | "quic" | "classic" | "proxy"
  defaultSecurity: "reality" | "tls" | "none"
  supportsReality: boolean
  needsCertAlways: boolean
  supportsOptionalTls: boolean
  supportsStreamTransport: boolean
  supportsXhttp: boolean
}

export const MIHOMO_PROTOCOLS: Record<Protocol, ProtocolSpec> = {
  vless: {
    protocol: "vless",
    category: "stream",
    defaultSecurity: "reality",
    supportsReality: true,
    needsCertAlways: false,
    supportsOptionalTls: false,
    supportsStreamTransport: true,
    supportsXhttp: true,
  },
  vmess: {
    protocol: "vmess",
    category: "stream",
    defaultSecurity: "reality",
    supportsReality: true,
    needsCertAlways: false,
    supportsOptionalTls: false,
    supportsStreamTransport: true,
    supportsXhttp: false,
  },
  trojan: {
    protocol: "trojan",
    category: "stream",
    defaultSecurity: "reality",
    supportsReality: true,
    needsCertAlways: false,
    supportsOptionalTls: false,
    supportsStreamTransport: true,
    supportsXhttp: false,
  },
  hysteria2: {
    protocol: "hysteria2",
    category: "quic",
    defaultSecurity: "tls",
    supportsReality: false,
    needsCertAlways: true,
    supportsOptionalTls: false,
    supportsStreamTransport: false,
    supportsXhttp: false,
  },
  tuic: {
    protocol: "tuic",
    category: "quic",
    defaultSecurity: "tls",
    supportsReality: false,
    needsCertAlways: true,
    supportsOptionalTls: false,
    supportsStreamTransport: false,
    supportsXhttp: false,
  },
  anytls: {
    protocol: "anytls",
    category: "stream",
    defaultSecurity: "tls",
    supportsReality: false,
    needsCertAlways: true,
    supportsOptionalTls: false,
    supportsStreamTransport: false,
    supportsXhttp: false,
  },
  trusttunnel: {
    protocol: "trusttunnel",
    category: "quic",
    defaultSecurity: "tls",
    supportsReality: false,
    needsCertAlways: true,
    supportsOptionalTls: false,
    supportsStreamTransport: false,
    supportsXhttp: false,
  },
  shadowquic: {
    protocol: "shadowquic",
    category: "quic",
    defaultSecurity: "none",
    supportsReality: false,
    needsCertAlways: false,
    supportsOptionalTls: false,
    supportsStreamTransport: false,
    supportsXhttp: false,
  },
  shadowsocks: {
    protocol: "shadowsocks",
    category: "classic",
    defaultSecurity: "none",
    supportsReality: false,
    needsCertAlways: false,
    supportsOptionalTls: false,
    supportsStreamTransport: false,
    supportsXhttp: false,
  },
  mieru: {
    protocol: "mieru",
    category: "classic",
    defaultSecurity: "none",
    supportsReality: false,
    needsCertAlways: false,
    supportsOptionalTls: false,
    supportsStreamTransport: false,
    supportsXhttp: false,
  },
  snell: {
    protocol: "snell",
    category: "classic",
    defaultSecurity: "none",
    supportsReality: false,
    needsCertAlways: false,
    supportsOptionalTls: false,
    supportsStreamTransport: false,
    supportsXhttp: false,
  },
  sudoku: {
    protocol: "sudoku",
    category: "classic",
    defaultSecurity: "none",
    supportsReality: false,
    needsCertAlways: false,
    supportsOptionalTls: false,
    supportsStreamTransport: false,
    supportsXhttp: false,
  },
  http: {
    protocol: "http",
    category: "proxy",
    defaultSecurity: "tls",
    supportsReality: false,
    needsCertAlways: false,
    supportsOptionalTls: true,
    supportsStreamTransport: false,
    supportsXhttp: false,
  },
  socks: {
    protocol: "socks",
    category: "proxy",
    defaultSecurity: "tls",
    supportsReality: false,
    needsCertAlways: false,
    supportsOptionalTls: true,
    supportsStreamTransport: false,
    supportsXhttp: false,
  },
  mixed: {
    protocol: "mixed",
    category: "proxy",
    defaultSecurity: "tls",
    supportsReality: false,
    needsCertAlways: false,
    supportsOptionalTls: true,
    supportsStreamTransport: false,
    supportsXhttp: false,
  },
}

export const NEEDS_CERT_ALWAYS: Protocol[] = Object.values(MIHOMO_PROTOCOLS)
  .filter((s) => s.needsCertAlways)
  .map((s) => s.protocol)

export const SUPPORTS_REALITY: Protocol[] = Object.values(MIHOMO_PROTOCOLS)
  .filter((s) => s.supportsReality)
  .map((s) => s.protocol)

export const SUPPORTS_OPTIONAL_TLS: Protocol[] = Object.values(MIHOMO_PROTOCOLS)
  .filter((s) => s.supportsOptionalTls)
  .map((s) => s.protocol)

export const FINGERPRINTS = [
  "chrome",
  "firefox",
  "safari",
  "ios",
  "android",
  "edge",
  "360",
  "qq",
  "random",
  "randomized",
] as const

export function getProtocolSpec(protocol: Protocol): ProtocolSpec {
  return MIHOMO_PROTOCOLS[protocol]
}
