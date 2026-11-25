import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import {
  ArrowUpCircle,
  GripVertical,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Server,
  Terminal,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"
import {
  ConfirmActionDialog,
  ConfirmDeleteDialog,
  EmptyState,
  ErrorState,
  PageHeader,
  TablePagination,
  TrafficModeToggle,
  TrafficProgress,
} from "@/components/common/CommonUI"
import {
  canUpgradeNode,
  isVersionOlder,
  NodeIdentity,
  NodeMetaSummary,
  NodeStatusCell,
} from "@/components/common/NodeDisplay"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api, queryKeys } from "@/lib/api"
import { formatRate } from "@/lib/format"
import { useNodeTrafficDisplayMode } from "@/lib/trafficDisplay"
import type { Node } from "@/lib/types"
import { useDragReorder } from "@/lib/useDragReorder"
import { cn } from "@/lib/utils"
import { InboundManagerSheet } from "./nodes/InboundManagerSheet"
import { InstallCommandDialog } from "./nodes/InstallCommandDialog"
import { NodeFormDialog } from "./nodes/NodeFormDialog"

export function NodesPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [trafficMode, setTrafficMode] = useNodeTrafficDisplayMode()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline">("all")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [formOpen, setFormOpen] = useState(false)
  const [editingNode, setEditingNode] = useState<Node | null>(null)
  const [installNodeId, setInstallNodeId] = useState<number | null>(null)
  const [inboundNodeId, setInboundNodeId] = useState<number | null>(null)
  const [deletingNode, setDeletingNode] = useState<Node | null>(null)
  const [pendingAction, setPendingAction] = useState<{
    type: "push" | "restart" | "resetTraffic"
    node: Node
  } | null>(null)
  const [upgradeTarget, setUpgradeTarget] = useState<
    { mode: "single"; node: Node } | { mode: "batch"; nodes: Node[] } | null
  >(null)
  const [refreshingRelease, setRefreshingRelease] = useState(false)

  const query = useQuery({
    queryKey: queryKeys.nodes,
    queryFn: api.listNodes,
    refetchInterval: (q) => {
      const list = q.state.data ?? []
      return list.some((n) => n.upgrade_status === "upgrading") ? 2_500 : 8_000
    },
  })

  const latestMihomoQuery = useQuery({
    queryKey: queryKeys.mihomoLatest,
    queryFn: () => api.getLatestMihomo(false),
    staleTime: 5 * 60_000,
    retry: false,
  })

  const latestVersion = latestMihomoQuery.data?.version ?? ""

  const handleRefreshLatest = async () => {
    setRefreshingRelease(true)
    try {
      const fresh = await api.getLatestMihomo(true)
      qc.setQueryData(queryKeys.mihomoLatest, fresh)
      toast.success(t("nodes.mihomo.checkedToast", { version: fresh.version }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.loadFailed"))
    } finally {
      setRefreshingRelease(false)
    }
  }

  const upgradeSingleMutation = useMutation({
    mutationFn: ({ id, version }: { id: number; version?: string }) =>
      api.upgradeNodeMihomo(id, version),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: queryKeys.nodes })
      toast.success(t("nodes.mihomo.toastStarted", { version: res.version }))
      setUpgradeTarget(null)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const upgradeBatchMutation = useMutation({
    mutationFn: ({ nodeIds, version }: { nodeIds: number[]; version?: string }) =>
      api.batchUpgradeMihomo(nodeIds, version),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: queryKeys.nodes })
      toast.success(
        t("nodes.mihomo.toastBatchStarted", {
          count: res.started.length,
          version: res.version,
        })
      )
      setUpgradeTarget(null)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const installNode = (query.data ?? []).find((n) => n.id === installNodeId) ?? null
  const inboundNode = (query.data ?? []).find((n) => n.id === inboundNodeId) ?? null

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteNode(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.nodes })
      qc.invalidateQueries({ queryKey: queryKeys.dashboard })
      toast.success(t("nodes.toastDeleted"))
      setDeletingNode(null)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      api.setNodeEnabled(id, enabled),
    onSuccess: (updated) => {
      qc.setQueryData<Node[]>(queryKeys.nodes, (prev) =>
        prev?.map((item) => (item.id === updated.id ? updated : item))
      )
      qc.invalidateQueries({ queryKey: queryKeys.nodes })
      qc.invalidateQueries({ queryKey: queryKeys.dashboard })
      toast.success(updated.enabled ? t("nodes.toastEnabled") : t("nodes.toastDisabled"))
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const pushMutation = useMutation({
    mutationFn: (id: number) => api.pushNodeConfig(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.nodes })
      toast.success(t("nodes.toastPushed"))
      setPendingAction(null)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const restartMutation = useMutation({
    mutationFn: (id: number) => api.restartNode(id),
    onSuccess: () => {
      toast.success(t("nodes.toastRestarted"))
      setPendingAction(null)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const resetTrafficMutation = useMutation({
    mutationFn: (id: number) => api.resetNodeTraffic(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.nodes })
      toast.success(t("nodes.toastTrafficReset"))
      setPendingAction(null)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const reorderMutation = useMutation({
    mutationFn: (ids: number[]) => api.reorderNodes(ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.dashboard })
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: queryKeys.nodes })
      toast.error(t("common.reorderFailed"))
    },
  })

  const allNodes = query.data ?? []
  const onlineCount = allNodes.filter((n) => n.online).length
  const offlineCount = allNodes.length - onlineCount
  const upgradableNodes = useMemo(
    () =>
      latestVersion
        ? allNodes.filter(
            (n) => canUpgradeNode(n) && isVersionOlder(n.mihomo_version, latestVersion)
          )
        : [],
    [allNodes, latestVersion]
  )

  const filtered = allNodes.filter((n) => {
    if (statusFilter === "online" && !n.online) return false
    if (statusFilter === "offline" && n.online) return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      n.name.toLowerCase().includes(q) ||
      n.host.toLowerCase().includes(q) ||
      n.region.toLowerCase().includes(q) ||
      (n.tags ?? []).some((tag) => tag.toLowerCase().includes(q))
    )
  })

  const hasActiveFilter = Boolean(search.trim()) || statusFilter !== "all"
  const canDrag = !hasActiveFilter && filtered.length > 1

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pagedNodes = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  const { draggingId, overId, getRowDragProps } = useDragReorder({
    items: allNodes,
    enabled: canDrag,
    onReorder: (nextItems, nextIds) => {
      qc.setQueryData<Node[]>(queryKeys.nodes, nextItems)
      reorderMutation.mutate(nextIds)
    },
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("nodes.title")}
        description={t("nodes.description")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {latestVersion && (
              <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs shadow-2xs">
                <span className="text-muted-foreground">{t("nodes.mihomo.latestLabel")}</span>
                <span className="font-mono font-medium text-foreground">{latestVersion}</span>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="size-6 text-muted-foreground hover:text-foreground"
                        onClick={() => void handleRefreshLatest()}
                        disabled={refreshingRelease}
                        aria-label={t("nodes.mihomo.refreshAria")}
                      >
                        <RefreshCw className={cn("size-3", refreshingRelease && "animate-spin")} />
                      </Button>
                    }
                  />
                  <TooltipContent>{t("nodes.mihomo.refreshTooltip")}</TooltipContent>
                </Tooltip>
              </div>
            )}
            {!latestVersion && latestMihomoQuery.isError && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleRefreshLatest()}
                      disabled={refreshingRelease}
                      className="text-xs text-muted-foreground"
                    >
                      <RefreshCw
                        className={cn("mr-1.5 size-3.5", refreshingRelease && "animate-spin")}
                      />
                      {t("nodes.mihomo.checkUpdate")}
                    </Button>
                  }
                />
                <TooltipContent className="max-w-xs">
                  {latestMihomoQuery.error.message}
                </TooltipContent>
              </Tooltip>
            )}
            {upgradableNodes.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setUpgradeTarget({ mode: "batch", nodes: upgradableNodes })}
              >
                <ArrowUpCircle className="mr-1.5 size-4 text-primary" />
                {t("nodes.mihomo.upgradeAll", { count: upgradableNodes.length })}
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => {
                setEditingNode(null)
                setFormOpen(true)
              }}
            >
              <Plus className="mr-1.5 size-4" />
              {t("nodes.createNode")}
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("nodes.searchPlaceholder")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="pr-8 pl-9"
          />
          {search && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-1/2 right-1 size-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => {
                setSearch("")
                setPage(1)
              }}
              aria-label={t("common.clearSearch")}
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <TrafficModeToggle value={trafficMode} onChange={setTrafficMode} />
          <Tabs
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter((v as "all" | "online" | "offline") || "all")
              setPage(1)
            }}
          >
            <TabsList size="sm">
              {(
                [
                  { key: "all", label: t("nodes.filterAll"), count: allNodes.length },
                  { key: "online", label: t("nodes.online"), count: onlineCount },
                  { key: "offline", label: t("nodes.offline"), count: offlineCount },
                ] as const
              ).map((item) => (
                <TabsTrigger key={item.key} value={item.key} className="gap-1.5">
                  <span>{item.label}</span>
                  <span className="font-mono text-[11px] opacity-70 tabular-nums">
                    {item.count}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      {query.isError ? (
        <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <div className="space-y-2.5">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : !filtered.length ? (
        <EmptyState
          icon={<Server className="size-5" />}
          title={hasActiveFilter ? t("nodes.emptySearchTitle") : t("nodes.emptyTitle")}
          description={hasActiveFilter ? t("nodes.emptySearchDesc") : t("nodes.emptyDesc")}
          action={
            !hasActiveFilter && (
              <Button
                size="sm"
                onClick={() => {
                  setEditingNode(null)
                  setFormOpen(true)
                }}
              >
                <Plus className="mr-1.5 size-4" />
                {t("nodes.createFirst")}
              </Button>
            )
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8 px-2" />
                <TableHead>{t("nodes.colNode")}</TableHead>
                <TableHead>{t("nodes.colStatus")}</TableHead>
                <TableHead>{t("nodes.colRate")}</TableHead>
                <TableHead className="w-52">{t("nodes.colTraffic")}</TableHead>
                <TableHead>{t("nodes.colMultiplier")}</TableHead>
                <TableHead className="text-right">{t("nodes.colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedNodes.map((n) => (
                <TableRow
                  key={n.id}
                  {...getRowDragProps(n.id)}
                  className={cn(
                    draggingId === n.id && "opacity-40",
                    overId === n.id &&
                      draggingId !== n.id &&
                      "bg-accent/50 ring-1 ring-inset ring-primary/40"
                  )}
                >
                  <TableCell className="w-8 px-2">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span
                            role="img"
                            className={cn(
                              "inline-flex items-center justify-center text-muted-foreground/60",
                              canDrag
                                ? "cursor-grab hover:text-foreground active:cursor-grabbing"
                                : "cursor-not-allowed opacity-40"
                            )}
                            aria-label={t("common.dragToReorder")}
                          >
                            <GripVertical className="size-4" />
                          </span>
                        }
                      />
                      <TooltipContent side="right">
                        {canDrag ? t("common.dragToReorder") : t("common.dragDisabledFiltered")}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <NodeIdentity node={n} showTags />
                  </TableCell>

                  <TableCell>
                    <NodeStatusCell
                      node={n}
                      latestVersion={latestVersion}
                      onUpgrade={(target) => setUpgradeTarget({ mode: "single", node: target })}
                    />
                  </TableCell>

                  <TableCell className="text-xs tabular-nums">
                    <div className="font-medium text-foreground">
                      {formatRate(n.up_rate + n.down_rate)}
                    </div>
                    <div className="text-muted-foreground">
                      {t("nodes.activeConnections", { count: n.active_connections })}
                    </div>
                  </TableCell>

                  <TableCell>
                    <TrafficProgress
                      used={n.traffic_used}
                      limit={n.traffic_limit}
                      mode={trafficMode}
                    />
                  </TableCell>

                  <TableCell>
                    <NodeMetaSummary node={n} />
                  </TableCell>

                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span className="inline-flex items-center">
                              <Switch
                                size="sm"
                                checked={n.enabled}
                                disabled={
                                  toggleMutation.isPending && toggleMutation.variables?.id === n.id
                                }
                                onCheckedChange={(checked) =>
                                  toggleMutation.mutate({ id: n.id, enabled: checked })
                                }
                                aria-label={t("nodes.toggleAria")}
                              />
                            </span>
                          }
                        />
                        <TooltipContent>
                          {n.enabled ? t("nodes.disableTooltip") : t("nodes.enableTooltip")}
                        </TooltipContent>
                      </Tooltip>
                      <Button variant="outline" size="sm" onClick={() => setInboundNodeId(n.id)}>
                        <Radio className="mr-1.5 size-3.5" />
                        {t("nodes.btnProtocol")}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setInstallNodeId(n.id)}>
                        <Terminal className="mr-1.5 size-3.5" />
                        {t("nodes.btnDeploy")}
                      </Button>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              aria-label={t("nodes.editNode")}
                              onClick={() => {
                                setEditingNode(n)
                                setFormOpen(true)
                              }}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                          }
                        />
                        <TooltipContent>{t("nodes.editNode")}</TooltipContent>
                      </Tooltip>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              aria-label={t("nodes.moreActions")}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => setPendingAction({ type: "push", node: n })}
                          >
                            <Send className="mr-2 size-4" />
                            {t("nodes.pushConfig")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setPendingAction({ type: "restart", node: n })}
                          >
                            <RotateCcw className="mr-2 size-4" />
                            {t("nodes.restartMihomo")}
                          </DropdownMenuItem>
                          {(() => {
                            const hasUpdate = Boolean(
                              latestVersion && isVersionOlder(n.mihomo_version, latestVersion)
                            )
                            const alreadyLatest = Boolean(
                              latestVersion &&
                                n.mihomo_version &&
                                !isVersionOlder(n.mihomo_version, latestVersion)
                            )
                            const disabled = !canUpgradeNode(n) || !hasUpdate
                            const label = alreadyLatest
                              ? t("nodes.mihomo.alreadyLatest")
                              : latestVersion
                                ? t("nodes.mihomo.upgradeMenuWithVer", { version: latestVersion })
                                : t("nodes.mihomo.upgradeMenu")
                            return (
                              <DropdownMenuItem
                                disabled={disabled}
                                onClick={() => setUpgradeTarget({ mode: "single", node: n })}
                              >
                                <ArrowUpCircle className="mr-2 size-4" />
                                {label}
                              </DropdownMenuItem>
                            )
                          })()}
                          <DropdownMenuItem
                            onClick={() => setPendingAction({ type: "resetTraffic", node: n })}
                          >
                            <RotateCcw className="mr-2 size-4" />
                            {t("nodes.resetTraffic")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setDeletingNode(n)}
                          >
                            <Trash2 className="mr-2 size-4" />
                            {t("nodes.deleteNode")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination
            total={filtered.length}
            page={safePage}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      )}

      <NodeFormDialog open={formOpen} onOpenChange={setFormOpen} node={editingNode} />
      <InstallCommandDialog
        node={installNode}
        open={Boolean(installNode)}
        onOpenChange={(o) => !o && setInstallNodeId(null)}
      />
      <InboundManagerSheet
        node={inboundNode}
        open={Boolean(inboundNode)}
        onOpenChange={(o) => !o && setInboundNodeId(null)}
      />
      <ConfirmDeleteDialog
        open={Boolean(deletingNode)}
        onOpenChange={(o) => !o && setDeletingNode(null)}
        title={t("nodes.deleteTitle")}
        description={t("nodes.deleteDesc", { name: deletingNode?.name ?? "" })}
        confirmName={deletingNode?.name}
        loading={deleteMutation.isPending}
        onConfirm={() => deletingNode && deleteMutation.mutate(deletingNode.id)}
      />

      <ConfirmActionDialog
        open={Boolean(pendingAction)}
        onOpenChange={(o) => !o && setPendingAction(null)}
        title={
          pendingAction?.type === "push"
            ? t("nodes.confirmPushTitle", { name: pendingAction.node.name })
            : pendingAction?.type === "restart"
              ? t("nodes.confirmRestartTitle", { name: pendingAction.node.name })
              : t("nodes.confirmResetTrafficTitle", { name: pendingAction?.node.name ?? "" })
        }
        description={
          pendingAction?.type === "push"
            ? pendingAction.node.online
              ? t("nodes.confirmPushDesc")
              : t("nodes.confirmPushOfflineDesc")
            : pendingAction?.type === "restart"
              ? t("nodes.confirmRestartDesc")
              : t("nodes.confirmResetTrafficDesc")
        }
        confirmLabel={
          pendingAction?.type === "push"
            ? t("nodes.confirmPushAction")
            : pendingAction?.type === "restart"
              ? t("nodes.confirmRestartAction")
              : t("nodes.confirmResetTrafficAction")
        }
        variant={pendingAction?.type === "resetTraffic" ? "destructive" : "default"}
        loading={
          pushMutation.isPending || restartMutation.isPending || resetTrafficMutation.isPending
        }
        onConfirm={() => {
          if (!pendingAction) return
          if (pendingAction.type === "push") {
            pushMutation.mutate(pendingAction.node.id)
          } else if (pendingAction.type === "restart") {
            restartMutation.mutate(pendingAction.node.id)
          } else {
            resetTrafficMutation.mutate(pendingAction.node.id)
          }
        }}
      />

      <AlertDialog open={Boolean(upgradeTarget)} onOpenChange={(o) => !o && setUpgradeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {upgradeTarget?.mode === "batch"
                ? t("nodes.mihomo.batchDialogTitle", {
                    count: upgradeTarget.nodes.length,
                    version: latestVersion,
                  })
                : t("nodes.mihomo.singleDialogTitle", {
                    name: upgradeTarget?.node.name ?? "",
                    version: latestVersion,
                  })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("nodes.mihomo.dialogDesc", { version: latestVersion })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {latestMihomoQuery.isError && (
            <p className="text-xs text-muted-foreground">
              <Link to="/settings?tab=deployment" className="underline hover:text-foreground">
                {t("nodes.mihomo.configureTokenHint")}
              </Link>
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={upgradeSingleMutation.isPending || upgradeBatchMutation.isPending}
            >
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={upgradeSingleMutation.isPending || upgradeBatchMutation.isPending}
              onClick={() => {
                if (!upgradeTarget) return
                if (upgradeTarget.mode === "single") {
                  upgradeSingleMutation.mutate({
                    id: upgradeTarget.node.id,
                    version: latestVersion || undefined,
                  })
                } else {
                  upgradeBatchMutation.mutate({
                    nodeIds: upgradeTarget.nodes.map((n) => n.id),
                    version: latestVersion || undefined,
                  })
                }
              }}
            >
              {(upgradeSingleMutation.isPending || upgradeBatchMutation.isPending) && (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              )}
              {t("nodes.mihomo.confirmUpgrade")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
