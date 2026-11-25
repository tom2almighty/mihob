import type { NodeOutbound, OutboundType } from "@/lib/types"
import { summarizeCustomOutboundYAML } from "./outboundCustom"

export const DEFAULT_WARP_SERVER = "engage.cloudflareclient.com"
export const DEFAULT_WARP_PORT = 2408
export const DEFAULT_WARP_PUBLIC_KEY = "bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo="
export const DEFAULT_WARP_MTU = 1280
export const DEFAULT_WARP_IP = "172.16.0.2/32"

export const DEFAULT_MASQUE_SERVER = "162.159.198.1"
export const DEFAULT_MASQUE_PORT = 443
export const DEFAULT_MASQUE_SNI = "consumer-masque.cloudflareclient.com"
export const DEFAULT_MASQUE_MTU = 1280

export const RULE_PRESET_KEYS = [
  "ai",
  "netflix",
  "disney",
  "youtube",
  "tiktok",
  "spotify",
  "google",
] as const

export const OUTBOUND_TYPES: OutboundType[] = [
  "wireguard",
  "masque",
  "socks5",
  "http",
  "custom",
  "mihob-node",
]

export const DEFAULT_OUTBOUND_NAMES: Record<OutboundType, string> = {
  wireguard: "WG-OUT",
  masque: "MASQUE-OUT",
  socks5: "SOCKS5-OUT",
  http: "HTTP-OUT",
  custom: "PROXY-OUT",
  "mihob-node": "UNLOCK-NODE",
}

export const WARP_WG_ENDPOINTS = [
  { key: "auto", server: DEFAULT_WARP_SERVER, port: DEFAULT_WARP_PORT },
  { key: "v4", server: "162.159.192.1", port: DEFAULT_WARP_PORT },
  { key: "v6", server: "2606:4700:d0::a29f:c001", port: DEFAULT_WARP_PORT },
] as const

export const WARP_MASQUE_ENDPOINTS = [
  { key: "v4", server: DEFAULT_MASQUE_SERVER, port: DEFAULT_MASQUE_PORT },
  { key: "v6", server: "2606:4700:103::1", port: DEFAULT_MASQUE_PORT },
  { key: "v4Alt", server: "162.159.198.2", port: DEFAULT_MASQUE_PORT },
  { key: "v6Alt", server: "2606:4700:104::1", port: DEFAULT_MASQUE_PORT },
] as const

export function nextUniqueName(existing: NodeOutbound[], base: string): string {
  const taken = new Set(existing.map((o) => o.name.trim().toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  let idx = 2
  while (taken.has(`${base}-${idx}`.toLowerCase())) {
    idx += 1
  }
  return `${base}-${idx}`
}

export function createDefaultOutbound(type: OutboundType, existing: NodeOutbound[]): NodeOutbound {
  const name = nextUniqueName(existing, DEFAULT_OUTBOUND_NAMES[type])
  switch (type) {
    case "wireguard":
      return {
        name,
        type: "wireguard",
        enabled: true,
        server: "",
        port: 51820,
        ip: "",
        ipv6: "",
        private_key: "",
        public_key: "",
        mtu: 1420,
        udp: true,
        remote_dns_resolve: false,
      }
    case "masque":
      return {
        name,
        type: "masque",
        enabled: true,
        server: "",
        port: DEFAULT_MASQUE_PORT,
        ip: "",
        ipv6: "",
        private_key: "",
        public_key: "",
        sni: "",
        network: "quic",
        mtu: DEFAULT_MASQUE_MTU,
        udp: true,
        remote_dns_resolve: false,
      }
    case "socks5":
      return {
        name,
        type: "socks5",
        enabled: true,
        server: "127.0.0.1",
        port: 40000,
        udp: true,
      }
    case "http":
      return {
        name,
        type: "http",
        enabled: true,
        server: "127.0.0.1",
        port: 8080,
      }
    case "custom":
      return {
        name,
        type: "custom",
        enabled: true,
        custom_yaml: "",
      }
    case "mihob-node":
      return {
        name,
        type: "mihob-node",
        enabled: true,
        node_ref: "",
        inbound_ref: "",
      }
  }
}

export function summarizeOutbound(o: NodeOutbound, unconfiguredLabel: string): string {
  if (o.type === "mihob-node") {
    return o.node_ref
      ? o.inbound_ref
        ? `${o.node_ref} / ${o.inbound_ref}`
        : o.node_ref
      : unconfiguredLabel
  }
  if (o.type === "custom") {
    return summarizeCustomOutboundYAML(o.custom_yaml) || unconfiguredLabel
  }
  const host = o.server || ""
  const port = o.port || (o.type === "masque" ? DEFAULT_MASQUE_PORT : 0)
  if (!host) return unconfiguredLabel
  return port ? `${host}:${port}` : host
}
