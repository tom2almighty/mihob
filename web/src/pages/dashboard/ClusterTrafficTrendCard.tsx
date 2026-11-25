import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import {
  Activity,
  BarChart3,
  Layers,
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api, queryKeys } from "@/lib/api"
import { formatBytes, formatBytesCompact } from "@/lib/format"
import type {
  DashboardRange,
  DashboardTrafficDimension,
  EntityTrafficSeries,
  Node,
  NodeTrafficStat,
  TrafficPoint,
  UserTrafficStat,
} from "@/lib/types"
import { cn } from "@/lib/utils"

export type TrendTrafficMetric = "total" | "download" | "upload"
type TrendChartType = "line" | "bar"
type TrendDimension = "cluster" | DashboardTrafficDimension
type UserNodePivot = "by_user" | "by_node"

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
  const [pivot, setPivot] = useState<UserNodePivot>("by_user")
  const [pivotUserId, setPivotUserId] = useState<number>(0)
  const [pivotNodeId, setPivotNodeId] = useState<number>(0)
  const [pivotFilterNodeIds, setPivotFilterNodeIds] = useState<number[]>([])
  const [pivotFilterUserIds, setPivotFilterUserIds] = useState<number[]>([])
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(() => new Set())
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterSearch, setFilterSearch] = useState("")

  const filterTargetKind: "node" | "user" | null =
    dimension === "node"
      ? "node"
      : dimension === "user"
        ? "user"
        : dimension === "user_node"
          ? pivot === "by_user" && pivotUserId > 0
            ? "node"
            : pivot === "by_node" && pivotNodeId > 0
              ? "user"
              : null
          : null

  const activeSelectedIds =
    dimension === "node"
      ? selectedNodeIds
      : dimension === "user"
        ? selectedUserIds
        : dimension === "user_node"
          ? pivot === "by_user" && pivotUserId > 0
            ? pivotFilterNodeIds
            : pivot === "by_node" && pivotNodeId > 0
              ? pivotFilterUserIds
              : []
          : []

  const sortedIdsKey = useMemo(
    () => [...activeSelectedIds].sort((a, b) => a - b).join(","),
    [activeSelectedIds]
  )

  const queryUserId = dimension === "user_node" && pivot === "by_user" ? pivotUserId : 0
  const queryNodeId = dimension === "user_node" && pivot === "by_node" ? pivotNodeId : 0
  const apiDimension: DashboardTrafficDimension = dimension === "cluster" ? "node" : dimension

  const allUsersQuery = useQuery({
    queryKey: queryKeys.users,
    queryFn: api.listUsers,
    enabled: dimension === "user_node" || (dimension === "user" && filterOpen),
    staleTime: 30_000,
  })

  const customSeriesQuery = useQuery({
    queryKey: queryKeys.dashboardTrafficSeries(
      range,
      apiDimension,
      sortedIdsKey,
      queryUserId,
      queryNodeId
    ),
    queryFn: () =>
      api.dashboardTrafficSeries(range, apiDimension, activeSelectedIds, {
        userId: queryUserId,
        nodeId: queryNodeId,
      }),
    enabled: dimension === "user_node" || (dimension !== "cluster" && activeSelectedIds.length > 0),
    refetchInterval: 10_000,
    placeholderData: (prev) => prev,
  })

  const nodeOptions = useMemo(() => {
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
  }, [nodes, nodeTraffic, nodeTrafficSeries])

  const userOptions = useMemo(() => {
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
  }, [userTraffic, userTrafficSeries, allUsersQuery.data])

  const pickerOptions =
    filterTargetKind === "node" ? nodeOptions : filterTargetKind === "user" ? userOptions : []

  const filteredPickerOptions = useMemo(() => {
    const q = filterSearch.trim().toLowerCase()
    if (!q) return pickerOptions
    return pickerOptions.filter(
      (opt) => opt.name.toLowerCase().includes(q) || opt.sub.toLowerCase().includes(q)
    )
  }, [pickerOptions, filterSearch])

  const activeEntitySeries: EntityTrafficSeries[] = useMemo(() => {
    if (dimension === "cluster") return []
    if (dimension === "user_node") {
      return customSeriesQuery.data?.series ?? []
    }
    if (activeSelectedIds.length > 0 && customSeriesQuery.data?.series) {
      return customSeriesQuery.data.series
    }
    return dimension === "node" ? nodeTrafficSeries : userTrafficSeries
  }, [
    dimension,
    activeSelectedIds.length,
    customSeriesQuery.data,
    nodeTrafficSeries,
    userTrafficSeries,
  ])

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
        ? dimension === "node" ||
          (dimension === "user_node" && pivot === "by_user" && pivotUserId > 0)
          ? t("dashboard.trend.otherNodes", { count: s.other_count ?? 0 })
          : dimension === "user" ||
              (dimension === "user_node" && pivot === "by_node" && pivotNodeId > 0)
            ? t("dashboard.trend.otherUsers", { count: s.other_count ?? 0 })
            : t("dashboard.trend.otherPairs", { count: s.other_count ?? 0 })
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
  }, [dimension, pivot, pivotUserId, pivotNodeId, metric, trafficSeries, activeEntitySeries, t])

  const seriesMap = useMemo(() => {
    const map = new Map<string, SeriesDescriptor>()
    for (const desc of seriesDescriptors) {
      map.set(desc.key, desc)
    }
    return map
  }, [seriesDescriptors])

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

  const periodTotal = useMemo(
    () => visibleSeries.reduce((acc, s) => acc + s.total, 0),
    [visibleSeries]
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
        next.add(key)
      }
      return next
    })
  }

  const toggleEntitySelection = (id: number) => {
    const updater = (prev: number[]) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id)
      if (prev.length >= MAX_SELECTED_ENTITIES) return prev
      return [...prev, id]
    }
    setHiddenKeys(new Set())
    if (dimension === "node") setSelectedNodeIds(updater)
    else if (dimension === "user") setSelectedUserIds(updater)
    else if (dimension === "user_node") {
      if (pivot === "by_user") setPivotFilterNodeIds(updater)
      else setPivotFilterUserIds(updater)
    }
  }

  const resetEntitySelection = () => {
    setHiddenKeys(new Set())
    if (dimension === "node") setSelectedNodeIds([])
    if (dimension === "user") setSelectedUserIds([])
    if (dimension === "user_node") {
      if (pivot === "by_user") setPivotFilterNodeIds([])
      else setPivotFilterUserIds([])
    }
  }

  const handlePivotChange = (next: UserNodePivot) => {
    setPivot(next)
    setHiddenKeys(new Set())
    setFilterSearch("")
    setFilterOpen(false)
  }

  const chartLoading = loading || (dimension === "user_node" && customSeriesQuery.isLoading)
  const hasEntityData = dimension === "cluster" || seriesDescriptors.length > 0

  return (
    <Card className={cn("gap-0 overflow-hidden py-0", className)}>
      {/* Band 1: Unified Card Header — Title + Total KPI on left, Primary Dimension Tabs on right */}
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-2">
          <CardTitle className="flex items-center gap-1.5 text-sm font-semibold">
            <Activity className="size-3.5 text-muted-foreground" />
            {t("dashboard.chartTitle")}
          </CardTitle>
          {!chartLoading && (
            <span className="rounded-md bg-muted/70 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
              {formatBytes(periodTotal)}
            </span>
          )}
        </div>

        <Tabs
          value={dimension}
          onValueChange={(v) => handleDimensionChange((v as TrendDimension) || "cluster")}
        >
          <TabsList variant="line" size="sm">
            <TabsTrigger value="cluster" className="whitespace-nowrap">
              {t("dashboard.trend.dimCluster")}
            </TabsTrigger>
            <TabsTrigger value="node" className="whitespace-nowrap">
              {t("dashboard.trend.dimNode")}
            </TabsTrigger>
            <TabsTrigger value="user" className="whitespace-nowrap">
              {t("dashboard.trend.dimUser")}
            </TabsTrigger>
            <TabsTrigger value="user_node" className="whitespace-nowrap">
              {t("dashboard.trend.dimUserNode")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>

      {/* Band 2: Consistent Fixed-Height Control Strip — Scope/Filter on left, Metric & Chart Type on right */}
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-y border-border/60 bg-muted/20 px-5 py-1.5">
        {/* Left: Scope & Filter controls (uniform height across every dimension) */}
        <div className="flex min-h-7 flex-wrap items-center gap-1.5">
          {dimension === "cluster" && (
            <span className="text-xs text-muted-foreground">
              {t("dashboard.trend.scopeCluster")}
            </span>
          )}

          {dimension === "user_node" && (
            <>
              <Tabs
                value={pivot}
                onValueChange={(v) => handlePivotChange((v as UserNodePivot) || "by_user")}
              >
                <TabsList size="xs">
                  <TabsTrigger value="by_user" className="whitespace-nowrap">
                    {t("dashboard.trend.pivotByUser")}
                  </TabsTrigger>
                  <TabsTrigger value="by_node" className="whitespace-nowrap">
                    {t("dashboard.trend.pivotByNode")}
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {pivot === "by_user" ? (
                <Select
                  value={String(pivotUserId)}
                  onValueChange={(v) => {
                    setPivotUserId(Number(v) || 0)
                    setPivotFilterNodeIds([])
                    setHiddenKeys(new Set())
                  }}
                >
                  <SelectTrigger className="h-7 w-40 bg-background text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">{t("dashboard.trend.allUsersTop5")}</SelectItem>
                    {userOptions.map((opt) => (
                      <SelectItem key={opt.id} value={String(opt.id)}>
                        <span className="truncate">{opt.name}</span>
                        {opt.traffic > 0 && (
                          <span className="ml-1.5 font-mono text-[11px] text-muted-foreground tabular-nums">
                            ({formatBytesCompact(opt.traffic)})
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select
                  value={String(pivotNodeId)}
                  onValueChange={(v) => {
                    setPivotNodeId(Number(v) || 0)
                    setPivotFilterUserIds([])
                    setHiddenKeys(new Set())
                  }}
                >
                  <SelectTrigger className="h-7 w-40 bg-background text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">{t("dashboard.trend.allNodesTop5")}</SelectItem>
                    {nodeOptions.map((opt) => (
                      <SelectItem key={opt.id} value={String(opt.id)}>
                        <span className="truncate">{opt.name}</span>
                        {opt.traffic > 0 && (
                          <span className="ml-1.5 font-mono text-[11px] text-muted-foreground tabular-nums">
                            ({formatBytesCompact(opt.traffic)})
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </>
          )}

          {filterTargetKind !== null && (
            <Popover open={filterOpen} onOpenChange={setFilterOpen}>
              <PopoverTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    className="h-7 gap-1.5 bg-background px-2.5 text-xs"
                  />
                }
              >
                <SlidersHorizontal className="size-3 text-muted-foreground" />
                <span>
                  {activeSelectedIds.length > 0
                    ? filterTargetKind === "node"
                      ? t("dashboard.trend.selectedNodes", { count: activeSelectedIds.length })
                      : t("dashboard.trend.selectedUsers", { count: activeSelectedIds.length })
                    : t("dashboard.trend.top5Default")}
                </span>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-68 gap-2 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-foreground">
                    {filterTargetKind === "node"
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
                      filterTargetKind === "node"
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
                      const disabled = !checked && activeSelectedIds.length >= MAX_SELECTED_ENTITIES
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

        {/* Right: Metric + Chart Type (anchored identically on all 4 dimensions) */}
        <div className="flex shrink-0 items-center gap-1.5">
          <Tabs
            value={metric}
            onValueChange={(v) => setMetric((v as TrendTrafficMetric) || "total")}
          >
            <TabsList size="xs">
              <TabsTrigger value="total">{t("dashboard.metricTotal")}</TabsTrigger>
              <TabsTrigger value="download">{t("dashboard.metricDownload")}</TabsTrigger>
              <TabsTrigger value="upload">{t("dashboard.metricUpload")}</TabsTrigger>
            </TabsList>
          </Tabs>

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

      {/* Band 3: Fixed-Position Chart Canvas + Footer Interactive Legend */}
      <CardContent className="space-y-2.5 px-5 py-4">
        {chartLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : !hasEntityData ? (
          <div className="flex h-56 flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/20 px-4 text-center">
            <div className="mb-1.5 text-muted-foreground">
              {dimension === "node" ? (
                <Server className="size-4" />
              ) : dimension === "user_node" ? (
                <Layers className="size-4" />
              ) : (
                <Users className="size-4" />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {dimension === "node"
                ? t("dashboard.nodeTrafficEmpty")
                : dimension === "user_node"
                  ? t("dashboard.trend.userNodeEmpty")
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

        {/* Fixed-height footer interactive legend strip (keeps chart canvas anchored across all tabs) */}
        <div className="flex min-h-6 flex-wrap items-center gap-1.5">
          {!chartLoading &&
            seriesDescriptors.map((item) => {
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
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                    {formatBytesCompact(item.total)}
                  </span>
                </button>
              )
            })}
        </div>
      </CardContent>
    </Card>
  )
}
