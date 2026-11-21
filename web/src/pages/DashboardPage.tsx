import { useMemo, useState, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import {
  Activity,
  ArrowDownUp,
  BarChart3,
  CalendarClock,
  Cpu,
  PieChart as PieChartIcon,
  Server,
  ShieldAlert,
  Users,
} from "lucide-react"
import { Link } from "react-router-dom"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api, queryKeys } from "@/lib/api"
import { daysUntil, formatBytes, formatRate } from "@/lib/format"
import { PROTOCOL_LABELS, type DashboardRange, type Protocol } from "@/lib/types"
import { cn } from "@/lib/utils"

type TrafficMetric = "total" | "download" | "upload"

const CARD_BASE = "gap-3 py-4"
const CARD_HEADER = "px-5 pb-0"
const CARD_CONTENT = "px-5"

const CHART_PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

const TOOLTIP_STYLE = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  color: "var(--popover-foreground)",
  fontSize: "12px",
}

function MetricTabs({
  value,
  onChange,
}: {
  value: TrafficMetric
  onChange: (next: TrafficMetric) => void
}) {
  const { t } = useTranslation()
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as TrafficMetric)}>
      <TabsList className="h-7 min-h-7 p-0.5">
        <TabsTrigger value="total" className="min-h-6 px-2 py-0.5 text-xs">
          {t("dashboard.metricTotal")}
        </TabsTrigger>
        <TabsTrigger value="download" className="min-h-6 px-2 py-0.5 text-xs">
          {t("dashboard.metricDownload")}
        </TabsTrigger>
        <TabsTrigger value="upload" className="min-h-6 px-2 py-0.5 text-xs">
          {t("dashboard.metricUpload")}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )
}

function ChartEmpty({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex h-56 flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/20 px-4 text-center">
      <div className="mb-1.5 text-muted-foreground">{icon}</div>
      <p className="text-xs text-muted-foreground">{text}</p>
    </div>
  )
}

function pickMetricValue(item: { upload: number; download: number }, metric: TrafficMetric) {
  if (metric === "download") return item.download
  if (metric === "upload") return item.upload
  return item.upload + item.download
}

function metricStrokeColor(metric: TrafficMetric) {
  if (metric === "upload") return "var(--chart-2)"
  if (metric === "download") return "var(--chart-1)"
  return "var(--chart-3)"
}

