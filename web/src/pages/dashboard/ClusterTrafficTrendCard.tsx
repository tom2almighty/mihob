import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import {
  Activity,
  BarChart3,
  RotateCcw,
  Search,
  Server,
  SlidersHorizontal,
  TrendingUp,
  Users,
  X,
} from "lucide-react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api, queryKeys } from "@/lib/api"
import { formatBytes, formatBytesCompact } from "@/lib/format"
import type {
  DashboardRange,
  EntityTrafficSeries,
  Node,
  NodeTrafficStat,
  TrafficPoint,
  UserTrafficStat,
} from "@/lib/types"
import { cn } from "@/lib/utils"

export type TrendTrafficMetric = "total" | "download" | "upload"
type TrendChartType = "line" | "bar"
type TrendDimension = "cluster" | "node" | "user"

const MAX_SELECTED_ENTITIES = 8

const SERIES_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--info)",
  "var(--success)",
  "var(--warning)",
]

function pickPointMetric(pt: { upload: number; download: number }, metric: TrendTrafficMetric) {
  if (metric === "download") return pt.download
  if (metric === "upload") return pt.upload
  return pt.upload + pt.download
}

interface SeriesDescriptor {
  key: string
  id: number
  label: string
  color: string
  total: number
  isOther?: boolean
}

interface TooltipEntry {
  dataKey?: string | number | ((obj: unknown) => unknown)
  name?: string | number
  value?: number | string | ReadonlyArray<number | string>
  color?: string
}

