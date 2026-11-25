import i18n from "./i18n"
import type {
  Admin,
  BatchUpgradeResult,
  Certificate,
  DashboardData,
  DashboardRange,
  DashboardTrafficSeriesResponse,
  Inbound,
  InstallCommands,
  MihomoReleaseInfo,
  Node,
  NodeOutboundConfig,
  NotificationChannel,
  NotificationLog,
  NotificationRules,
  NotificationSchedule,
  PublicSubInfo,
  PublicThemeResponse,
  ScheduleRunResult,
  SystemSettings,
  Template,
  ThemeConfig,
  User,
  WARPRegisterResult,
} from "./types"

const TOKEN_KEY = "mihob_admin_token"

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setStoredToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_KEY)
  }
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
  options?: { public?: boolean }
): Promise<T> {
  const headers = new Headers(init?.headers)
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json")
  }
  if (!options?.public) {
    const token = getStoredToken()
    if (token) {
      headers.set("Authorization", `Bearer ${token}`)
    }
  }

  const res = await fetch(path, { ...init, headers })
  if (res.status === 401 && !options?.public) {
    setStoredToken(null)
    window.dispatchEvent(new Event("mihob:unauthorized"))
  }
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  if (!res.ok) {
    const msg =
      typeof data === "object" && data && "error" in data
        ? String((data as { error: unknown }).error)
        : i18n.t("common.requestFailed", { status: res.status })
    throw new ApiError(res.status, msg)
  }
  return data as T
}

export const queryKeys = {
  me: ["auth", "me"] as const,
  dashboard: ["dashboard"] as const,
  dashboardRange: (range: DashboardRange) => ["dashboard", range] as const,
  dashboardTrafficSeries: (range: DashboardRange, dimension: "node" | "user", idsKey: string) =>
    ["dashboard", "traffic-series", range, dimension, idsKey] as const,
  nodes: ["nodes"] as const,
  mihomoLatest: ["mihomo", "latest"] as const,
  nodeInstall: (id: number) => ["nodes", id, "install"] as const,
  allInbounds: ["inbounds", "all"] as const,
  inbounds: (nodeId: number) => ["nodes", nodeId, "inbounds"] as const,
  certificates: ["certificates"] as const,
  users: ["users"] as const,
  templates: ["templates"] as const,
  settings: ["settings"] as const,
  themes: ["themes"] as const,
  publicTheme: ["public", "theme"] as const,
  publicSub: (path: string) => ["public", "sub", path] as const,
  notificationChannels: ["notifications", "channels"] as const,
  notificationRules: ["notifications", "rules"] as const,
  notificationSchedules: ["notifications", "schedules"] as const,
  notificationLogs: ["notifications", "logs"] as const,
}

