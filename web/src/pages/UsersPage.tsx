import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"
import {
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Users as UsersIcon,
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
import { api, queryKeys } from "@/lib/api"
import { daysUntil, formatDateShort } from "@/lib/format"
import type { User } from "@/lib/types"
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

  const filtered = (query.data ?? []).filter((u) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      u.username.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.remark.toLowerCase().includes(q)
    )
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

      <div className="flex items-center gap-3">
        <Input
          placeholder={t("users.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        {search && (
          <Button variant="ghost" size="sm" onClick={() => setSearch("")}>
            {t("common.reset")}
          </Button>
        )}
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
          title={search ? t("users.emptySearchTitle") : t("users.emptyTitle")}
          description={search ? t("users.emptySearchDesc") : t("users.emptyDesc")}
          action={
            !search && (
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
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("users.colUser")}</TableHead>
                <TableHead>{t("users.colStatus")}</TableHead>
                <TableHead className="w-56">{t("users.colTraffic")}</TableHead>
                <TableHead>{t("users.colExpire")}</TableHead>
                <TableHead>{t("users.colNodes")}</TableHead>
                <TableHead className="text-right">{t("users.colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u) => {
                const st = getUserStatus(u, t)
                return (
                  <TableRow key={u.id}>
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
                      <Badge variant="outline">
                        {t("users.nodeCount", { count: u.node_ids.length })}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="outline" size="sm" onClick={() => setSubUserId(u.id)}>
                          <Link2 className="mr-1.5 size-3.5" />
                          {t("users.btnSub")}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              aria-label={t("users.moreActions")}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
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
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleting(u)}
                            >
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
