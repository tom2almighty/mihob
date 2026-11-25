import type { MASQUENetwork, NodeOutbound } from "@/lib/types"

export function parseWireGuardConf(raw: string): Partial<NodeOutbound> {
  const patch: Partial<NodeOutbound> = {}
  const lines = raw.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("[")) continue
    const eqIdx = trimmed.indexOf("=")
    if (eqIdx <= 0) continue
    const key = trimmed.slice(0, eqIdx).trim().toLowerCase()
    const val = trimmed.slice(eqIdx + 1).trim()
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
        const bracketMatch = val.match(/^\[([^\]]+)\]:(\d+)$/)
        if (bracketMatch) {
          patch.server = bracketMatch[1]
          patch.port = Number.parseInt(bracketMatch[2], 10)
        } else {
          const lastColon = val.lastIndexOf(":")
          if (lastColon > 0) {
            patch.server = val.slice(0, lastColon).trim()
            const p = Number.parseInt(val.slice(lastColon + 1).trim(), 10)
            if (!Number.isNaN(p) && p > 0) patch.port = p
          }
        }
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
        patch.ip = obj.ipv4.includes("/") ? obj.ipv4.trim() : `${obj.ipv4.trim()}/32`
      } else if (typeof obj.ip === "string" && obj.ip.trim()) {
        patch.ip = obj.ip.trim()
      }
      if (typeof obj.ipv6 === "string" && obj.ipv6.trim()) {
        patch.ipv6 = obj.ipv6.includes("/") ? obj.ipv6.trim() : `${obj.ipv6.trim()}/128`
      }
      const v4Ep = typeof obj.endpoint_v4 === "string" ? obj.endpoint_v4.trim() : ""
      const v6Ep = typeof obj.endpoint_v6 === "string" ? obj.endpoint_v6.trim() : ""
      const srv = typeof obj.server === "string" ? obj.server.trim() : ""
      if (v4Ep) {
        patch.server = v4Ep
        patch.port = 443
      } else if (v6Ep) {
        patch.server = v6Ep.replace(/^\[|\]$/g, "")
        patch.port = 443
      } else if (srv) {
        patch.server = srv
      }
      if (typeof obj.sni === "string" && obj.sni.trim()) {
        patch.sni = obj.sni.trim()
      } else if (patch.public_key && !patch.sni) {
        patch.sni = "consumer-masque.cloudflareclient.com"
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
    const val = clean
      .slice(idx + 1)
      .trim()
      .replace(/^["']|["']$/g, "")
    if (!val) continue

    switch (key) {
      case "server":
        patch.server = val
        break
      case "port": {
        const n = Number.parseInt(val, 10)
        if (!Number.isNaN(n) && n > 0) patch.port = n
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
    }
  }
  return patch
}
