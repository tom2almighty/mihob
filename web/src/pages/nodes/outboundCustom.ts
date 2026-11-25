export interface CustomProxyTemplate {
  key: string
  label: string
  yaml: string
}

export const CUSTOM_PROXY_TEMPLATES: CustomProxyTemplate[] = [
  {
    key: "vless-reality",
    label: "VLESS (Reality)",
    yaml: `type: vless
server: example.com
port: 443
uuid: 00000000-0000-0000-0000-000000000000
network: tcp
tls: true
udp: true
flow: xtls-rprx-vision
servername: www.microsoft.com
client-fingerprint: chrome
reality-opts:
  public-key: ""
  short-id: ""`,
  },
  {
    key: "vless-ws",
    label: "VLESS (WS + TLS)",
    yaml: `type: vless
server: example.com
port: 443
uuid: 00000000-0000-0000-0000-000000000000
network: ws
tls: true
udp: true
servername: example.com
ws-opts:
  path: /ws
  headers:
    Host: example.com`,
  },
  {
    key: "vmess",
    label: "VMess",
    yaml: `type: vmess
server: example.com
port: 443
uuid: 00000000-0000-0000-0000-000000000000
alterId: 0
cipher: auto
udp: true
tls: true
servername: example.com`,
  },
  {
    key: "trojan",
    label: "Trojan",
    yaml: `type: trojan
server: example.com
port: 443
password: ""
sni: example.com
udp: true`,
  },
  {
    key: "ss",
    label: "Shadowsocks",
    yaml: `type: ss
server: example.com
port: 8388
cipher: 2022-blake3-aes-128-gcm
password: ""
udp: true`,
  },
  {
    key: "hysteria2",
    label: "Hysteria2",
    yaml: `type: hysteria2
server: example.com
port: 443
password: ""
sni: example.com`,
  },
  {
    key: "tuic",
    label: "TUIC v5",
    yaml: `type: tuic
server: example.com
port: 443
uuid: 00000000-0000-0000-0000-000000000000
password: ""
sni: example.com
alpn:
  - h3
udp-relay-mode: native
congestion-controller: bbr`,
  },
  {
    key: "anytls",
    label: "AnyTLS",
    yaml: `type: anytls
server: example.com
port: 443
password: ""
sni: example.com
client-fingerprint: chrome
udp: true`,
  },
  {
    key: "ssh",
    label: "SSH",
    yaml: `type: ssh
server: example.com
port: 22
username: root
password: ""`,
  },
  {
    key: "tailscale",
    label: "Tailscale",
    yaml: `type: tailscale
auth-key: tskey-auth-xxx
hostname: mihomo-node
ephemeral: true`,
  },
  {
    key: "direct",
    label: "Direct",
    yaml: `type: direct
udp: true`,
  },
]

function yamlScalar(v: unknown): string {
  if (typeof v === "boolean" || typeof v === "number") return String(v)
  const s = String(v ?? "")
  if (
    s === "" ||
    /^[-?:,[\]{}#&*!|>'"%@`]/.test(s) ||
    /[:#]\s/.test(s) ||
    /^\s|\s$/.test(s) ||
    /^(true|false|null|yes|no|on|off|~|\d+(\.\d+)?)$/i.test(s)
  ) {
    return JSON.stringify(s)
  }
  return s
}

function serializeYamlMap(obj: Record<string, unknown>, indent = 0): string {
  const pad = " ".repeat(indent)
  const lines: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue
    if (Array.isArray(v)) {
      if (v.length === 0) continue
      lines.push(`${pad}${k}:`)
      for (const item of v) {
        lines.push(`${pad}  - ${yamlScalar(item)}`)
      }
    } else if (typeof v === "object") {
      const nested = serializeYamlMap(v as Record<string, unknown>, indent + 2)
      if (nested) {
        lines.push(`${pad}${k}:`)
        lines.push(nested)
      }
    } else {
      lines.push(`${pad}${k}: ${yamlScalar(v)}`)
    }
  }
  return lines.join("\n")
}

function decodeBase64Flexible(input: string): string {
  const normalized = input.trim().replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4)
  const bin = atob(padded)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function parsePort(raw: string, fallback: number): number {
  const p = Number.parseInt(raw, 10)
  return !Number.isNaN(p) && p > 0 && p <= 65535 ? p : fallback
}

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v)
  } catch {
    return v
  }
}