function TrendTooltip({
  active,
  payload,
  label,
  seriesMap,
  showTotal,
}: {
  active?: boolean
  payload?: ReadonlyArray<TooltipEntry>
  label?: string
  seriesMap: Map<string, SeriesDescriptor>
  showTotal: boolean
}) {
  const { t } = useTranslation()
  if (!active || !payload?.length) return null

  const items = payload
    .map((entry) => {
      const key = String(entry.dataKey ?? "")
      const meta = seriesMap.get(key)
      return {
        key,
        name: meta?.label ?? String(entry.name ?? key),
        color: meta?.color ?? entry.color ?? "var(--chart-1)",
        value: Number(entry.value ?? 0),
      }
    })
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)

  const sum = items.reduce((acc, cur) => acc + cur.value, 0)

  return (
    <div className="min-w-44 max-w-64 rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div className="mb-1.5 font-medium text-foreground tabular-nums">{label}</div>
      {items.length === 0 ? (
        <div className="text-muted-foreground">{t("dashboard.trend.noTrafficInBucket")}</div>
      ) : (
        <div className="space-y-1">
          {items.map((item) => (
            <div key={item.key} className="flex items-center justify-between gap-3 tabular-nums">
              <div className="flex min-w-0 items-center gap-1.5">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="truncate text-muted-foreground">{item.name}</span>
              </div>
              <span className="shrink-0 font-medium text-foreground">
                {formatBytes(item.value)}
              </span>
            </div>
          ))}
          {showTotal && items.length > 1 && (
            <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-border/70 pt-1.5 font-medium tabular-nums">
              <span className="text-muted-foreground">{t("dashboard.total")}</span>
              <span className="text-foreground">{formatBytes(sum)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function ClusterTrafficTrendCard({
  range,
  loading,
  trafficSeries,
  nodeTrafficSeries,
  userTrafficSeries,
  nodes,
  nodeTraffic,
  userTraffic,
  className,
}: {
  range: DashboardRange
  loading: boolean
  trafficSeries: TrafficPoint[]
  nodeTrafficSeries: EntityTrafficSeries[]
  userTrafficSeries: EntityTrafficSeries[]
  nodes: Node[]
  nodeTraffic: NodeTrafficStat[]
  userTraffic: UserTrafficStat[]
  className?: string
}) {
  const { t } = useTranslation()
  const [chartType, setChartType] = useState<TrendChartType>("line")
  const [dimension, setDimension] = useState<TrendDimension>("cluster")
  const [metric, setMetric] = useState<TrendTrafficMetric>("total")
  const [selectedNodeIds, setSelectedNodeIds] = useState<number[]>([])
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([])
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(() => new Set())
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterSearch, setFilterSearch] = useState("")

  const activeSelectedIds = dimension === "node" ? selectedNodeIds : selectedUserIds
  const sortedIdsKey = useMemo(
    () => [...activeSelectedIds].sort((a, b) => a - b).join(","),
    [activeSelectedIds]
  )

  // Fetch full users list lazily when the user picker popover is opened
  const allUsersQuery = useQuery({
    queryKey: queryKeys.users,
    queryFn: api.listUsers,
    enabled: dimension === "user" && filterOpen,
    staleTime: 30_000,
  })

  // Fetch custom filtered entity series only when the user explicitly selects specific nodes/users
  const customSeriesQuery = useQuery({
    queryKey: queryKeys.dashboardTrafficSeries(
      range,
      dimension === "user" ? "user" : "node",
      sortedIdsKey
    ),
    queryFn: () =>
      api.dashboardTrafficSeries(
        range,
        dimension === "user" ? "user" : "node",
        activeSelectedIds
      ),
    enabled: dimension !== "cluster" && activeSelectedIds.length > 0,
    refetchInterval: 10_000,
    placeholderData: (prev) => prev,
  })

  // Build searchable options for Node / User filter popover (sorted by period traffic DESC)
  const pickerOptions = useMemo(() => {
    if (dimension === "node") {
      const trafficMap = new Map<number, number>()
      for (const item of nodeTraffic) {
        trafficMap.set(item.node_id, item.total)
      }
      for (const item of nodeTrafficSeries) {
        if (!item.is_other && item.id > 0 && !trafficMap.has(item.id)) {
          trafficMap.set(item.id, item.total)
        }
      }
      return nodes
        .map((n) => ({
          id: n.id,
          name: n.name,
          sub: n.region || "",
          traffic: trafficMap.get(n.id) ?? 0,
        }))
        .sort((a, b) => b.traffic - a.traffic || a.name.localeCompare(b.name))
    }

    if (dimension === "user") {
      const trafficMap = new Map<number, number>()
      const nameMap = new Map<number, string>()
      for (const item of userTraffic) {
        trafficMap.set(item.user_id, item.total)
        nameMap.set(item.user_id, item.username)
      }
      for (const item of userTrafficSeries) {
        if (!item.is_other && item.id > 0) {
          if (!trafficMap.has(item.id)) trafficMap.set(item.id, item.total)
          if (!nameMap.has(item.id)) nameMap.set(item.id, item.name)
        }
      }
      for (const u of allUsersQuery.data ?? []) {
        nameMap.set(u.id, u.username)
      }
      return Array.from(nameMap.entries())
        .map(([id, name]) => ({
          id,
          name,
          sub: "",
          traffic: trafficMap.get(id) ?? 0,
        }))
        .sort((a, b) => b.traffic - a.traffic || a.name.localeCompare(b.name))
    }

    return []
  }, [dimension, nodes, nodeTraffic, nodeTrafficSeries, userTraffic, userTrafficSeries, allUsersQuery.data])

  const filteredPickerOptions = useMemo(() => {
    const q = filterSearch.trim().toLowerCase()
    if (!q) return pickerOptions
    return pickerOptions.filter(
      (opt) => opt.name.toLowerCase().includes(q) || opt.sub.toLowerCase().includes(q)
    )
  }, [pickerOptions, filterSearch])

  // Resolve active entity series (custom selection or default Top 5 + Others)
  const activeEntitySeries: EntityTrafficSeries[] = useMemo(() => {
    if (dimension === "cluster") return []
    if (activeSelectedIds.length > 0 && customSeriesQuery.data?.series) {
      return customSeriesQuery.data.series
    }
    return dimension === "node" ? nodeTrafficSeries : userTrafficSeries
  }, [dimension, activeSelectedIds.length, customSeriesQuery.data, nodeTrafficSeries, userTrafficSeries])

  // Build series descriptors for legend, colors, and tooltip
  const seriesDescriptors: SeriesDescriptor[] = useMemo(() => {
    if (dimension === "cluster") {
      const out: SeriesDescriptor[] = []
      if (metric === "total" || metric === "download") {
        out.push({
          key: "download",
          id: 1,
          label: t("dashboard.download"),
          color: "var(--chart-1)",
          total: trafficSeries.reduce((acc, p) => acc + p.download, 0),
        })
      }
      if (metric === "total" || metric === "upload") {
        out.push({
          key: "upload",
          id: 2,
          label: t("dashboard.upload"),
          color: "var(--chart-2)",
          total: trafficSeries.reduce((acc, p) => acc + p.upload, 0),
        })
      }
      return out
    }

    let colorIdx = 0
    return activeEntitySeries.map((s) => {
      const isOther = Boolean(s.is_other)
      const key = isOther ? "other" : `e_${s.id}`
      const label = isOther
        ? dimension === "node"
          ? t("dashboard.trend.otherNodes", { count: s.other_count ?? 0 })
          : t("dashboard.trend.otherUsers", { count: s.other_count ?? 0 })
        : s.name
      const color = isOther
        ? "var(--muted-foreground)"
        : SERIES_COLORS[colorIdx++ % SERIES_COLORS.length]
      return {
        key,
        id: s.id,
        label,
        color,
        total: s.total,
        isOther,
      }
    })
  }, [dimension, metric, trafficSeries, activeEntitySeries, t])

  const seriesMap = useMemo(() => {
    const map = new Map<string, SeriesDescriptor>()
    for (const desc of seriesDescriptors) {
      map.set(desc.key, desc)
    }
    return map
  }, [seriesDescriptors])

  // Merge time buckets with series values
  const chartData = useMemo(() => {
    const spansMultiYear =
      range === "all" &&
      trafficSeries.length > 1 &&
      trafficSeries[0].bucket.slice(0, 4) !==
        trafficSeries[trafficSeries.length - 1].bucket.slice(0, 4)

    const formatBucketLabel = (bucket: string) =>
      range === "24h"
        ? bucket.slice(11, 16)
        : spansMultiYear
          ? bucket.slice(0, 10)
          : bucket.slice(5, 10)

    if (dimension === "cluster") {
      return trafficSeries.map((pt) => ({
        label: formatBucketLabel(pt.bucket),
        bucket: pt.bucket,
        download: pt.download,
        upload: pt.upload,
      }))
    }

    const pointLookup = new Map<string, Map<string, TrafficPoint>>()
    for (const s of activeEntitySeries) {
      const key = s.is_other ? "other" : `e_${s.id}`
      const byBucket = new Map<string, TrafficPoint>()
      for (const pt of s.points ?? []) {
        byBucket.set(pt.bucket, pt)
      }
      pointLookup.set(key, byBucket)
    }

    return trafficSeries.map((pt) => {
      const row: Record<string, string | number> = {
        label: formatBucketLabel(pt.bucket),
        bucket: pt.bucket,
      }
      for (const desc of seriesDescriptors) {
        const entityPt = pointLookup.get(desc.key)?.get(pt.bucket)
        row[desc.key] = entityPt ? pickPointMetric(entityPt, metric) : 0
      }
      return row
    })
  }, [range, trafficSeries, dimension, activeEntitySeries, seriesDescriptors, metric])

  const visibleSeries = useMemo(
    () => seriesDescriptors.filter((d) => !hiddenKeys.has(d.key)),
    [seriesDescriptors, hiddenKeys]
  )

  const handleDimensionChange = (next: TrendDimension) => {
    setDimension(next)
    setHiddenKeys(new Set())
    setFilterSearch("")
    setFilterOpen(false)
  }

  const toggleSeriesVisibility = (key: string) => {
    setHiddenKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else if (seriesDescriptors.length - next.size > 1) {
        // Keep at least 1 series visible
        next.add(key)
      }
      return next
    })
  }

  const toggleEntitySelection = (id: number) => {
    const updater = (prev: number[]) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id)
      }
      if (prev.length >= MAX_SELECTED_ENTITIES) return prev
      return [...prev, id]
    }
    setHiddenKeys(new Set())
    if (dimension === "node") {
      setSelectedNodeIds(updater)
    } else if (dimension === "user") {
      setSelectedUserIds(updater)
    }
  }

  const resetEntitySelection = () => {
    setHiddenKeys(new Set())
    if (dimension === "node") setSelectedNodeIds([])
    if (dimension === "user") setSelectedUserIds([])
  }

  const hasEntityData = dimension === "cluster" || seriesDescriptors.length > 0

  return (
    <Card className={cn("gap-3 py-4", className)}>
      <CardHeader className="gap-2.5 px-5 pb-0">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-1.5 text-sm font-semibold">
              <Activity className="size-3.5 text-muted-foreground" />
              {t("dashboard.chartTitle")}
            </CardTitle>
            <CardDescription className="text-xs">
              {dimension === "node"
                ? t("dashboard.trend.descByNode")
                : dimension === "user"
                  ? t("dashboard.trend.descByUser")
                  : t("dashboard.chartDescription")}
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {/* Dimension Tabs: Cluster / By Node / By User */}
            <Tabs
              value={dimension}
              onValueChange={(v) => handleDimensionChange((v as TrendDimension) || "cluster")}
            >
              <TabsList size="xs">
                <TabsTrigger value="cluster">{t("dashboard.trend.dimCluster")}</TabsTrigger>
                <TabsTrigger value="node">{t("dashboard.trend.dimNode")}</TabsTrigger>
                <TabsTrigger value="user">{t("dashboard.trend.dimUser")}</TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Metric Tabs: Total / Download / Upload */}
            <Tabs value={metric} onValueChange={(v) => setMetric((v as TrendTrafficMetric) || "total")}>
              <TabsList size="xs">
                <TabsTrigger value="total">{t("dashboard.metricTotal")}</TabsTrigger>
                <TabsTrigger value="download">{t("dashboard.metricDownload")}</TabsTrigger>
                <TabsTrigger value="upload">{t("dashboard.metricUpload")}</TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Chart Type Tabs: Line / Bar */}
            <Tabs
              value={chartType}
              onValueChange={(v) => setChartType((v as TrendChartType) || "line")}
            >
              <TabsList size="xs" aria-label={t("dashboard.trend.chartTypeAria")}>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <TabsTrigger
                        value="line"
                        className="px-2"
                        aria-label={t("dashboard.trend.chartLine")}
                      >
                        <TrendingUp className="size-3.5" />
                      </TabsTrigger>
                    }
                  />
                  <TooltipContent>{t("dashboard.trend.chartLine")}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <TabsTrigger
                        value="bar"
                        className="px-2"
                        aria-label={t("dashboard.trend.chartBar")}
                      >
                        <BarChart3 className="size-3.5" />
                      </TabsTrigger>
                    }
                  />
                  <TooltipContent>{t("dashboard.trend.chartBar")}</TooltipContent>
                </Tooltip>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* Interactive Legend + Large-Cluster Filter Bar */}
        {!loading && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {seriesDescriptors.map((item) => {
                const isHidden = hiddenKeys.has(item.key)
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => toggleSeriesVisibility(item.key)}
                    title={`${item.label} · ${formatBytes(item.total)}`}
                    className={cn(
                      "inline-flex max-w-44 items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] transition-colors",
                      isHidden
                        ? "border-border/50 bg-transparent text-muted-foreground/50 line-through"
                        : "border-border/70 bg-muted/40 text-foreground hover:bg-muted/80"
                    )}
                  >
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor: item.color,
                        opacity: isHidden ? 0.35 : 1,
                      }}
                    />
                    <span className="truncate">{item.label}</span>
                  </button>
                )
              })}
            </div>

            {dimension !== "cluster" && (
              <Popover open={filterOpen} onOpenChange={setFilterOpen}>
                <PopoverTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      className="h-6.5 gap-1.5 px-2 text-[11px]"
                    />
                  }
                >
                  <SlidersHorizontal className="size-3 text-muted-foreground" />
                  <span>
                    {activeSelectedIds.length > 0
                      ? dimension === "node"
                        ? t("dashboard.trend.selectedNodes", { count: activeSelectedIds.length })
                        : t("dashboard.trend.selectedUsers", { count: activeSelectedIds.length })
                      : t("dashboard.trend.top5Default")}
                  </span>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-68 gap-2 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-foreground">
                      {dimension === "node"
                        ? t("dashboard.trend.filterNodesTitle")
                        : t("dashboard.trend.filterUsersTitle")}
                    </span>
                    {activeSelectedIds.length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="h-6 px-1.5 text-[11px] text-muted-foreground"
                        onClick={resetEntitySelection}
                      >
                        <RotateCcw className="mr-1 size-3" />
                        {t("dashboard.trend.resetTop5")}
                      </Button>
                    )}
                  </div>

                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={filterSearch}
                      onChange={(e) => setFilterSearch(e.target.value)}
                      placeholder={
                        dimension === "node"
                          ? t("dashboard.trend.searchNodesPlaceholder")
                          : t("dashboard.trend.searchUsersPlaceholder")
                      }
                      className="h-7 pr-7 pl-8 text-xs"
                    />
                    {filterSearch && (
                      <button
                        type="button"
                        onClick={() => setFilterSearch("")}
                        aria-label={t("common.clearSearch")}
                        className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </div>

                  <div className="max-h-52 space-y-0.5 overflow-y-auto pr-0.5">
                    {filteredPickerOptions.length === 0 ? (
                      <div className="py-5 text-center text-xs text-muted-foreground">
                        {t("dashboard.trend.noMatchOptions")}
                      </div>
                    ) : (
                      filteredPickerOptions.map((opt) => {
                        const checked = activeSelectedIds.includes(opt.id)
                        const disabled =
                          !checked && activeSelectedIds.length >= MAX_SELECTED_ENTITIES
                        return (
                          <label
                            key={opt.id}
                            className={cn(
                              "flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-muted/60",
                              disabled && "cursor-not-allowed opacity-50"
                            )}
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <Checkbox
                                checked={checked}
                                disabled={disabled}
                                onCheckedChange={() => toggleEntitySelection(opt.id)}
                              />
                              <span className="truncate text-foreground">{opt.name}</span>
                            </div>
                            <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
                              {opt.traffic > 0 ? formatBytesCompact(opt.traffic) : "0 B"}
                            </span>
                          </label>
                        )
                      })
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-border/70 pt-1.5 text-[11px] text-muted-foreground">
                    <span>
                      {t("dashboard.trend.filterLimitHint", { max: MAX_SELECTED_ENTITIES })}
                    </span>
                    <span className="tabular-nums">
                      {activeSelectedIds.length} / {MAX_SELECTED_ENTITIES}
                    </span>
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="px-5">
        {loading ? (
          <Skeleton className="h-56 w-full" />
        ) : !hasEntityData ? (
          <div className="flex h-56 flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/20 px-4 text-center">
            <div className="mb-1.5 text-muted-foreground">
              {dimension === "node" ? (
                <Server className="size-4" />
              ) : (
                <Users className="size-4" />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {dimension === "node"
                ? t("dashboard.nodeTrafficEmpty")
                : t("dashboard.userTrafficEmpty")}
            </p>
          </div>
        ) : (
          <div className="h-56 w-full">
            {chartType === "bar" ? (
              <BarChart
                responsive
                style={{ width: "100%", height: "100%" }}
                data={chartData}
                margin={{ top: 6, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => formatBytesCompact(Number(v))}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  width={72}
                />
                <RechartsTooltip
                  cursor={{ fill: "var(--muted)", fillOpacity: 0.35 }}
                  content={(props) => (
                    <TrendTooltip
                      active={props.active}
                      payload={props.payload as ReadonlyArray<TooltipEntry> | undefined}
                      label={String(props.payload?.[0]?.payload?.bucket ?? props.label ?? "")}
                      seriesMap={seriesMap}
                      showTotal={visibleSeries.length > 1}
                    />
                  )}
                />
                {visibleSeries.map((s, idx) => {
                  const isTop = idx === visibleSeries.length - 1
                  return (
                    <Bar
                      key={s.key}
                      dataKey={s.key}
                      name={s.label}
                      stackId="traffic"
                      fill={s.color}
                      fillOpacity={s.isOther ? 0.55 : 0.9}
                      radius={isTop ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                      maxBarSize={28}
                    />
                  )
                })}
              </BarChart>
            ) : dimension === "cluster" ? (
              <AreaChart
                responsive
                style={{ width: "100%", height: "100%" }}
                data={chartData}
                margin={{ top: 6, right: 8, left: 0, bottom: 0 }}
              >
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
                  tickFormatter={(v) => formatBytesCompact(Number(v))}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  width={72}
                />
                <RechartsTooltip
                  content={(props) => (
                    <TrendTooltip
                      active={props.active}
                      payload={props.payload as ReadonlyArray<TooltipEntry> | undefined}
                      label={String(props.payload?.[0]?.payload?.bucket ?? props.label ?? "")}
                      seriesMap={seriesMap}
                      showTotal={visibleSeries.length > 1}
                    />
                  )}
                />
                {visibleSeries.map((s) => (
                  <Area
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stroke={s.color}
                    strokeWidth={2}
                    fill={s.key === "download" ? "url(#fillDown)" : "url(#fillUp)"}
                  />
                ))}
              </AreaChart>
            ) : (
              <LineChart
                responsive
                style={{ width: "100%", height: "100%" }}
                data={chartData}
                margin={{ top: 6, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => formatBytesCompact(Number(v))}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  width={72}
                />
                <RechartsTooltip
                  content={(props) => (
                    <TrendTooltip
                      active={props.active}
                      payload={props.payload as ReadonlyArray<TooltipEntry> | undefined}
                      label={String(props.payload?.[0]?.payload?.bucket ?? props.label ?? "")}
                      seriesMap={seriesMap}
                      showTotal={visibleSeries.length > 1}
                    />
                  )}
                />
                {visibleSeries.map((s) => (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stroke={s.color}
                    strokeWidth={s.isOther ? 1.5 : 2}
                    strokeDasharray={s.isOther ? "4 3" : undefined}
                    dot={false}
                    activeDot={{ r: 3.5, strokeWidth: 0 }}
                  />
                ))}
              </LineChart>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
