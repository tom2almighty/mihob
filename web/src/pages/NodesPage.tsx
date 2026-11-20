import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import {
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  Radio,
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
  ConfirmDeleteDialog,
  EmptyState,
  ErrorState,
  PageHeader,
  TrafficProgress,
} from "@/components/common/CommonUI"
import { Badge } from "@/components/ui/badge"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api, queryKeys } from "@/lib/api"
import { daysUntil, formatDateShort, formatRate } from "@/lib/format"
import type { Node } from "@/lib/types"
import { useDragReorder } from "@/lib/useDragReorder"
import { cn } from "@/lib/utils"
import { InboundManagerSheet } from "./nodes/InboundManagerSheet"
import { InstallCommandDialog } from "./nodes/InstallCommandDialog"
import { NodeFormDialog } from "./nodes/NodeFormDialog"

export function NodesPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline">("all")
  const [formOpen, setFormOpen] = useState(false)
  const [editingNode, setEditingNode] = useState<Node | null>(null)
  const [installNodeId, setInstallNodeId] = useState<number | null>(null)
  const [inboundNodeId, setInboundNodeId] = useState<number | null>(null)
  const [deletingNode, setDeletingNode] = useState<Node | null>(null)

  const query = useQuery({
    queryKey: queryKeys.nodes,
    queryFn: api.listNodes,
    refetchInterval: 8_000,
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

  const pushMutation = useMutation({
    mutationFn: (id: number) => api.pushNodeConfig(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.nodes })
      toast.success(t("nodes.toastPushed"))
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const restartMutation = useMutation({
    mutationFn: (id: number) => api.restartNode(id),
    onSuccess: () => toast.success(t("nodes.toastRestarted")),
    onError: (err: Error) => toast.error(err.message),
  })

  const resetTrafficMutation = useMutation({
    mutationFn: (id: number) => api.resetNodeTraffic(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.nodes })
      toast.success(t("nodes.toastTrafficReset"))
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

  const filtered = allNodes.filter((n) => {
    if (statusFilter === "online" && !n.online) return false
    if (statusFilter === "offline" && n.online) return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      n.name.toLowerCase().includes(q) ||
      n.host.toLowerCase().includes(q) ||
      n.region.toLowerCase().includes(q)
    )
  })

  const hasActiveFilter = Boolean(search.trim()) || statusFilter !== "all"
  const canDrag = !hasActiveFilter && filtered.length > 1

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
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("nodes.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-8 pl-9"
          />
          {search && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-1/2 right-1 size-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setSearch("")}
              aria-label={t("common.clearSearch")}
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
          {(
            [
              { key: "all", label: t("nodes.filterAll"), count: allNodes.length },
              { key: "online", label: t("nodes.online"), count: onlineCount },
              { key: "offline", label: t("nodes.offline"), count: offlineCount },
            ] as const
          ).map((item) => (
            <Button
              key={item.key}
              type="button"
              variant={statusFilter === item.key ? "secondary" : "ghost"}
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-xs"
              onClick={() => setStatusFilter(item.key)}
            >
              <span>{item.label}</span>
              <span className="font-mono text-muted-foreground tabular-nums">{item.count}</span>
            </Button>
          ))}
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
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
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
              {filtered.map((n) => (
                <TableRow
                  key={n.id}
                  {...getRowDragProps(n.id)}
                  className={cn(
                    draggingId === n.id && "opacity-40",
                    overId === n.id && draggingId !== n.id && "bg-accent/50 ring-1 ring-inset ring-primary/40"
                  )}
                >
                  <TableCell className="w-8 px-2">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span
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
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`size-2 shrink-0 rounded-full ${
                            n.online ? "bg-success" : "bg-muted-foreground/40"
                          }`}
                        />
                        <span className="font-medium text-foreground">{n.name}</span>
                        {n.region && (
                          <Badge variant="secondary" className="text-xs font-normal">
                            {n.region}
                          </Badge>
                        )}
                        {!n.enabled && (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            {t("common.disabled")}
                          </Badge>
                        )}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">{n.host}</div>
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant={n.online ? "secondary" : "outline"}
                          className={
                            n.online
                              ? "bg-success/15 text-success hover:bg-success/20"
                              : "text-muted-foreground"
                          }
                        >
                          {n.online ? t("nodes.online") : t("nodes.offline")}
                        </Badge>
                        {n.config_status === "error" ? (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Badge variant="destructive" className="cursor-help text-xs">
                                  {t("nodes.configError")}
                                </Badge>
                              }
                            />
                            <TooltipContent className="max-w-xs break-words">
                              {n.config_error || t("nodes.configErrorFallback")}
                            </TooltipContent>
                          </Tooltip>
                        ) : n.config_status === "synced" ? (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            {t("nodes.synced")}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-warning/40 text-xs text-warning">
                            {t("nodes.pending")}
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
                        {n.agent_version || n.mihomo_version ? (
                          <>
                            {n.agent_version && <span>Agent {n.agent_version}</span>}
                            {n.agent_version && n.mihomo_version && (
                              <span className="opacity-40">·</span>
                            )}
                            {n.mihomo_version && <span>{n.mihomo_version}</span>}
                          </>
                        ) : (
                          <span className="font-sans text-xs">{t("nodes.waitingAgent")}</span>
                        )}
                      </div>
                    </div>
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
                    <TrafficProgress used={n.traffic_used} limit={n.traffic_limit} />
                  </TableCell>

                  <TableCell className="text-xs tabular-nums">
                    <div className="flex flex-wrap items-center gap-1.5 text-foreground">
                      <span>{t("nodes.multiplierText", { value: n.traffic_multiplier })}</span>
                      {n.billing_cycle && (
                        <Badge variant="outline" className="px-1.5 py-0 text-[11px] font-normal">
                          {t(`nodes.billingCycles.${n.billing_cycle}` as "nodes.billingCycles.monthly")}
                        </Badge>
                      )}
                    </div>
                    <div className="text-muted-foreground">
                      {t("nodes.protocolResetText", {
                        count: n.inbound_count,
                        day: n.reset_day,
                      })}
                    </div>
                    {n.expire_at && (() => {
                      const days = daysUntil(n.expire_at)
                      const tone =
                        days !== null && days <= 0
                          ? "text-destructive font-medium"
                          : days !== null && days <= 14
                            ? "text-warning font-medium"
                            : "text-muted-foreground"
                      return (
                        <div className={tone}>
                          {days !== null && days <= 0
                            ? t("nodes.expired")
                            : `${formatDateShort(n.expire_at)} (${t("nodes.daysLeft", { days: days ?? 0 })})`}
                        </div>
                      )
                    })()}
                  </TableCell>

                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="outline" size="sm" onClick={() => setInboundNodeId(n.id)}>
                        <Radio className="mr-1.5 size-3.5" />
                        {t("nodes.btnProtocol")}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setInstallNodeId(n.id)}>
                        <Terminal className="mr-1.5 size-3.5" />
                        {t("nodes.btnDeploy")}
                      </Button>
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
                            onClick={() => {
                              setEditingNode(n)
                              setFormOpen(true)
                            }}
                          >
                            <Pencil className="mr-2 size-4" />
                            {t("nodes.editNode")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => pushMutation.mutate(n.id)}>
                            <Send className="mr-2 size-4" />
                            {t("nodes.pushConfig")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => restartMutation.mutate(n.id)}>
                            <RotateCcw className="mr-2 size-4" />
                            {t("nodes.restartMihomo")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => resetTrafficMutation.mutate(n.id)}>
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
    </div>
  )
}