function attachStreamTransport(proxy: Record<string, unknown>, params: URLSearchParams) {
  const net = (params.get("type") || params.get("net") || "").toLowerCase()
  if (net === "ws" || net === "websocket") {
    proxy.network = "ws"
    const wsOpts: Record<string, unknown> = {}
    const path = params.get("path")
    if (path) wsOpts.path = path
    const host = params.get("host")
    if (host) wsOpts.headers = { Host: host }
    if (Object.keys(wsOpts).length > 0) proxy["ws-opts"] = wsOpts
  } else if (net === "grpc") {
    proxy.network = "grpc"
    const svc = params.get("serviceName") || params.get("path")
    if (svc) proxy["grpc-opts"] = { "grpc-service-name": svc }
  } else if (net === "h2" || net === "http") {
    proxy.network = "h2"
    const h2Opts: Record<string, unknown> = {}
    const host = params.get("host")
    if (host)
      h2Opts.host = host
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    const path = params.get("path")
    if (path) h2Opts.path = path
    if (Object.keys(h2Opts).length > 0) proxy["h2-opts"] = h2Opts
  } else if (net === "xhttp") {
    proxy.network = "xhttp"
    const xOpts: Record<string, unknown> = {}
    if (params.get("path")) xOpts.path = params.get("path")
    if (params.get("host")) xOpts.host = params.get("host")
    if (params.get("mode")) xOpts.mode = params.get("mode")
    if (Object.keys(xOpts).length > 0) proxy["xhttp-opts"] = xOpts
  }
}

export interface ParsedShareLink {
  name?: string
  yaml: string
}

/**
 * Converts common proxy share URIs (vless://, vmess://, trojan://, ss://,
 * hysteria2://, hy2://, tuic://, anytls://, socks5://, http://, https://)
 * into a Mihomo proxy YAML snippet.
 */
