import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Loader2, Save, Server, Shield } from "lucide-react"
import { toast } from "sonner"
import { ErrorState } from "@/components/common/CommonUI"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { api, queryKeys } from "@/lib/api"
import type { NotificationRules } from "@/lib/types"
import { cn } from "@/lib/utils"
import { TRAFFIC_THRESHOLD_PRESETS } from "./constants"

function RuleRow({
  title,
  description,
  checked,
  disabled,
  onCheckedChange,
  extra,
}: {
  title: string
  description: string
  checked: boolean
  disabled?: boolean
  onCheckedChange: (next: boolean) => void
  extra?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-0.5">
          <div className="text-sm font-medium text-foreground">{title}</div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
      </div>
      {extra && checked && <div className="pl-0 sm:pl-1">{extra}</div>}
    </div>
  )
}

export function RulesTab() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [form, setForm] = useState<NotificationRules | null>(null)

  const query = useQuery({
    queryKey: queryKeys.notificationRules,
    queryFn: api.getNotificationRules,
  })

  useEffect(() => {
    if (query.data) {
      setForm(query.data)
    }
  }, [query.data])

  const saveMutation = useMutation({
    mutationFn: (next: NotificationRules) => api.updateNotificationRules(next),
    onSuccess: (saved) => {
      qc.setQueryData(queryKeys.notificationRules, saved)
      setForm(saved)
      toast.success(t("notifications.rules.toastSaved"))
    },
    onError: (err: Error) => toast.error(err.message),
  })

  if (query.isError) {
    return <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
  }
  if (query.isLoading || !form) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const update = <K extends keyof NotificationRules>(key: K, val: NotificationRules[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: val } : prev))
  }

  const toggleThreshold = (pct: number) => {
    const exists = form.node_traffic_thresholds.includes(pct)
    const next = exists
      ? form.node_traffic_thresholds.filter((v) => v !== pct)
      : [...form.node_traffic_thresholds, pct].sort((a, b) => a - b)
    update("node_traffic_thresholds", next)
  }

  const disabled = !form.enabled

  return (
    <div className="space-y-4">
      <Card className="py-4">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 px-5">
          <div className="space-y-0.5">
            <div className="text-sm font-semibold text-foreground">
              {t("notifications.rules.masterTitle")}
            </div>
            <p className="text-xs text-muted-foreground">{t("notifications.rules.masterDesc")}</p>
          </div>
          <Switch checked={form.enabled} onCheckedChange={(v) => update("enabled", v)} />
        </CardContent>
      </Card>

      <div className={cn("grid gap-4 lg:grid-cols-2", disabled && "opacity-60")}>
        {/* Agent / Node Alerts */}
        <Card className="gap-3 py-4">
          <CardHeader className="px-5 pb-0">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Server className="size-4 text-muted-foreground" />
              {t("notifications.rules.agentGroupTitle")}
            </CardTitle>
            <CardDescription className="text-xs">
              {t("notifications.rules.agentGroupDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-border px-5">
            <RuleRow
              title={t("notifications.events.node_offline")}
              description={t("notifications.rules.nodeOfflineDesc")}
              checked={form.node_offline}
              disabled={disabled}
              onCheckedChange={(v) => update("node_offline", v)}
              extra={
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{t("notifications.rules.offlineDelayLabel")}</span>
                  <Input
                    type="number"
                    min={0}
                    max={3600}
                    value={form.node_offline_delay_sec}
                    disabled={disabled}
                    onChange={(e) =>
                      update("node_offline_delay_sec", Math.max(0, Number(e.target.value) || 0))
                    }
                    className="h-7 w-20 text-xs tabular-nums"
                  />
                  <span>{t("notifications.rules.secondsUnit")}</span>
                </div>
              }
            />
            <RuleRow
              title={t("notifications.events.node_online")}
              description={t("notifications.rules.nodeOnlineDesc")}
              checked={form.node_online}
              disabled={disabled}
              onCheckedChange={(v) => update("node_online", v)}
            />
            <RuleRow
              title={t("notifications.events.node_config_error")}
              description={t("notifications.rules.nodeConfigErrorDesc")}
              checked={form.node_config_error}
              disabled={disabled}
              onCheckedChange={(v) => update("node_config_error", v)}
            />
            <RuleRow
              title={t("notifications.events.node_upgrade")}
              description={t("notifications.rules.nodeUpgradeDesc")}
              checked={form.node_upgrade}
              disabled={disabled}
              onCheckedChange={(v) => update("node_upgrade", v)}
            />
            <RuleRow
              title={t("notifications.events.node_traffic")}
              description={t("notifications.rules.nodeTrafficDesc")}
              checked={form.node_traffic_alert}
              disabled={disabled}
              onCheckedChange={(v) => update("node_traffic_alert", v)}
              extra={
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">
                    {t("notifications.rules.thresholdsLabel")}
                  </span>
                  {TRAFFIC_THRESHOLD_PRESETS.map((pct) => {
                    const active = form.node_traffic_thresholds.includes(pct)
                    return (
                      <Button
                        key={pct}
                        type="button"
                        size="sm"
                        disabled={disabled}
                        variant={active ? "secondary" : "outline"}
                        className="h-6 px-2 text-xs tabular-nums"
                        onClick={() => toggleThreshold(pct)}
                      >
                        {pct}%
                      </Button>
                    )
                  })}
                </div>
              }
            />
            <RuleRow
              title={t("notifications.events.node_expiring")}
              description={t("notifications.rules.nodeExpiringDesc")}
              checked={form.node_expiring}
              disabled={disabled}
              onCheckedChange={(v) => update("node_expiring", v)}
              extra={
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{t("notifications.rules.advanceDaysLabel")}</span>
                  <Input
                    type="number"
                    min={1}
                    max={90}
                    value={form.node_expiring_days}
                    disabled={disabled}
                    onChange={(e) =>
                      update("node_expiring_days", Math.max(1, Number(e.target.value) || 7))
                    }
                    className="h-7 w-20 text-xs tabular-nums"
                  />
                  <span>{t("notifications.rules.daysUnit")}</span>
                </div>
              }
            />
          </CardContent>
        </Card>

        {/* Hub / Cert / Security Alerts */}
        <Card className="gap-3 py-4">
          <CardHeader className="px-5 pb-0">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Shield className="size-4 text-muted-foreground" />
              {t("notifications.rules.hubGroupTitle")}
            </CardTitle>
            <CardDescription className="text-xs">
              {t("notifications.rules.hubGroupDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-border px-5">
            <RuleRow
              title={t("notifications.events.hub_started")}
              description={t("notifications.rules.hubStartedDesc")}
              checked={form.hub_started}
              disabled={disabled}
              onCheckedChange={(v) => update("hub_started", v)}
            />
            <RuleRow
              title={t("notifications.events.cert_renew")}
              description={t("notifications.rules.certRenewDesc")}
              checked={form.cert_renew}
              disabled={disabled}
              onCheckedChange={(v) => update("cert_renew", v)}
            />
            <RuleRow
              title={t("notifications.events.cert_expiring")}
              description={t("notifications.rules.certExpiringDesc")}
              checked={form.cert_expiring}
              disabled={disabled}
              onCheckedChange={(v) => update("cert_expiring", v)}
              extra={
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{t("notifications.rules.advanceDaysLabel")}</span>
                  <Input
                    type="number"
                    min={1}
                    max={90}
                    value={form.cert_expiring_days}
                    disabled={disabled}
                    onChange={(e) =>
                      update("cert_expiring_days", Math.max(1, Number(e.target.value) || 14))
                    }
                    className="h-7 w-20 text-xs tabular-nums"
                  />
                  <span>{t("notifications.rules.daysUnit")}</span>
                </div>
              }
            />
            <RuleRow
              title={t("notifications.events.user_exhausted")}
              description={t("notifications.rules.userExhaustedDesc")}
              checked={form.user_exhausted}
              disabled={disabled}
              onCheckedChange={(v) => update("user_exhausted", v)}
            />
            <RuleRow
              title={t("notifications.events.admin_login_failed")}
              description={t("notifications.rules.adminLoginFailedDesc")}
              checked={form.admin_login_failed}
              disabled={disabled}
              onCheckedChange={(v) => update("admin_login_failed", v)}
            />
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={saveMutation.isPending}
          onClick={() => saveMutation.mutate(form)}
        >
          {saveMutation.isPending ? (
            <Loader2 className="mr-1.5 size-4 animate-spin" />
          ) : (
            <Save className="mr-1.5 size-4" />
          )}
          {t("notifications.rules.saveBtn")}
        </Button>
      </div>
    </div>
  )
}
