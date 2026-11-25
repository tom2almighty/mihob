import type { MASQUENetwork, NodeOutbound } from "@/lib/types"
import { DEFAULT_MASQUE_PORT, DEFAULT_MASQUE_SNI } from "./outboundDefaults"

function stripInlineComment(raw: string): string {
  const hashIdx = raw.indexOf("#")
  if (hashIdx === -1) return raw.trim()
  return raw.slice(0, hashIdx).trim()
}

function splitHostPort(raw: string): { host: string; port?: number } {
  const trimmed = raw.trim()
  if (!trimmed) return { host: "" }

  // Bracketed IPv6 with optional port: [2606:4700::1]:443 or [2606:4700::1]
  const bracketMatch = trimmed.match(/^\[([^\]]+)\](?::(\d+))?$/)
  if (bracketMatch) {
    const port = bracketMatch[2] ? Number.parseInt(bracketMatch[2], 10) : undefined
    return {
      host: bracketMatch[1].trim(),
      port: port && port > 0 && port <= 65535 ? port : undefined,
    }
  }

  // Bare IPv6 address (contains multiple colons without brackets) — do not split on last colon
  const firstColon = trimmed.indexOf(":")
  const lastColon = trimmed.lastIndexOf(":")
  if (firstColon !== -1 && firstColon !== lastColon) {
    return { host: trimmed }
  }

  if (lastColon > 0) {
    const portStr = trimmed.slice(lastColon + 1).trim()
    if (/^\d+$/.test(portStr)) {
      const p = Number.parseInt(portStr, 10)
      return {
        host: trimmed.slice(0, lastColon).trim(),
        port: p > 0 && p <= 65535 ? p : undefined,
      }
    }
  }

  return { host: trimmed }
}

export function parseWireGuardConf(raw: string): Partial<NodeOutbound> {
  const patch: Partial<NodeOutbound> = {}
  const lines = raw.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("[")) continue
    const eqIdx = trimmed.indexOf("=")
    if (eqIdx <= 0) continue
    const key = trimmed.slice(0, eqIdx).trim().toLowerCase()
    const val = stripInlineComment(trimmed.slice(eqIdx + 1))
    if (!val) continue

    switch (key) {
      case "privatekey":
        patch.private_key = val
        break
      case "publickey":
        patch.public_key = val
        break
      case "presharedkey":
        patch.pre_shared_key = val
        break
      case "mtu": {
        const n = Number.parseInt(val, 10)
        if (!Number.isNaN(n) && n > 0) patch.mtu = n
        break
      }
      case "reserved":
        patch.reserved = val
        break
      case "dns": {
        const dnsList = val
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
        if (dnsList.length > 0) patch.dns = dnsList
        break
      }
      case "address": {
        const addrs = val
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
        for (const addr of addrs) {
          if (addr.includes(":")) {
            patch.ipv6 = addr
          } else {
            patch.ip = addr
          }
        }
        break
      }
      case "endpoint": {
        const { host, port } = splitHostPort(val)
        if (host) patch.server = host
        if (port) patch.port = port
        break
      }
    }
  }
  return patch
}

function stripPEMHeaders(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed.includes("-----BEGIN")) return trimmed
  return trimmed
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "")
}