export function parseProxyShareLink(raw: string): ParsedShareLink | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  // VMess JSON base64 link
  if (trimmed.toLowerCase().startsWith("vmess://")) {
    try {
      const jsonStr = decodeBase64Flexible(trimmed.slice("vmess://".length))
      const obj = JSON.parse(jsonStr) as Record<string, unknown>
      const server = String(obj.add ?? "").trim()
      const uuid = String(obj.id ?? "").trim()
      if (!server || !uuid) return null
      const port = parsePort(String(obj.port ?? "443"), 443)
      const proxy: Record<string, unknown> = {
        type: "vmess",
        server,
        port,
        uuid,
        alterId: Number.parseInt(String(obj.aid ?? "0"), 10) || 0,
        cipher: String(obj.scy || "auto"),
        udp: true,
      }
      if (String(obj.tls || "").toLowerCase() === "tls") {
        proxy.tls = true
        const sni = String(obj.sni || obj.host || "").trim()
        if (sni) proxy.servername = sni
      }
      const net = String(obj.net || "").toLowerCase()
      if (net === "ws") {
        proxy.network = "ws"
        const wsOpts: Record<string, unknown> = {}
        if (obj.path) wsOpts.path = String(obj.path)
        if (obj.host) wsOpts.headers = { Host: String(obj.host) }
        if (Object.keys(wsOpts).length > 0) proxy["ws-opts"] = wsOpts
      } else if (net === "grpc") {
        proxy.network = "grpc"
        if (obj.path) proxy["grpc-opts"] = { "grpc-service-name": String(obj.path) }
      }
      const fp = String(obj.fp || "").trim()
      if (fp) proxy["client-fingerprint"] = fp
      const alpn = String(obj.alpn || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
      if (alpn.length > 0) proxy.alpn = alpn
      const name = String(obj.ps ?? "").trim() || undefined
      return { name, yaml: serializeYamlMap(proxy) }
    } catch {
      return null
    }
  }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }

  const scheme = url.protocol.replace(/:$/, "").toLowerCase()
  const host = url.hostname.replace(/^\[|\]$/g, "")
  const name = url.hash ? safeDecode(url.hash.slice(1)).trim() || undefined : undefined
  const params = url.searchParams

  if (scheme === "vless") {
    if (!host || !url.username) return null
    const proxy: Record<string, unknown> = {
      type: "vless",
      server: host,
      port: parsePort(url.port, 443),
      uuid: safeDecode(url.username),
      udp: true,
    }
    const flow = params.get("flow")
    if (flow) proxy.flow = flow
    const sec = (params.get("security") || "").toLowerCase()
    if (sec === "tls" || sec === "reality") {
      proxy.tls = true
      const sni = params.get("sni") || params.get("servername")
      if (sni) proxy.servername = sni
      const fp = params.get("fp")
      if (fp) proxy["client-fingerprint"] = fp
      const alpn = params.get("alpn")
      if (alpn)
        proxy.alpn = alpn
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      if (params.get("allowInsecure") === "1" || params.get("insecure") === "1") {
        proxy["skip-cert-verify"] = true
      }
      if (sec === "reality") {
        const reality: Record<string, unknown> = {}
        if (params.get("pbk")) reality["public-key"] = params.get("pbk")
        if (params.get("sid")) reality["short-id"] = params.get("sid")
        if (Object.keys(reality).length > 0) proxy["reality-opts"] = reality
      }
    }
    attachStreamTransport(proxy, params)
    return { name, yaml: serializeYamlMap(proxy) }
  }

  if (scheme === "trojan") {
    if (!host || !url.username) return null
    const proxy: Record<string, unknown> = {
      type: "trojan",
      server: host,
      port: parsePort(url.port, 443),
      password: safeDecode(url.username),
      udp: true,
    }
    const sni = params.get("sni") || params.get("peer")
    if (sni) proxy.sni = sni
    const fp = params.get("fp")
    if (fp) proxy["client-fingerprint"] = fp
    const alpn = params.get("alpn")
    if (alpn)
      proxy.alpn = alpn
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    if (params.get("allowInsecure") === "1" || params.get("insecure") === "1") {
      proxy["skip-cert-verify"] = true
    }
    attachStreamTransport(proxy, params)
    return { name, yaml: serializeYamlMap(proxy) }
  }

  if (scheme === "ss") {
    let cipher = ""
    let password = ""
    let server = host
    let port = parsePort(url.port, 8388)
    if (url.password) {
      cipher = safeDecode(url.username)
      password = safeDecode(url.password)
    } else if (url.username) {
      try {
        const decoded = decodeBase64Flexible(safeDecode(url.username))
        const colonIdx = decoded.indexOf(":")
        if (colonIdx > 0) {
          cipher = decoded.slice(0, colonIdx)
          password = decoded.slice(colonIdx + 1)
        }
      } catch {
        return null
      }
    } else {
      // Legacy ss://base64(method:password@host:port)#name
      try {
        const body = trimmed.slice("ss://".length).split("#")[0].split("?")[0]
        const decoded = decodeBase64Flexible(body)
        const atIdx = decoded.lastIndexOf("@")
        if (atIdx <= 0) return null
        const userInfo = decoded.slice(0, atIdx)
        const hostPort = decoded.slice(atIdx + 1)
        const colonIdx = userInfo.indexOf(":")
        if (colonIdx <= 0) return null
        cipher = userInfo.slice(0, colonIdx)
        password = userInfo.slice(colonIdx + 1)
        const hp = new URL(`http://${hostPort}`)
        server = hp.hostname.replace(/^\[|\]$/g, "")
        port = parsePort(hp.port, 8388)
      } catch {
        return null
      }
    }
    if (!server || !cipher || !password) return null
    const proxy: Record<string, unknown> = {
      type: "ss",
      server,
      port,
      cipher,
      password,
      udp: true,
    }
    return { name, yaml: serializeYamlMap(proxy) }
  }

  if (scheme === "hysteria2" || scheme === "hy2") {
    if (!host) return null
    const password = url.password
      ? `${safeDecode(url.username)}:${safeDecode(url.password)}`
      : safeDecode(url.username)
    if (!password) return null
    const proxy: Record<string, unknown> = {
      type: "hysteria2",
      server: host,
      port: parsePort(url.port, 443),
      password,
    }
    const sni = params.get("sni")
    if (sni) proxy.sni = sni
    const obfs = params.get("obfs")
    if (obfs && obfs !== "none") {
      proxy.obfs = obfs
      const obfsPwd = params.get("obfs-password")
      if (obfsPwd) proxy["obfs-password"] = obfsPwd
    }
    if (params.get("insecure") === "1" || params.get("allowInsecure") === "1") {
      proxy["skip-cert-verify"] = true
    }
    const mport = params.get("mport")
    if (mport) proxy.ports = mport
    return { name, yaml: serializeYamlMap(proxy) }
  }

  if (scheme === "tuic") {
    if (!host || !url.username) return null
    const proxy: Record<string, unknown> = {
      type: "tuic",
      server: host,
      port: parsePort(url.port, 443),
      uuid: safeDecode(url.username),
      password: safeDecode(url.password),
    }
    const sni = params.get("sni")
    if (sni) proxy.sni = sni
    const alpn = params.get("alpn")
    if (alpn)
      proxy.alpn = alpn
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    const cc = params.get("congestion_control") || params.get("congestion-controller")
    if (cc) proxy["congestion-controller"] = cc
    const udpMode = params.get("udp_relay_mode") || params.get("udp-relay-mode")
    if (udpMode) proxy["udp-relay-mode"] = udpMode
    if (params.get("allow_insecure") === "1" || params.get("insecure") === "1") {
      proxy["skip-cert-verify"] = true
    }
    return { name, yaml: serializeYamlMap(proxy) }
  }

  if (scheme === "anytls") {
    if (!host || !url.username) return null
    const proxy: Record<string, unknown> = {
      type: "anytls",
      server: host,
      port: parsePort(url.port, 443),
      password: safeDecode(url.username),
      udp: true,
    }
    const sni = params.get("sni")
    if (sni) proxy.sni = sni
    const fp = params.get("fp")
    if (fp) proxy["client-fingerprint"] = fp
    if (params.get("insecure") === "1" || params.get("allowInsecure") === "1") {
      proxy["skip-cert-verify"] = true
    }
    return { name, yaml: serializeYamlMap(proxy) }
  }

  if (scheme === "socks5" || scheme === "socks" || scheme === "http" || scheme === "https") {
    if (!host) return null
    const isSocks = scheme === "socks5" || scheme === "socks"
    const proxy: Record<string, unknown> = {
      type: isSocks ? "socks5" : "http",
      server: host,
      port: parsePort(url.port, isSocks ? 1080 : scheme === "https" ? 443 : 8080),
    }
    if (url.username) proxy.username = safeDecode(url.username)
    if (url.password) proxy.password = safeDecode(url.password)
    if (scheme === "https") proxy.tls = true
    if (isSocks) proxy.udp = true
    return { name, yaml: serializeYamlMap(proxy) }
  }

  return null
}

/**
 * Extracts a short summary (`type · server:port`) from a custom proxy YAML snippet.
 */
export function summarizeCustomOutboundYAML(raw?: string): string {
  if (!raw?.trim()) return ""
  let type = ""
  let server = ""
  let port = ""
  for (const line of raw.split(/\r?\n/)) {
    const clean = line.trim().replace(/^-\s+/, "")
    if (!clean || clean.startsWith("#")) continue
    const idx = clean.indexOf(":")
    if (idx <= 0) continue
    const key = clean.slice(0, idx).trim().toLowerCase()
    const val = clean
      .slice(idx + 1)
      .split("#")[0]
      .trim()
      .replace(/^["']|["']$/g, "")
    if (!val) continue
    if (key === "type" && !type) type = val
    else if (key === "server" && !server) server = val
    else if (key === "port" && !port) port = val
  }
  const ep = server ? (port ? `${server}:${port}` : server) : ""
  if (type && ep) return `${type} · ${ep}`
  return type || ep
}
