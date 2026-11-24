import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"
import {
  GripVertical,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Users as UsersIcon,
  X,
} from "lucide-react"
import { toast } from "sonner"
import {
  ConfirmDeleteDialog,
  EmptyState,
  ErrorState,
  PageHeader,
  TablePagination,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api, queryKeys } from "@/lib/api"
import { daysUntil, formatDateShort } from "@/lib/format"
import type { User } from "@/lib/types"
import { useDragReorder } from "@/lib/useDragReorder"
import { cn } from "@/lib/utils"
import { UserFormDialog } from "./users/UserFormDialog"
import { UserSubDialog } from "./users/UserSubDialog"

function getUserStatus(u: User, t: TFunction): { label: string; className: string } {
  if (!u.enabled) {
    return { label: t("users.statusDisabled"), className: "bg-muted text-muted-foreground" }
  }
  const days = daysUntil(u.expire_at)
  if (days !== null && days <= 0) {
    return { label: t("users.statusExpired"), className: "bg-destructive/15 text-destructive" }
  }
  if (u.traffic_limit > 0 && u.traffic_used >= u.traffic_limit) {
    return { label: t("users.statusExhausted"), className: "bg-destructive/15 text-destructive" }
  }
  if (days !== null && days <= 7) {
    return { label: t("users.statusExpiring"), className: "bg-warning/15 text-warning" }
  }
  return { label: t("users.statusActive"), className: "bg-success/15 text-success" }
}

