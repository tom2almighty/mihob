import type { ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Activity, ArrowDownUp, Server, ShieldAlert, Users } from "lucide-react"
import { Link } from "react-router-dom"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts"
import { EmptyState, ErrorState, PageHeader, TrafficProgress } from "@/components/common/CommonUI"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { api, queryKeys } from "@/lib/api"
import { formatBytes, formatRate } from "@/lib/format"
import { cn } from "@/lib/utils"

// Compact card overrides so the full dashboard fits in a single desktop viewport without scrolling.
const COMPACT_CARD = "gap-3 py-4"
const COMPACT_HEADER = "px-4 pb-0"
const COMPACT_CONTENT = "px-4"

export function DashboardPage() {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: api.dashboard,
    refetchInterval: 10_000,
  })

  if (query.isError) {
    return (
      <div className="space-y-4">
        <PageHeader title={t("dashboard.title")} description={t("dashboard.description")} />
        <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
      </div>
    )
  }

  const data = query.data
  const s = data?.summary

  const chartData = (data?.traffic_hourly ?? []).map((pt) => ({
    label: pt.bucket.slice(11, 16),
    upload: pt.upload,
    download: pt.download,
  }))

  return (
    <div className="space-y-3.5">
      <PageHeader
        title={t("dashboard.title")}
        description={t("dashboard.description")}
        actions={
          <Button asChild size="sm">
            <Link to="/nodes">{t("dashboard.manageNodes")}</Link>
          </Button>
        }
      />

      {/* KPI Grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          loading={query.isLoading}
          title={t("dashboard.onlineNodes")}
          icon={<Server className="size-4 text-muted-foreground" />}
          value={s ? `${s.online_nodes} / ${s.total_nodes}` : "-"}
          sub={s ? t("dashboard.activeConnections", { count: s.active_connections }) : ""}
        />
        <KpiCard
          loading={query.isLoading}
          title={t("dashboard.realtimeRate")}
          icon={<ArrowDownUp className="size-4 text-muted-foreground" />}
          value={s ? formatRate(s.up_rate + s.down_rate) : "-"}
          sub={
            s
              ? t("dashboard.uploadDownloadRate", {
                  up: formatRate(s.up_rate),
                  down: formatRate(s.down_rate),
                })
              : ""
          }
        />
        <KpiCard
          loading={query.isLoading}
          title={t("dashboard.activeUsers")}
          icon={<Users className="size-4 text-muted-foreground" />}
          value={s ? `${s.active_users} / ${s.total_users}` : "-"}
          sub={
            s
              ? s.expiring_soon_users > 0
                ? t("dashboard.expiringUsers", { count: s.expiring_soon_users })
                : t("dashboard.noExpiringUsers")
              : ""
          }
        />
        <KpiCard
          loading={query.isLoading}
          title={t("dashboard.totalNodeTraffic")}
          icon={<ShieldAlert className="size-4 text-muted-foreground" />}
          value={s ? formatBytes(s.total_traffic) : "-"}
          sub={
            s
              ? s.expiring_certs > 0
                ? t("dashboard.expiringCerts", { count: s.expiring_certs })
                : t("dashboard.certsHealthy", { count: s.total_certs })
              : ""
          }
        />
      </div>

      {/* 24h Traffic Chart */}
      <Card className={COMPACT_CARD}>
        <CardHeader className={COMPACT_HEADER}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
              <CardTitle className="text-sm font-semibold">{t("dashboard.chartTitle")}</CardTitle>
              <CardDescription className="text-xs">{t("dashboard.chartDescription")}</CardDescription>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-chart-1" />
                {t("dashboard.download")}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-chart-2" />
                {t("dashboard.upload")}
              </span>
              <Activity className="size-3.5 text-muted-foreground" />
            </div>
          </div>
        </CardHeader>
        <CardContent className={COMPACT_CONTENT}>
          {query.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 6, right: 6, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fillDown" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="fillUp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => formatBytes(Number(v))}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    width={64}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius)",
                      color: "var(--popover-foreground)",
                      fontSize: "12px",
                    }}
                    formatter={(val, name) => [
                      formatBytes(Number(val)),
                      name === "download" ? t("dashboard.download") : t("dashboard.upload"),
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="download"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    fill="url(#fillDown)"
                  />
                  <Area
                    type="monotone"
                    dataKey="upload"
                    stroke="var(--chart-2)"
                    strokeWidth={2}
                    fill="url(#fillUp)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bottom Split: Node Health + Top Users (internal scroll if many items) */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className={COMPACT_CARD}>
          <CardHeader className={cn(COMPACT_HEADER, "flex flex-row items-center justify-between")}>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <CardTitle className="text-sm font-semibold">
                {t("dashboard.nodeStatusTitle")}
              </CardTitle>
              <CardDescription className="text-xs">{t("dashboard.nodeStatusDesc")}</CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" asChild>
              <Link to="/nodes">{t("dashboard.viewAll")}</Link>
            </Button>
          </CardHeader>
          <CardContent className={cn(COMPACT_CONTENT, "max-h-56 space-y-2 overflow-y-auto")}>
            {query.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-full" />
              </div>
            ) : !data?.nodes.length ? (
              <EmptyState
                className="py-7"
                icon={<Server className="size-4" />}
                title={t("dashboard.noNodesTitle")}
                description={t("dashboard.noNodesDesc")}
              />
            ) : (
              data.nodes.map((n) => (
                <div
                  key={n.id}
                  className="flex flex-col gap-1.5 rounded-md border border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          n.online ? "bg-success" : "bg-muted-foreground/40"
                        )}
                      />
                      <span className="truncate text-sm font-medium">{n.name}</span>
                      {n.region && (
                        <Badge variant="secondary" className="px-1.5 py-0 text-[11px] font-normal">
                          {n.region}
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground tabular-nums">
                      {t("dashboard.nodeMeta", {
                        host: n.host,
                        inbounds: n.inbound_count,
                        connections: n.active_connections,
                      })}
                    </p>
                  </div>
                  <div className="w-full shrink-0 sm:w-40">
                    <TrafficProgress used={n.traffic_used} limit={n.traffic_limit} />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className={COMPACT_CARD}>
          <CardHeader className={cn(COMPACT_HEADER, "flex flex-row items-center justify-between")}>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <CardTitle className="text-sm font-semibold">{t("dashboard.topUsersTitle")}</CardTitle>
              <CardDescription className="text-xs">{t("dashboard.topUsersDesc")}</CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" asChild>
              <Link to="/users">{t("dashboard.viewAll")}</Link>
            </Button>
          </CardHeader>
          <CardContent className={cn(COMPACT_CONTENT, "max-h-56 space-y-2 overflow-y-auto")}>
            {query.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-full" />
              </div>
            ) : !data?.top_users.length ? (
              <EmptyState
                className="py-7"
                icon={<Users className="size-4" />}
                title={t("dashboard.noUsersTitle")}
                description={t("dashboard.noUsersDesc")}
              />
            ) : (
              data.top_users.map((u) => (
                <div key={u.id} className="space-y-1 rounded-md border border-border px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{u.username}</span>
                    <Badge
                      variant={u.enabled ? "secondary" : "destructive"}
                      className="px-1.5 py-0 text-[11px]"
                    >
                      {u.enabled
                        ? t("dashboard.nodeCount", { count: u.node_ids.length })
                        : t("common.disabled")}
                    </Badge>
                  </div>
                  <TrafficProgress used={u.traffic_used} limit={u.traffic_limit} />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function KpiCard({
  loading,
  title,
  icon,
  value,
  sub,
}: {
  loading: boolean
  title: string
  icon: ReactNode
  value: string
  sub: string
}) {
  return (
    <Card className="gap-1.5 py-3.5">
      <CardHeader className="flex flex-row items-center justify-between px-4 pb-0">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent className="px-4">
        {loading ? (
          <div className="space-y-1.5">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-3.5 w-28" />
          </div>
        ) : (
          <>
            <div className="text-xl font-semibold tracking-tight tabular-nums">{value}</div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground tabular-nums">{sub}</p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