export function parseMASQUEConfig(raw: string): Partial<NodeOutbound> {
  const trimmed = raw.trim()
  if (!trimmed) return {}

  // 1. Try parsing usque config.json
  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>
      const patch: Partial<NodeOutbound> = {}
      if (typeof obj.private_key === "string" && obj.private_key.trim()) {
        patch.private_key = obj.private_key.trim()
      }
      if (typeof obj.endpoint_pub_key === "string" && obj.endpoint_pub_key.trim()) {
        patch.public_key = stripPEMHeaders(obj.endpoint_pub_key)
      } else if (typeof obj.public_key === "string" && obj.public_key.trim()) {
        patch.public_key = stripPEMHeaders(obj.public_key)
      }
      if (typeof obj.ipv4 === "string" && obj.ipv4.trim()) {
        const v4 = obj.ipv4.trim()
        patch.ip = v4.includes("/") ? v4 : `${v4}/32`
      } else if (typeof obj.ip === "string" && obj.ip.trim()) {
        const ip = obj.ip.trim()
        patch.ip = ip.includes("/") ? ip : `${ip}/32`
      }
      if (typeof obj.ipv6 === "string" && obj.ipv6.trim()) {
        const v6 = obj.ipv6.trim()
        patch.ipv6 = v6.includes("/") ? v6 : `${v6}/128`
      }
      const v4Ep = typeof obj.endpoint_v4 === "string" ? obj.endpoint_v4.trim() : ""
      const v6Ep = typeof obj.endpoint_v6 === "string" ? obj.endpoint_v6.trim() : ""
      const srv = typeof obj.server === "string" ? obj.server.trim() : ""
      if (v4Ep) {
        const parsed = splitHostPort(v4Ep)
        if (parsed.host) patch.server = parsed.host
        patch.port = parsed.port ?? DEFAULT_MASQUE_PORT
      } else if (v6Ep) {
        const parsed = splitHostPort(v6Ep)
        if (parsed.host) patch.server = parsed.host
        patch.port = parsed.port ?? DEFAULT_MASQUE_PORT
      } else if (srv) {
        const parsed = splitHostPort(srv)
        if (parsed.host) patch.server = parsed.host
        if (parsed.port) patch.port = parsed.port
      }
      if (typeof obj.port === "number" && obj.port > 0 && obj.port <= 65535) {
        patch.port = obj.port
      }
      if (typeof obj.mtu === "number" && obj.mtu > 0) {
        patch.mtu = obj.mtu
      }
      if (typeof obj.sni === "string" && obj.sni.trim()) {
        patch.sni = obj.sni.trim()
      } else if (patch.public_key && !patch.sni) {
        patch.sni = DEFAULT_MASQUE_SNI
      }
      return patch
    } catch {
      // fall through to line parser
    }
  }

  // 2. Simple line-based Mihomo YAML snippet fallback (key: value)
  const patch: Partial<NodeOutbound> = {}
  for (const line of trimmed.split(/\r?\n/)) {
    const clean = line.trim().replace(/^-\s+/, "")
    if (!clean || clean.startsWith("#")) continue
    const idx = clean.indexOf(":")
    if (idx <= 0) continue
    const key = clean.slice(0, idx).trim().toLowerCase()
    const val = stripInlineComment(clean.slice(idx + 1)).replace(/^["']|["']$/g, "")
    if (!val) continue

    switch (key) {
      case "server":
        patch.server = val
        break
      case "port": {
        const n = Number.parseInt(val, 10)
        if (!Number.isNaN(n) && n > 0 && n <= 65535) patch.port = n
        break
      }
      case "private-key":
      case "private_key":
        patch.private_key = val
        break
      case "public-key":
      case "public_key":
        patch.public_key = stripPEMHeaders(val)
        break
      case "ip":
        patch.ip = val
        break
      case "ipv6":
        patch.ipv6 = val
        break
      case "sni":
        patch.sni = val
        break
      case "mtu": {
        const n = Number.parseInt(val, 10)
        if (!Number.isNaN(n) && n > 0) patch.mtu = n
        break
      }
      case "network":
        if (val === "quic" || val === "h2" || val === "h3-l4proxy") {
          patch.network = val as MASQUENetwork
        }
        break
      case "skip-cert-verify":
      case "skip_cert_verify":
        if (val.toLowerCase() === "true") patch.skip_cert_verify = true
        else if (val.toLowerCase() === "false") patch.skip_cert_verify = false
        break
      case "congestion-controller":
      case "congestion_controller":
        if (val.toLowerCase() === "bbr") patch.congestion_controller = "bbr"
        break
    }
  }
  return patch
}