export function UsersPage() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "expiring" | "inactive">(
    "all"
  )
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [subUserId, setSubUserId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<User | null>(null)

  const query = useQuery({
    queryKey: queryKeys.users,
    queryFn: api.listUsers,
  })

  const subUser = (query.data ?? []).find((u) => u.id === subUserId) ?? null

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.users })
      qc.invalidateQueries({ queryKey: queryKeys.dashboard })
      toast.success(t("users.toastDeleted"))
      setDeleting(null)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const resetTrafficMutation = useMutation({
    mutationFn: (id: number) => api.resetUserTraffic(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.users })
      toast.success(t("users.toastTrafficReset"))
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const reorderMutation = useMutation({
    mutationFn: (ids: number[]) => api.reorderUsers(ids),
    onError: () => {
      qc.invalidateQueries({ queryKey: queryKeys.users })
      toast.error(t("common.reorderFailed"))
    },
  })

  const getUserBucket = (u: User): "active" | "expiring" | "inactive" => {
    if (!u.enabled) return "inactive"
    const days = daysUntil(u.expire_at)
    if (days !== null && days <= 0) return "inactive"
    if (u.traffic_limit > 0 && u.traffic_used >= u.traffic_limit) return "inactive"
    if (days !== null && days <= 7) return "expiring"
    return "active"
  }

  const allUsers = query.data ?? []
  const activeCount = allUsers.filter((u) => getUserBucket(u) === "active").length
  const expiringCount = allUsers.filter((u) => getUserBucket(u) === "expiring").length
  const inactiveCount = allUsers.filter((u) => getUserBucket(u) === "inactive").length

  const filtered = allUsers.filter((u) => {
    if (statusFilter !== "all" && getUserBucket(u) !== statusFilter) return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      u.username.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.remark.toLowerCase().includes(q)
    )
  })

  const hasActiveFilter = Boolean(search.trim()) || statusFilter !== "all"
  const canDrag = !hasActiveFilter && filtered.length > 1

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pagedUsers = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  const { draggingId, overId, getRowDragProps } = useDragReorder({
    items: allUsers,
    enabled: canDrag,
    onReorder: (nextItems, nextIds) => {
      qc.setQueryData<User[]>(queryKeys.users, nextItems)
      reorderMutation.mutate(nextIds)
    },
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("users.title")}
        description={t("users.description")}
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus className="mr-1.5 size-4" />
            {t("users.createUser")}
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("users.searchPlaceholder")}
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

        <Tabs
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter((v as "all" | "active" | "expiring" | "inactive") || "all")
            setPage(1)
          }}
        >
          <TabsList size="sm" className="h-auto flex-wrap">
            {(
              [
                { key: "all", label: t("users.filterAll"), count: allUsers.length },
                { key: "active", label: t("users.statusActive"), count: activeCount },
                { key: "expiring", label: t("users.statusExpiring"), count: expiringCount },
                { key: "inactive", label: t("users.filterInactive"), count: inactiveCount },
              ] as const
            ).map((item) => (
              <TabsTrigger key={item.key} value={item.key} className="gap-1.5">
                <span>{item.label}</span>
                <span className="font-mono text-[11px] opacity-70 tabular-nums">{item.count}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {query.isError ? (
        <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <div className="space-y-2.5">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : !filtered.length ? (
        <EmptyState
          icon={<UsersIcon className="size-5" />}
          title={hasActiveFilter ? t("users.emptySearchTitle") : t("users.emptyTitle")}
          description={hasActiveFilter ? t("users.emptySearchDesc") : t("users.emptyDesc")}
          action={
            !hasActiveFilter && (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null)
                  setFormOpen(true)
                }}
              >
                <Plus className="mr-1.5 size-4" />
                {t("users.createFirst")}
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
                <TableHead>{t("users.colUser")}</TableHead>
                <TableHead>{t("users.colStatus")}</TableHead>
                <TableHead className="w-56">{t("users.colTraffic")}</TableHead>
                <TableHead>{t("users.colExpire")}</TableHead>
                <TableHead>{t("users.colNodes")}</TableHead>
                <TableHead className="text-right">{t("users.colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedUsers.map((u) => {
                const st = getUserStatus(u, t)
                return (
                  <TableRow
                    key={u.id}
                    {...getRowDragProps(u.id)}
                    className={cn(
                      draggingId === u.id && "opacity-40",
                      overId === u.id &&
                        draggingId !== u.id &&
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
                      <div className="space-y-0.5">
                        <div className="font-medium text-foreground">{u.username}</div>
                        <div className="text-xs text-muted-foreground">
                          {u.email || u.remark || t("common.noRemark")}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={st.className}>
                        {st.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <TrafficProgress used={u.traffic_used} limit={u.traffic_limit} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {formatDateShort(u.expire_at, i18n.language)}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {(() => {
                        const mode = u.access_policy?.node_mode || "all"
                        const inbMode = u.access_policy?.inbound_mode || "all"
                        const isAll = mode === "all" && inbMode === "all"
                        const isManual = mode === "manual" || inbMode === "manual"
                        const key = isAll
                          ? "users.accessBadgeAll"
                          : isManual && mode !== "rule" && inbMode !== "rule"
                            ? "users.accessBadgeManual"
                            : "users.accessBadgeRule"
                        return (
                          <Badge variant={isAll ? "secondary" : "outline"}>
                            {t(key, {
                              nodes: u.node_ids.length,
                              inbounds: u.inbound_count ?? 0,
                            })}
                          </Badge>
                        )
                      })()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="outline" size="sm" onClick={() => setSubUserId(u.id)}>
                          <Link2 className="mr-1.5 size-3.5" />
                          {t("users.btnSub")}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                aria-label={t("users.moreActions")}
                              >
                                <MoreHorizontal className="size-4" />
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setEditing(u)
                                setFormOpen(true)
                              }}
                            >
                              <Pencil className="mr-2 size-4" />
                              {t("users.editUser")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => resetTrafficMutation.mutate(u.id)}>
                              <RotateCcw className="mr-2 size-4" />
                              {t("users.resetTraffic")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onClick={() => setDeleting(u)}>
                              <Trash2 className="mr-2 size-4" />
                              {t("users.deleteUser")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
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

      <UserFormDialog open={formOpen} onOpenChange={setFormOpen} user={editing} />
      <UserSubDialog
        user={subUser}
        open={Boolean(subUser)}
        onOpenChange={(o) => !o && setSubUserId(null)}
      />
      <ConfirmDeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t("users.deleteTitle")}
        description={t("users.deleteDesc", { name: deleting?.username ?? "" })}
        confirmName={deleting?.username}
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
      />
    </div>
  )
}