export const api = {
  login: (body: { username: string; password: string }) =>
    request<{ token: string; admin: Admin }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  me: () => request<Admin>("/api/auth/me"),
  changePassword: (body: { old_password: string; new_password: string }) =>
    request<{ status: string; token?: string }>("/api/auth/password", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  dashboard: (range: DashboardRange = "24h") =>
    request<DashboardData>(`/api/dashboard?range=${encodeURIComponent(range)}`),
  dashboardTrafficSeries: (range: DashboardRange, dimension: "node" | "user", ids: number[]) => {
    const params = new URLSearchParams({ range, dimension })
    if (ids.length > 0) {
      params.set("ids", ids.join(","))
    }
    return request<DashboardTrafficSeriesResponse>(
      `/api/dashboard/traffic-series?${params.toString()}`
    )
  },

  // Nodes
  listNodes: () => request<Node[]>("/api/nodes"),
  reorderNodes: (ids: number[]) =>
    request<{ status: string }>("/api/nodes/reorder", {
      method: "PUT",
      body: JSON.stringify({ ids }),
    }),
  createNode: (body: Record<string, unknown>) =>
    request<Node>("/api/nodes", { method: "POST", body: JSON.stringify(body) }),
  updateNode: (id: number, body: Record<string, unknown>) =>
    request<Node>(`/api/nodes/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteNode: (id: number) => request<{ status: string }>(`/api/nodes/${id}`, { method: "DELETE" }),
  resetNodeTraffic: (id: number) =>
    request<{ status: string }>(`/api/nodes/${id}/reset-traffic`, { method: "POST" }),
  regenerateNodeToken: (id: number) =>
    request<{ token: string }>(`/api/nodes/${id}/regenerate-token`, { method: "POST" }),
  pushNodeConfig: (id: number) =>
    request<{ status: string }>(`/api/nodes/${id}/push-config`, { method: "POST" }),
  restartNode: (id: number) =>
    request<{ status: string }>(`/api/nodes/${id}/restart`, { method: "POST" }),
  getLatestMihomo: (refresh = false) =>
    request<MihomoReleaseInfo>(`/api/mihomo/latest${refresh ? "?refresh=1" : ""}`),
  upgradeNodeMihomo: (id: number, version?: string) =>
    request<{ status: string; version: string; sha256: string }>(
      `/api/nodes/${id}/upgrade-mihomo`,
      {
        method: "POST",
        body: JSON.stringify(version ? { version } : {}),
      }
    ),
  batchUpgradeMihomo: (nodeIds: number[], version?: string) =>
    request<BatchUpgradeResult>("/api/nodes/upgrade-mihomo", {
      method: "POST",
      body: JSON.stringify({ node_ids: nodeIds, ...(version ? { version } : {}) }),
    }),
  getNodeInstall: (id: number) => request<InstallCommands>(`/api/nodes/${id}/install`),

  // Inbounds
  listAllInbounds: () => request<Inbound[]>("/api/inbounds"),
  listInbounds: (nodeId: number) => request<Inbound[]>(`/api/nodes/${nodeId}/inbounds`),
  reorderInbounds: (nodeId: number, ids: number[]) =>
    request<{ status: string }>(`/api/nodes/${nodeId}/inbounds/reorder`, {
      method: "PUT",
      body: JSON.stringify({ ids }),
    }),
  createInbound: (nodeId: number, body: Record<string, unknown>) =>
    request<Inbound>(`/api/nodes/${nodeId}/inbounds`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  previewInbound: (nodeId: number, body: Record<string, unknown>) =>
    request<{ server_yaml: string; client_yaml: string }>(`/api/nodes/${nodeId}/inbounds/preview`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateInbound: (id: number, body: Record<string, unknown>) =>
    request<Inbound>(`/api/inbounds/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteInbound: (id: number) =>
    request<{ status: string }>(`/api/inbounds/${id}`, { method: "DELETE" }),
  keygen: (
    type:
      | "reality"
      | "wireguard"
      | "masque"
      | "ss2022_128"
      | "ss2022_256"
      | "short_id"
      | "password"
      | "snell_psk"
      | "sudoku_key"
  ) =>
    request<Record<string, string>>("/api/tools/keygen", {
      method: "POST",
      body: JSON.stringify({ type }),
    }),
  registerWARP: (body: { protocol: "wireguard" | "masque"; license?: string }) =>
    request<WARPRegisterResult>("/api/tools/warp-register", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // Certificates
  listCertificates: () => request<Certificate[]>("/api/certificates"),
  reorderCertificates: (ids: number[]) =>
    request<{ status: string }>("/api/certificates/reorder", {
      method: "PUT",
      body: JSON.stringify({ ids }),
    }),
  createCertificate: (body: Record<string, unknown>) =>
    request<Certificate>("/api/certificates", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  renewCertificate: (id: number) =>
    request<Certificate>(`/api/certificates/${id}/renew`, { method: "POST" }),
  deleteCertificate: (id: number) =>
    request<{ status: string }>(`/api/certificates/${id}`, { method: "DELETE" }),

  // Users
  listUsers: () => request<User[]>("/api/users"),
  reorderUsers: (ids: number[]) =>
    request<{ status: string }>("/api/users/reorder", {
      method: "PUT",
      body: JSON.stringify({ ids }),
    }),
  createUser: (body: Record<string, unknown>) =>
    request<User>("/api/users", { method: "POST", body: JSON.stringify(body) }),
  updateUser: (id: number, body: Record<string, unknown>) =>
    request<User>(`/api/users/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteUser: (id: number) => request<{ status: string }>(`/api/users/${id}`, { method: "DELETE" }),
  resetUserTraffic: (id: number) =>
    request<{ status: string }>(`/api/users/${id}/reset-traffic`, { method: "POST" }),
  rotateUserToken: (id: number) =>
    request<{ sub_token: string }>(`/api/users/${id}/rotate-token`, { method: "POST" }),

  // Templates
  listTemplates: () => request<Template[]>("/api/templates"),
  createTemplate: (body: Record<string, unknown>) =>
    request<Template>("/api/templates", { method: "POST", body: JSON.stringify(body) }),
  updateTemplate: (id: number, body: Record<string, unknown>) =>
    request<Template>(`/api/templates/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteTemplate: (id: number) =>
    request<{ status: string }>(`/api/templates/${id}`, { method: "DELETE" }),
  previewTemplate: (body: { user_id: number; template_id?: number | null; content?: string }) =>
    request<{ yaml: string }>("/api/templates/preview", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  previewServerConfig: (body: {
    node_id?: number | null
    template_id?: number | null
    content?: string
    use_draft_template?: boolean
    server_log_level?: string
    server_ipv6?: boolean | null
    clear_server_ipv6?: boolean
    outbound_config?: NodeOutboundConfig
    extra_server_yaml?: string
  }) =>
    request<{ yaml: string }>("/api/templates/preview-server", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // Settings
  getSettings: () => request<SystemSettings>("/api/settings"),
  updateSettings: (body: SystemSettings) =>
    request<SystemSettings>("/api/settings", { method: "PUT", body: JSON.stringify(body) }),
  downloadDatabaseBackup: async (): Promise<{ blob: Blob; filename: string }> => {
    const headers = new Headers()
    const token = getStoredToken()
    if (token) {
      headers.set("Authorization", `Bearer ${token}`)
    }
    const res = await fetch("/api/settings/backup", { headers })
    if (res.status === 401) {
      setStoredToken(null)
      window.dispatchEvent(new Event("mihob:unauthorized"))
    }
    if (!res.ok) {
      let msg = i18n.t("common.requestFailed", { status: res.status })
      try {
        const errBody = (await res.json()) as { error?: string }
        if (errBody?.error) msg = errBody.error
      } catch {
        // ignore non-json error body
      }
      throw new ApiError(res.status, msg)
    }
    const disp = res.headers.get("Content-Disposition") || ""
    const match = disp.match(/filename="?([^"]+)"?/i)
    const filename = match?.[1] || `mihob-backup-${new Date().toISOString().slice(0, 10)}.db`
    const blob = await res.blob()
    return { blob, filename }
  },

  // Themes
  getPublicTheme: () =>
    request<PublicThemeResponse>("/api/public/theme", undefined, { public: true }),
  getThemes: () => request<ThemeConfig>("/api/themes"),
  updateThemes: (body: ThemeConfig) =>
    request<ThemeConfig>("/api/themes", { method: "PUT", body: JSON.stringify(body) }),
  fetchThemeUrl: (url: string) =>
    request<{ url: string; content_type: string; content: string }>("/api/themes/fetch", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),

  // Public Subscription Info
  getPublicSub: (path: string) =>
    request<PublicSubInfo>(`/api/public/sub?path=${encodeURIComponent(path)}`, undefined, {
      public: true,
    }),

  // Notifications
  listNotificationChannels: () => request<NotificationChannel[]>("/api/notifications/channels"),
  createNotificationChannel: (body: Record<string, unknown>) =>
    request<NotificationChannel>("/api/notifications/channels", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateNotificationChannel: (id: number, body: Record<string, unknown>) =>
    request<NotificationChannel>(`/api/notifications/channels/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteNotificationChannel: (id: number) =>
    request<{ status: string }>(`/api/notifications/channels/${id}`, { method: "DELETE" }),
  testNotificationChannel: (id: number) =>
    request<{ status: string }>(`/api/notifications/channels/${id}/test`, { method: "POST" }),
  testNotificationUrl: (url: string) =>
    request<{ status: string }>("/api/notifications/test-url", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),
  getNotificationRules: () => request<NotificationRules>("/api/notifications/rules"),
  updateNotificationRules: (body: NotificationRules) =>
    request<NotificationRules>("/api/notifications/rules", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  listNotificationSchedules: () => request<NotificationSchedule[]>("/api/notifications/schedules"),
  createNotificationSchedule: (body: Record<string, unknown>) =>
    request<NotificationSchedule>("/api/notifications/schedules", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateNotificationSchedule: (id: number, body: Record<string, unknown>) =>
    request<NotificationSchedule>(`/api/notifications/schedules/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteNotificationSchedule: (id: number) =>
    request<{ status: string }>(`/api/notifications/schedules/${id}`, { method: "DELETE" }),
  runNotificationSchedule: (id: number) =>
    request<ScheduleRunResult>(`/api/notifications/schedules/${id}/run`, { method: "POST" }),
  listNotificationLogs: () => request<NotificationLog[]>("/api/notifications/logs"),
  clearNotificationLogs: () =>
    request<{ status: string }>("/api/notifications/logs", { method: "DELETE" }),
}
