import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Eye, History, RefreshCw, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { ConfirmDeleteDialog, EmptyState, ErrorState } from "@/components/common/CommonUI"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { formatDateTime } from "@/lib/format"
import type { NotificationLog } from "@/lib/types"
import { cn } from "@/lib/utils"

const KNOWN_EVENTS = new Set([
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
  "scheduled_report",
  "test",
])

export function LogsTab() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const [inspecting, setInspecting] = useState<NotificationLog | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const query = useQuery({
    queryKey: queryKeys.notificationLogs,
    queryFn: api.listNotificationLogs,
  })

  const clearMutation = useMutation({
    mutationFn: api.clearNotificationLogs,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notificationLogs })
      toast.success(t("notifications.logs.toastCleared"))
      setConfirmClear(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const logs = query.data ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t("notifications.logs.intro")}</p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw className={cn("mr-1.5 size-3.5", query.isFetching && "animate-spin")} />
            {t("notifications.logs.refreshBtn")}
          </Button>
          {logs.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setConfirmClear(true)}
            >
              <Trash2 className="mr-1.5 size-3.5" />
              {t("notifications.logs.clearBtn")}
            </Button>
          )}
        </div>
      </div>

      {query.isError ? (
        <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <div className="space-y-2.5">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : logs.length === 0 ? (
        <EmptyState
          icon={<History className="size-5" />}
          title={t("notifications.logs.emptyTitle")}
          description={t("notifications.logs.emptyDesc")}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">{t("notifications.logs.colTime")}</TableHead>
                <TableHead>{t("notifications.logs.colEvent")}</TableHead>
                <TableHead>{t("notifications.logs.colChannel")}</TableHead>
                <TableHead>{t("notifications.logs.colTitle")}</TableHead>
                <TableHead className="w-24">{t("notifications.logs.colStatus")}</TableHead>
                <TableHead className="w-16 text-right">{t("notifications.logs.colDetail")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {formatDateTime(item.created_at, i18n.language)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[11px] font-normal">
                      {KNOWN_EVENTS.has(item.event_type)
                        ? t(
                            `notifications.events.${item.event_type}` as "notifications.events.test"
                          )
                        : item.event_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs font-medium text-foreground">
                    {item.channel_name || "—"}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-xs text-foreground">
                    {item.title}
                  </TableCell>
                  <TableCell>
                    {item.status === "success" ? (
                      <Badge variant="secondary" className="bg-success/15 text-xs text-success">
                        {t("notifications.logs.statusSuccess")}
                      </Badge>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Badge variant="destructive" className="cursor-help text-xs">
                              {t("notifications.logs.statusFailed")}
                            </Badge>
                          }
                        />
                        <TooltipContent className="max-w-xs wrap-break-word">
                          {item.error || t("common.loadFailed")}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            aria-label={t("notifications.logs.viewAria")}
                            onClick={() => setInspecting(item)}
                          >
                            <Eye className="size-3.5" />
                          </Button>
                        }
                      />
                      <TooltipContent>{t("notifications.logs.viewAria")}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={Boolean(inspecting)} onOpenChange={(o) => !o && setInspecting(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{inspecting?.title}</DialogTitle>
            <DialogDescription className="tabular-nums">
              {inspecting
                ? `${inspecting.channel_name} · ${formatDateTime(inspecting.created_at, i18n.language)}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 font-mono text-xs text-foreground">
              {inspecting?.message}
            </pre>
            {inspecting?.error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {inspecting.error}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title={t("notifications.logs.clearTitle")}
        description={t("notifications.logs.clearDesc")}
        confirmLabel={t("notifications.logs.clearBtn")}
        loading={clearMutation.isPending}
        onConfirm={() => clearMutation.mutate()}
      />
    </div>
  )
}
