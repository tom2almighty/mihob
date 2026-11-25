import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Download, HardDrive, Loader2, RefreshCw, Sparkles, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { ErrorState } from "@/components/common/CommonUI"
import { FormSwitchCard } from "@/components/common/FormControls"
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { api, queryKeys } from "@/lib/api"
import { formatBytes } from "@/lib/format"

export function DatabaseTab() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [vacuumConfirmOpen, setVacuumConfirmOpen] = useState(false)
  const [cleanupConfirmOpen, setCleanupConfirmOpen] = useState(false)
  const [trafficDays, setTrafficDays] = useState<string>("90")
  const [clearLogs, setClearLogs] = useState(false)

  const statsQuery = useQuery({
    queryKey: queryKeys.databaseStats,
    queryFn: api.getDatabaseStats,
  })

  const backupMutation = useMutation({
    mutationFn: () => api.downloadDatabaseBackup(),
    onSuccess: ({ blob, filename }) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success(t("settings.toastBackupSuccess"))
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const vacuumMutation = useMutation({
    mutationFn: () => api.vacuumDatabase(),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: queryKeys.databaseStats })
      setVacuumConfirmOpen(false)
      toast.success(
        t("settings.database.toastVacuumSuccess", {
          reclaimed: formatBytes(res.reclaimed_bytes),
          after: formatBytes(res.after_bytes),
        })
      )
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const cleanupMutation = useMutation({
    mutationFn: () =>
      api.cleanupDatabase({
        traffic_older_than_days: Number(trafficDays) || 0,
        clear_notification_logs: clearLogs,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: queryKeys.databaseStats })
      qc.invalidateQueries({ queryKey: queryKeys.notificationLogs })
      setCleanupConfirmOpen(false)
      setClearLogs(false)
      toast.success(
        t("settings.database.toastCleanupSuccess", {
          traffic: res.traffic_deleted,
          logs: res.logs_deleted,
        })
      )
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const stats = statsQuery.data?.stats
  const runtime = statsQuery.data?.runtime
  const canCleanup = Number(trafficDays) > 0 || clearLogs

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">
            {t("settings.database.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("settings.database.desc")}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => statsQuery.refetch()}
          disabled={statsQuery.isFetching}
        >
          <RefreshCw className={`mr-1.5 size-3.5 ${statsQuery.isFetching ? "animate-spin" : ""}`} />
          {t("common.refresh")}
        </Button>
      </div>

      <Separator />

      {/* Storage Overview */}
      {statsQuery.isError ? (
        <ErrorState message={statsQuery.error.message} onRetry={() => statsQuery.refetch()} />
      ) : statsQuery.isLoading || !stats ? (
        <div className="grid gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((n) => (
            <Skeleton key={n} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-border bg-card p-3.5">
              <div className="text-xs text-muted-foreground">
                {t("settings.database.totalSize")}
              </div>
              <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-foreground">
                {formatBytes(stats.total_size_bytes)}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {t("settings.database.journalMode", { mode: stats.journal_mode.toUpperCase() })}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-3.5">
              <div className="text-xs text-muted-foreground">{t("settings.database.dbAndWal")}</div>
              <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-foreground">
                {formatBytes(stats.db_size_bytes)}
              </div>
              <div className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                WAL: {formatBytes(stats.wal_size_bytes)}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-3.5">
              <div className="text-xs text-muted-foreground">
                {t("settings.database.reclaimable")}
              </div>
              <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-foreground">
                {formatBytes(stats.reclaimable_bytes)}
              </div>
              <div className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                {t("settings.database.freePages", { count: stats.freelist_count })}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-3.5">
              <div className="text-xs text-muted-foreground">
                {t("settings.database.historyRows")}
              </div>
              <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-foreground">
                {(stats.table_counts.traffic_hourly ?? 0).toLocaleString()}
              </div>
              <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                {t("settings.database.logsCount", {
                  count: stats.table_counts.notification_logs ?? 0,
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{t("settings.database.entitiesSummary")}</span>
            <Badge variant="secondary" className="font-mono text-xs font-normal tabular-nums">
              {t("settings.database.countNodes", { count: stats.table_counts.nodes ?? 0 })}
            </Badge>
            <Badge variant="secondary" className="font-mono text-xs font-normal tabular-nums">
              {t("settings.database.countInbounds", { count: stats.table_counts.inbounds ?? 0 })}
            </Badge>
            <Badge variant="secondary" className="font-mono text-xs font-normal tabular-nums">
              {t("settings.database.countUsers", { count: stats.table_counts.users ?? 0 })}
            </Badge>
            <Badge variant="secondary" className="font-mono text-xs font-normal tabular-nums">
              {t("settings.database.countCerts", { count: stats.table_counts.certificates ?? 0 })}
            </Badge>
            <Badge variant="secondary" className="font-mono text-xs font-normal tabular-nums">
              {t("settings.database.countTemplates", { count: stats.table_counts.templates ?? 0 })}
            </Badge>
          </div>
        </>
      )}

      <Separator />

      {/* Online Backup */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-xl space-y-1">
          <div className="text-sm font-medium text-foreground">{t("settings.backupCardTitle")}</div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("settings.backupHint")}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => backupMutation.mutate()}
          disabled={backupMutation.isPending}
        >
          {backupMutation.isPending ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <Download className="mr-1.5 size-3.5" />
          )}
          {t("settings.backupDownloadBtn")}
        </Button>
      </div>

      <Separator />

      {/* Vacuum & Space Reclamation */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-xl space-y-1">
          <div className="text-sm font-medium text-foreground">
            {t("settings.database.vacuumTitle")}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("settings.database.vacuumDesc")}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setVacuumConfirmOpen(true)}
          disabled={vacuumMutation.isPending}
        >
          {vacuumMutation.isPending ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <Sparkles className="mr-1.5 size-3.5" />
          )}
          {t("settings.database.vacuumBtn")}
        </Button>
      </div>

      <Separator />

      {/* History Data Cleanup */}
      <div className="space-y-4">
        <div className="space-y-1">
          <div className="text-sm font-medium text-foreground">
            {t("settings.database.cleanupTitle")}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("settings.database.cleanupDesc")}
          </p>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-foreground">
              {t("settings.database.pruneTrafficLabel")}
            </div>
            <Select value={trafficDays} onValueChange={(v) => setTrafficDays(v ?? "0")}>
              <SelectTrigger className="w-full sm:max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">{t("settings.database.pruneNone")}</SelectItem>
                <SelectItem value="30">{t("settings.database.pruneDays", { days: 30 })}</SelectItem>
                <SelectItem value="90">{t("settings.database.pruneDays", { days: 90 })}</SelectItem>
                <SelectItem value="180">
                  {t("settings.database.pruneDays", { days: 180 })}
                </SelectItem>
                <SelectItem value="365">
                  {t("settings.database.pruneDays", { days: 365 })}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <FormSwitchCard
            label={t("settings.database.clearLogsLabel")}
            checked={clearLogs}
            onCheckedChange={setClearLogs}
          />
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={!canCleanup || cleanupMutation.isPending}
            onClick={() => setCleanupConfirmOpen(true)}
          >
            {cleanupMutation.isPending ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <Trash2 className="mr-1.5 size-3.5" />
            )}
            {t("settings.database.cleanupBtn")}
          </Button>
        </div>
      </div>

      {/* Runtime Bootstrap Config (Read-Only from config.yaml / env) */}
      {runtime && (
        <>
          <Separator />
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <HardDrive className="size-4 text-muted-foreground" />
                {t("settings.database.runtimeTitle")}
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("settings.database.runtimeDesc")}
              </p>
            </div>

            <div className="grid gap-2 rounded-lg border border-border bg-muted/25 p-3.5 text-xs sm:grid-cols-2">
              <div className="space-y-0.5">
                <div className="text-muted-foreground">
                  {t("settings.database.runtimeConfigPath")}
                </div>
                <div className="break-all font-mono text-foreground">
                  {runtime.config_path || "-"}
                </div>
              </div>
              <div className="space-y-0.5">
                <div className="text-muted-foreground">{t("settings.database.runtimeDataDir")}</div>
                <div className="break-all font-mono text-foreground">{runtime.data_dir || "-"}</div>
              </div>
              <div className="space-y-0.5">
                <div className="text-muted-foreground">
                  {t("settings.database.runtimeRetention")}
                </div>
                <div className="font-mono text-foreground tabular-nums">
                  {runtime.traffic_retention_days > 0
                    ? t("settings.database.retentionDaysValue", {
                        days: runtime.traffic_retention_days,
                      })
                    : t("settings.database.retentionForever")}
                </div>
              </div>
              <div className="space-y-0.5">
                <div className="text-muted-foreground">
                  {t("settings.database.runtimeSecurityFlags")}
                </div>
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  <Badge variant="outline" className="font-mono text-xs font-normal">
                    trust_proxy: {String(runtime.trust_proxy)}
                  </Badge>
                  <Badge variant="outline" className="font-mono text-xs font-normal">
                    private_webhook: {String(runtime.allow_private_webhook)}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Vacuum Confirm Dialog */}
      <AlertDialog open={vacuumConfirmOpen} onOpenChange={setVacuumConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.database.vacuumConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.database.vacuumConfirmDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={vacuumMutation.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={vacuumMutation.isPending}
              onClick={() => vacuumMutation.mutate()}
            >
              {vacuumMutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              {t("settings.database.vacuumBtn")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cleanup Confirm Dialog */}
      <AlertDialog open={cleanupConfirmOpen} onOpenChange={setCleanupConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.database.cleanupConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.database.cleanupConfirmDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cleanupMutation.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={cleanupMutation.isPending}
              onClick={() => cleanupMutation.mutate()}
            >
              {cleanupMutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              {t("settings.database.cleanupBtn")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
