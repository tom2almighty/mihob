import type { NotificationEventType, NotificationProvider } from "@/lib/types"

export const CHANNEL_PROVIDERS: {
  id: NotificationProvider
  labelKey:
    | "notifications.providers.telegram"
    | "notifications.providers.bark"
    | "notifications.providers.discord"
    | "notifications.providers.generic"
    | "notifications.providers.smtp"
    | "notifications.providers.custom"
}[] = [
  { id: "telegram", labelKey: "notifications.providers.telegram" },
  { id: "bark", labelKey: "notifications.providers.bark" },
  { id: "discord", labelKey: "notifications.providers.discord" },
  { id: "generic", labelKey: "notifications.providers.generic" },
  { id: "smtp", labelKey: "notifications.providers.smtp" },
  { id: "custom", labelKey: "notifications.providers.custom" },
]

export const ALERT_EVENT_TYPES: NotificationEventType[] = [
  "node_offline",
  "node_online",
  "node_config_error",
  "node_upgrade",
  "node_traffic",
  "node_expiring",
  "hub_started",
  "cert_renew",
  "cert_expiring",
  "user_exhausted",
  "admin_login_failed",
]

export const TIMEZONE_OPTIONS = [
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Asia/Singapore",
  "UTC",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
] as const

export const TRAFFIC_THRESHOLD_PRESETS = [70, 80, 90, 95, 100] as const

export interface TelegramWizard {
  token: string
  chats: string
  parseMode: string
}

export interface BarkWizard {
  key: string
  host: string
  group: string
  sound: string
}

export interface DiscordWizard {
  webhookUrl: string
  webhookId: string
  token: string
}

export interface GenericWizard {
  url: string
  template: "json" | "empty"
  method: "POST" | "PUT"
  titleKey: string
  messageKey: string
}

export interface SmtpWizard {
  host: string
  port: string
  username: string
  password: string
  from: string
  to: string
  encryption: "Auto" | "ExplicitTLS" | "ImplicitTLS" | "None"
}

export function parseDiscordWebhookUrl(raw: string): { id: string; token: string } | null {
  const m = raw.trim().match(/discord(?:app)?\.com\/api\/webhooks\/([^/]+)\/([^/?#]+)/i)
  if (!m) return null
  return { id: m[1], token: m[2] }
}

export function buildTelegramUrl(w: TelegramWizard): string {
  const token = w.token.trim()
  const chats = w.chats
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(",")
  if (!token || !chats) return ""
  const params = new URLSearchParams()
  params.set("chats", chats)
  if (w.parseMode && w.parseMode !== "None") {
    params.set("parsemode", w.parseMode)
  }
  return `telegram://${token}@telegram?${params.toString()}`
}

export function buildBarkUrl(w: BarkWizard): string {
  const key = w.key.trim()
  const host = (w.host.trim() || "api.day.app").replace(/^https?:\/\//i, "").replace(/\/+$/, "")
  if (!key || !host) return ""
  const params = new URLSearchParams()
  if (w.group.trim()) params.set("group", w.group.trim())
  if (w.sound.trim()) params.set("sound", w.sound.trim())
  const qs = params.toString()
  return `bark://:${encodeURIComponent(key)}@${host}${qs ? `?${qs}` : ""}`
}

export function buildDiscordUrl(w: DiscordWizard): string {
  let id = w.webhookId.trim()
  let token = w.token.trim()
  if (w.webhookUrl.trim()) {
    const parsed = parseDiscordWebhookUrl(w.webhookUrl)
    if (parsed) {
      id = parsed.id
      token = parsed.token
    }
  }
  if (!id || !token) return ""
  return `discord://${token}@${id}`
}

export function buildGenericUrl(w: GenericWizard): string {
  const raw = w.url.trim()
  if (!raw) return ""
  const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    const u = new URL(normalized)
    if (w.template === "json") u.searchParams.set("template", "json")
    if (w.method && w.method !== "POST") u.searchParams.set("method", w.method)
    if (w.titleKey.trim()) u.searchParams.set("titlekey", w.titleKey.trim())
    if (w.messageKey.trim()) u.searchParams.set("messagekey", w.messageKey.trim())
    return `generic+${u.toString()}`
  } catch {
    return ""
  }
}

export function buildSmtpUrl(w: SmtpWizard): string {
  const host = w.host.trim()
  const port = w.port.trim() || "587"
  const from = w.from.trim()
  const to = w.to
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(",")
  if (!host || !from || !to) return ""

  let auth = ""
  if (w.username.trim()) {
    auth = encodeURIComponent(w.username.trim())
    if (w.password) {
      auth += `:${encodeURIComponent(w.password)}`
    }
    auth += "@"
  }
  const params = new URLSearchParams()
  params.set("from", from)
  params.set("to", to)
  if (w.encryption && w.encryption !== "Auto") {
    params.set("encryption", w.encryption)
  }
  return `smtp://${auth}${host}:${port}/?${params.toString()}`
}