export function DashboardPage() {
  const { t } = useTranslation()
  const [range, setRange] = useState<DashboardRange>("24h")
  const [trendMetric, setTrendMetric] = useState<TrafficMetric>("total")
  const [nodeMetric, setNodeMetric] = useState<TrafficMetric>("total")
  const [userMetric, setUserMetric] = useState<TrafficMetric>("total")
  const [protoMetric, setProtoMetric] = useState<TrafficMetric>("total")

  const query = useQuery({
    queryKey: queryKeys.dashboardRange(range),
    queryFn: () => api.dashboard(range),
    refetchInterval: 10_000,
    placeholderData: (prev) => prev,
  })

  const data = query.data
  const s = data?.summary

  const trendData = useMemo(
    () =>
      (data?.traffic_series ?? []).map((pt) => ({
        label: range === "24h" ? pt.bucket.slice(11, 16) : pt.bucket.slice(5, 10),
        bucket: pt.bucket,
        upload: pt.upload,
        download: pt.download,
        total: pt.upload + pt.download,
      })),
    [data?.traffic_series, range]
  )

  const nodeTrafficData = useMemo(
    () =>
      (data?.node_traffic ?? [])
        .map((item) => ({
          id: item.node_id,
          name: item.node_name.length > 12 ? `${item.node_name.slice(0, 12)}…` : item.node_name,
          fullName: item.node_name,
          region: item.region,
          upload: item.upload,
          download: item.download,
          total: item.total,
          value: pickMetricValue(item, nodeMetric),
        }))
        .filter((item) => item.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 8),
    [data?.node_traffic, nodeMetric]
  )

  const userTrafficData = useMemo(
    () =>
      (data?.user_traffic ?? [])
        .map((item) => ({
          id: item.user_id,
          name: item.username.length > 12 ? `${item.username.slice(0, 12)}…` : item.username,
          fullName: item.username,
          upload: item.upload,
          download: item.download,
          total: item.total,
          value: pickMetricValue(item, userMetric),
        }))
        .filter((item) => item.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 8),
    [data?.user_traffic, userMetric]
  )

  const protocolData = useMemo(() => {
    const items = (data?.protocol_traffic ?? [])
      .map((item) => ({
        protocol: item.protocol,
        label: PROTOCOL_LABELS[item.protocol as Protocol] ?? item.protocol,
        upload: item.upload,
        download: item.download,
        total: item.total,
        value: pickMetricValue(item, protoMetric),
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value)
    const sum = items.reduce((acc, cur) => acc + cur.value, 0)
    return { items, sum }
  }, [data?.protocol_traffic, protoMetric])

  const onlineNodeLoadData = useMemo(
    () =>
      (data?.nodes ?? [])
        .filter((n) => n.online)
        .map((n) => {
          const memPct = n.mem_total > 0 ? Math.min(100, Math.round((n.mem_used / n.mem_total) * 100)) : 0
          return {
            id: n.id,
            name: n.name.length > 12 ? `${n.name.slice(0, 12)}…` : n.name,
            fullName: n.name,
            cpu: Math.min(100, Math.round(n.cpu_percent * 10) / 10),
            mem: memPct,
            memUsed: n.mem_used,
            memTotal: n.mem_total,
          }
        })
        .slice(0, 8),
    [data?.nodes]
  )

  const nodeExpiryData = useMemo(
    () =>
      (data?.nodes ?? [])
        .map((n) => {
          const days = daysUntil(n.expire_at)
          return days === null
            ? null
            : {
                id: n.id,
                name: n.name.length > 12 ? `${n.name.slice(0, 12)}…` : n.name,
                fullName: n.name,
                days,
                displayDays: Math.max(0, days),
                cycle: n.billing_cycle,
              }
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .sort((a, b) => a.days - b.days)
        .slice(0, 5),
    [data?.nodes]
  )

  const topNodes = (data?.nodes ?? []).slice(0, 3)
  const topUsers = (data?.top_users ?? []).slice(0, 3)

  if (query.isError) {
    return (
      <div className="space-y-4">
        <PageHeader title={t("dashboard.title")} description={t("dashboard.description")} />
        <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
      </div>
    )
  }

  const metricLabel = (m: TrafficMetric) =>
    m === "download"
      ? t("dashboard.download")
      : m === "upload"
        ? t("dashboard.upload")
        : t("dashboard.total")

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("dashboard.title")}
        description={t("dashboard.description")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={range} onValueChange={(v) => setRange(v as DashboardRange)}>
              <TabsList className="h-8 min-h-8 p-0.5">
                <TabsTrigger value="24h" className="min-h-7 px-2.5 text-xs">
                  {t("dashboard.range24h")}
                </TabsTrigger>
                <TabsTrigger value="7d" className="min-h-7 px-2.5 text-xs">
                  {t("dashboard.range7d")}
                </TabsTrigger>
                <TabsTrigger value="30d" className="min-h-7 px-2.5 text-xs">
                  {t("dashboard.range30d")}
                </TabsTrigger>
                <TabsTrigger value="90d" className="min-h-7 px-2.5 text-xs">
                  {t("dashboard.range90d")}
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button size="sm" render={<Link to="/nodes" />} nativeButton={false}>
              {t("dashboard.manageNodes")}
            </Button>
          </div>
        }
      />

      {/* Row 1: KPI Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          loading={query.isLoading}
          title={t("dashboard.onlineNodes")}
          icon={<Server className="size-4 text-muted-foreground" />}
          value={s ? `${s.online_nodes} / ${s.total_nodes}` : "-"}
          sub={
            s
              ? s.expiring_soon_nodes > 0
                ? t("dashboard.expiringNodes", { count: s.expiring_soon_nodes })
                : t("dashboard.activeConnections", { count: s.active_connections })
              : ""
          }
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

      {/* Row 2: Cluster Traffic Trend + Node Renewal Countdown */}
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className={cn(CARD_BASE, "lg:col-span-8")}>
          <CardHeader className={CARD_HEADER}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-1.5 text-sm font-semibold">
                  <Activity className="size-3.5 text-muted-foreground" />
                  {t("dashboard.chartTitle")}
                </CardTitle>
                <CardDescription className="text-xs">{t("dashboard.chartDescription")}</CardDescription>
              </div>
              <MetricTabs value={trendMetric} onChange={setTrendMetric} />
            </div>
          </CardHeader>
          <CardContent className={CARD_CONTENT}>
            {query.isLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="fillDown" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="fillUp" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="fillTotal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--chart-3)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--chart-3)" stopOpacity={0} />
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
                      width={66}
                    />
                    <RechartsTooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(val, name) => [
                        formatBytes(Number(val)),
                        name === "download"
                          ? t("dashboard.download")
                          : name === "upload"
                            ? t("dashboard.upload")
                            : t("dashboard.total"),
                      ]}
                    />
                    {trendMetric === "total" ? (
                      <>
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
                      </>
                    ) : (
                      <Area
                        type="monotone"
                        dataKey={trendMetric}
                        stroke={metricStrokeColor(trendMetric)}
                        strokeWidth={2}
                        fill={trendMetric === "download" ? "url(#fillDown)" : "url(#fillUp)"}
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={cn(CARD_BASE, "lg:col-span-4")}>
          <CardHeader className={CARD_HEADER}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="truncate text-sm font-semibold">
                  {t("dashboard.nodeExpiryChartTitle")}
                </CardTitle>
                <CardDescription className="truncate text-xs">
                  {t("dashboard.nodeExpiryChartDesc")}
                </CardDescription>
              </div>
              <CalendarClock className="size-3.5 shrink-0 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className={CARD_CONTENT}>
            {query.isLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : nodeExpiryData.length === 0 ? (
              <div className="flex h-56 flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/20 px-4 text-center">
                <CalendarClock className="mb-1.5 size-4 text-muted-foreground" />
                <p className="text-xs font-medium text-foreground">
                  {t("dashboard.nodeExpiryEmptyTitle")}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {t("dashboard.nodeExpiryEmptyDesc")}
                </p>
              </div>
            ) : (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={nodeExpiryData}
                    layout="vertical"
                    margin={{ top: 4, right: 14, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                      unit={t("dashboard.daysUnit")}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                      width={76}
                    />
                    <RechartsTooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(_val, _name, item) => {
                        const rawDays = item?.payload?.days ?? 0
                        return [
                          rawDays <= 0
                            ? t("nodes.expired")
                            : t("nodes.daysLeft", { days: rawDays }),
                          item?.payload?.fullName ?? "",
                        ]
                      }}
                    />
                    <Bar dataKey="displayDays" radius={[0, 4, 4, 0]} barSize={16}>
                      {nodeExpiryData.map((entry) => (
                        <Cell
                          key={entry.id}
                          fill={
                            entry.days <= 7
                              ? "var(--destructive)"
                              : entry.days <= 30
                                ? "var(--warning)"
                                : "var(--chart-2)"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Period Node Traffic Usage + Period User Traffic Usage */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className={CARD_BASE}>
          <CardHeader className={CARD_HEADER}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-1.5 text-sm font-semibold">
                  <BarChart3 className="size-3.5 text-muted-foreground" />
                  {t("dashboard.nodeTrafficChartTitle")}
                </CardTitle>
                <CardDescription className="text-xs">
                  {t("dashboard.nodeTrafficChartDesc")}
                </CardDescription>
              </div>
              <MetricTabs value={nodeMetric} onChange={setNodeMetric} />
            </div>
          </CardHeader>
          <CardContent className={CARD_CONTENT}>
            {query.isLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : nodeTrafficData.length === 0 ? (
              <ChartEmpty icon={<Server className="size-4" />} text={t("dashboard.nodeTrafficEmpty")} />
            ) : (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={nodeTrafficData} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v) => formatBytes(Number(v))}
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                      width={66}
                    />
                    <RechartsTooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(val, _name, item) => {
                        const p = item?.payload
                        return [
                          `${formatBytes(Number(val))} (${t("dashboard.upload")} ${formatBytes(p?.upload ?? 0)} · ${t("dashboard.download")} ${formatBytes(p?.download ?? 0)})`,
                          p?.fullName ?? metricLabel(nodeMetric),
                        ]
                      }}
                    />
                    <Bar
                      dataKey="value"
                      fill={metricStrokeColor(nodeMetric)}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={36}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={CARD_BASE}>
          <CardHeader className={CARD_HEADER}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-1.5 text-sm font-semibold">
                  <Users className="size-3.5 text-muted-foreground" />
                  {t("dashboard.userTrafficChartTitle")}
                </CardTitle>
                <CardDescription className="text-xs">
                  {t("dashboard.userTrafficChartDesc")}
                </CardDescription>
              </div>
              <MetricTabs value={userMetric} onChange={setUserMetric} />
            </div>
          </CardHeader>
          <CardContent className={CARD_CONTENT}>
            {query.isLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : userTrafficData.length === 0 ? (
              <ChartEmpty icon={<Users className="size-4" />} text={t("dashboard.userTrafficEmpty")} />
            ) : (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={userTrafficData} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v) => formatBytes(Number(v))}
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                      width={66}
                    />
                    <RechartsTooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(val, _name, item) => {
                        const p = item?.payload
                        return [
                          `${formatBytes(Number(val))} (${t("dashboard.upload")} ${formatBytes(p?.upload ?? 0)} · ${t("dashboard.download")} ${formatBytes(p?.download ?? 0)})`,
                          p?.fullName ?? metricLabel(userMetric),
                        ]
                      }}
                    />
                    <Bar
                      dataKey="value"
                      fill={metricStrokeColor(userMetric)}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={36}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Protocol Traffic Share Donut + Online Node Live Load */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className={CARD_BASE}>
          <CardHeader className={CARD_HEADER}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-1.5 text-sm font-semibold">
                  <PieChartIcon className="size-3.5 text-muted-foreground" />
                  {t("dashboard.protocolChartTitle")}
                </CardTitle>
                <CardDescription className="text-xs">
                  {t("dashboard.protocolChartDesc")}
                </CardDescription>
              </div>
              <MetricTabs value={protoMetric} onChange={setProtoMetric} />
            </div>
          </CardHeader>
          <CardContent className={CARD_CONTENT}>
            {query.isLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : protocolData.items.length === 0 ? (
              <ChartEmpty
                icon={<PieChartIcon className="size-4" />}
                text={t("dashboard.protocolChartEmpty")}
              />
            ) : (
              <div className="grid h-56 grid-cols-1 items-center gap-3 sm:grid-cols-12">
                <div className="h-44 w-full sm:col-span-6 sm:h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={protocolData.items}
                        dataKey="value"
                        nameKey="label"
                        innerRadius="54%"
                        outerRadius="84%"
                        paddingAngle={2}
                      >
                        {protocolData.items.map((entry, idx) => (
                          <Cell
                            key={entry.protocol}
                            fill={CHART_PALETTE[idx % CHART_PALETTE.length]}
                          />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(val, name) => {
                          const pct =
                            protocolData.sum > 0
                              ? Math.round((Number(val) / protocolData.sum) * 1000) / 10
                              : 0
                          return [
                            `${formatBytes(Number(val))} (${t("dashboard.shareLabel", { percent: pct })})`,
                            String(name),
                          ]
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="max-h-52 space-y-2 overflow-y-auto pr-1 sm:col-span-6">
                  {protocolData.items.map((item, idx) => {
                    const pct =
                      protocolData.sum > 0
                        ? Math.round((item.value / protocolData.sum) * 1000) / 10
                        : 0
                    return (
                      <div
                        key={item.protocol}
                        className="flex items-center justify-between gap-2 text-xs tabular-nums"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: CHART_PALETTE[idx % CHART_PALETTE.length] }}
                          />
                          <span className="truncate font-medium text-foreground">{item.label}</span>
                        </div>
                        <div className="shrink-0 text-right text-muted-foreground">
                          <span className="text-foreground">{formatBytes(item.value)}</span>{" "}
                          <span>({pct}%)</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={CARD_BASE}>
          <CardHeader className={CARD_HEADER}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-1.5 text-sm font-semibold">
                  <Cpu className="size-3.5 text-muted-foreground" />
                  {t("dashboard.nodeLoadChartTitle")}
                </CardTitle>
                <CardDescription className="text-xs">
                  {t("dashboard.nodeLoadChartDesc")}
                </CardDescription>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-chart-1" />
                  {t("dashboard.cpuLabel")}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-chart-2" />
                  {t("dashboard.memLabel")}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className={CARD_CONTENT}>
            {query.isLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : onlineNodeLoadData.length === 0 ? (
              <ChartEmpty icon={<Cpu className="size-4" />} text={t("dashboard.nodeLoadEmpty")} />
            ) : (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={onlineNodeLoadData}
                    margin={{ top: 6, right: 8, left: -12, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tickFormatter={(v) => `${v}%`}
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                      width={46}
                    />
                    <RechartsTooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(val, name, item) => {
                        if (name === "mem") {
                          const p = item?.payload
                          const detail =
                            p?.memTotal > 0
                              ? ` (${formatBytes(p.memUsed)} / ${formatBytes(p.memTotal)})`
                              : ""
                          return [`${val}%${detail}`, t("dashboard.memLabel")]
                        }
                        return [`${val}%`, t("dashboard.cpuLabel")]
                      }}
                    />
                    <Bar dataKey="cpu" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={22} />
                    <Bar dataKey="mem" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 5: Node Status (Top 3) + Top Traffic Users (Top 3) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className={CARD_BASE}>
          <CardHeader className={cn(CARD_HEADER, "flex flex-row items-center justify-between")}>
            <div className="space-y-0.5">
              <CardTitle className="text-sm font-semibold">
                {t("dashboard.nodeStatusTitle")}
              </CardTitle>
              <CardDescription className="text-xs">{t("dashboard.nodeStatusDesc")}</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              render={<Link to="/nodes" />}
              nativeButton={false}
            >
              {t("dashboard.viewAll")}
            </Button>
          </CardHeader>
          <CardContent className={cn(CARD_CONTENT, "space-y-2.5")}>
            {query.isLoading ? (
              <div className="space-y-2.5">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : !topNodes.length ? (
              <EmptyState
                className="py-6"
                icon={<Server className="size-4" />}
                title={t("dashboard.noNodesTitle")}
                description={t("dashboard.noNodesDesc")}
              />
            ) : (
              topNodes.map((n) => (
                <div
                  key={n.id}
                  className="flex flex-col gap-1.5 rounded-md border border-border px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between"
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

        <Card className={CARD_BASE}>
          <CardHeader className={cn(CARD_HEADER, "flex flex-row items-center justify-between")}>
            <div className="space-y-0.5">
              <CardTitle className="text-sm font-semibold">{t("dashboard.topUsersTitle")}</CardTitle>
              <CardDescription className="text-xs">{t("dashboard.topUsersDesc")}</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              render={<Link to="/users" />}
              nativeButton={false}
            >
              {t("dashboard.viewAll")}
            </Button>
          </CardHeader>
          <CardContent className={cn(CARD_CONTENT, "space-y-2.5")}>
            {query.isLoading ? (
              <div className="space-y-2.5">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : !topUsers.length ? (
              <EmptyState
                className="py-6"
                icon={<Users className="size-4" />}
                title={t("dashboard.noUsersTitle")}
                description={t("dashboard.noUsersDesc")}
              />
            ) : (
              topUsers.map((u) => (
                <div key={u.id} className="space-y-1.5 rounded-md border border-border px-3.5 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{u.username}</span>
                    <Badge
                      variant={u.enabled ? "secondary" : "destructive"}
                      className="px-1.5 py-0 text-[11px] tabular-nums"
                    >
                      {u.enabled
                        ? t("dashboard.accessCount", {
                            nodes: u.node_ids.length,
                            inbounds: u.inbound_count ?? 0,
                          })
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
    <Card className="gap-1.5 py-3">
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
