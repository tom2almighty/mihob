import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { CalendarClock, Loader2, Pencil, Play, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { ConfirmDeleteDialog, EmptyState, ErrorState } from "@/components/common/CommonUI"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api, queryKeys } from "@/lib/api"
import { formatDateTime } from "@/lib/format"
import type { NotificationSchedule, ScheduleRunResult } from "@/lib/types"
import { ScheduleFormDialog } from "./ScheduleFormDialog"

export function SchedulesTab() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<NotificationSchedule | null>(null)
  const [deleting, setDeleting] = useState<NotificationSchedule | null>(null)
  const [runningId, setRunningId] = useState<number | null>(null)
  const [previewResult, setPreviewResult] = useState<ScheduleRunResult | null>(null)

  const query = useQuery({
    queryKey: queryKeys.notificationSchedules,
    queryFn: api.listNotificationSchedules,
  })

  const channelsQuery = useQuery({
    queryKey: queryKeys.notificationChannels,
    queryFn: api.listNotificationChannels,
  })

  const toggleMutation = useMutation({
    mutationFn: (sc: NotificationSchedule) =>
      api.updateNotificationSchedule(sc.id, { ...sc, enabled: !sc.enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notificationSchedules })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteNotificationSchedule(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notificationSchedules })
      toast.success(t("notifications.schedules.toastDeleted"))
      setDeleting(null)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleRunNow = async (sc: NotificationSchedule) => {
    setRunningId(sc.id)
    try {
      const res = await api.runNotificationSchedule(sc.id)
      qc.invalidateQueries({ queryKey: queryKeys.notificationLogs })
      setPreviewResult(res)
      if (res.failed_count > 0) {
        toast.warning(
          t("notifications.schedules.toastRunPartial", {
            ok: res.success_count,
            failed: res.failed_count,
          })
        )
      } else {
        toast.success(t("notifications.schedules.toastRunSuccess", { count: res.success_count }))
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.loadFailed"))
    } finally {
      setRunningId(null)
    }
  }

  const describeCadence = (sc: NotificationSchedule) => {
    if (sc.frequency === "weekly") {
      return t("notifications.schedules.cadenceWeekly", {
        weekday: t(`notifications.weekdays.${sc.weekday}` as "notifications.weekdays.1"),
        time: sc.time_of_day,
        tz: sc.timezone,
      })
    }
    if (sc.frequency === "monthly") {
      return t("notifications.schedules.cadenceMonthly", {
        day: sc.day_of_month,
        time: sc.time_of_day,
        tz: sc.timezone,
      })
    }
    return t("notifications.schedules.cadenceDaily", {
      time: sc.time_of_day,
      tz: sc.timezone,
    })
  }

  const schedules = query.data ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t("notifications.schedules.intro")}</p>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <Plus className="mr-1.5 size-4" />
          {t("notifications.schedules.addBtn")}
        </Button>
      </div>

      {query.isError ? (
        <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : schedules.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="size-5" />}
          title={t("notifications.schedules.emptyTitle")}
          description={t("notifications.schedules.emptyDesc")}
          action={
            <Button
              size="sm"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <Plus className="mr-1.5 size-4" />
              {t("notifications.schedules.addFirst")}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {schedules.map((sc) => (
            <Card key={sc.id} className="gap-3 py-4">
              <CardHeader className="px-4 pb-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <CardTitle className="truncate text-sm font-semibold">{sc.name}</CardTitle>
                    <CardDescription className="text-xs tabular-nums">
                      {describeCadence(sc)}
                    </CardDescription>
                  </div>
                  <Switch
                    checked={sc.enabled}
                    onCheckedChange={() => toggleMutation.mutate(sc)}
                    aria-label={t("notifications.schedules.toggleAria")}
                  />
                </div>
              </CardHeader>

              <CardContent className="space-y-3 px-4 pt-0">
                <div className="flex flex-wrap gap-1.5">
                  {sc.include_summary && (
                    <Badge variant="secondary" className="text-[11px] font-normal">
                      {t("notifications.schedules.tagSummary")}
                    </Badge>
                  )}
                  {sc.include_node_traffic && (
                    <Badge variant="secondary" className="text-[11px] font-normal">
                      {sc.traffic_display_mode === "remaining"
                        ? t("notifications.schedules.tagTrafficRemaining")
                        : t("notifications.schedules.tagTrafficUsed")}
                    </Badge>
                  )}
                  {sc.include_expiring && (
                    <Badge variant="secondary" className="text-[11px] font-normal">
                      {t("notifications.schedules.tagExpiring")}
                    </Badge>
                  )}
                  {sc.include_top_users && (
                    <Badge variant="secondary" className="text-[11px] font-normal">
                      {t("notifications.schedules.tagTopUsers")}
                    </Badge>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="tabular-nums">
                    {sc.last_run_at
                      ? t("notifications.schedules.lastRunAt", {
                          time: formatDateTime(sc.last_run_at, i18n.language),
                        })
                      : t("notifications.schedules.neverRun")}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={runningId === sc.id}
                      onClick={() => void handleRunNow(sc)}
                    >
                      {runningId === sc.id ? (
                        <Loader2 className="mr-1 size-3 animate-spin" />
                      ) : (
                        <Play className="mr-1 size-3" />
                      )}
                      {t("notifications.schedules.runNow")}
                    </Button>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            aria-label={t("common.edit")}
                            onClick={() => {
                              setEditing(sc)
                              setFormOpen(true)
                            }}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                        }
                      />
                      <TooltipContent>{t("common.edit")}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            aria-label={t("common.delete")}
                            onClick={() => setDeleting(sc)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        }
                      />
                      <TooltipContent>{t("common.delete")}</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ScheduleFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        schedule={editing}
        channels={channelsQuery.data ?? []}
      />

      <Dialog open={Boolean(previewResult)} onOpenChange={(o) => !o && setPreviewResult(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{previewResult?.title}</DialogTitle>
            <DialogDescription>
              {previewResult
                ? t("notifications.schedules.runSummary", {
                    ok: previewResult.success_count,
                    total: previewResult.total_channels,
                  })
                : ""}
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 font-mono text-xs text-foreground">
            {previewResult?.message}
          </pre>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t("notifications.schedules.deleteTitle")}
        description={t("notifications.schedules.deleteDesc", { name: deleting?.name ?? "" })}
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
      />
    </div>
  )
}
