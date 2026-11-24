import type { TFunction } from "i18next"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Link, useLocation } from "react-router-dom"
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  Download,
  ExternalLink,
  Link2Off,
  Network,
  Server,
} from "lucide-react"
import { CopyButton, EmptyState, TrafficProgress } from "@/components/common/CommonUI"
import { LanguageSwitcher, ThemeSwitcher } from "@/components/layout/AppShell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError, api, queryKeys } from "@/lib/api"
import { daysUntil, formatBytes, formatDateTime } from "@/lib/format"
import type { PublicSubInfo } from "@/lib/types"

function getStatusBadge(status: PublicSubInfo["status"], t: TFunction) {
  switch (status) {
    case "disabled":
      return { label: t("users.statusDisabled"), className: "bg-muted text-muted-foreground" }
    case "expired":
      return { label: t("users.statusExpired"), className: "bg-destructive/15 text-destructive" }
    case "exhausted":
      return { label: t("users.statusExhausted"), className: "bg-destructive/15 text-destructive" }
    case "expiring":
      return { label: t("users.statusExpiring"), className: "bg-warning/15 text-warning" }
    default:
      return { label: t("users.statusActive"), className: "bg-success/15 text-success" }
  }
}

export function SubscriptionPage() {
  const { t, i18n } = useTranslation()
  const location = useLocation()

  const query = useQuery({
    queryKey: queryKeys.publicSub(location.pathname),
    queryFn: () => api.getPublicSub(location.pathname),
    retry: (failureCount, err) => {
      if (err instanceof ApiError && err.status === 404) return false
      return failureCount < 1
    },
  })

  const info = query.data
  const days = info ? daysUntil(info.expire_at) : null
  const onlineCount = info ? info.nodes.filter((n) => n.online).length : 0
  const remainingBytes =
    info && info.traffic_limit > 0 ? Math.max(0, info.traffic_limit - info.traffic_used) : null
  const clashImportURL = info
    ? `clash://install-config?url=${encodeURIComponent(info.raw_url || info.sub_url)}&name=${encodeURIComponent(`mihob-${info.username}`)}`
    : ""

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Minimal standalone top bar */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Network className="size-4" />
            </div>
            <span className="text-base font-semibold tracking-tight">mihob</span>
            <Badge variant="secondary" className="text-xs font-normal">
              {t("subPage.badge")}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <LanguageSwitcher />
            <ThemeSwitcher />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        {query.isLoading ? (
          <div className="space-y-6">
            <Skeleton className="h-44 w-full rounded-xl" />
            <div className="grid gap-4 sm:grid-cols-3">
              <Skeleton className="h-32 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
          </div>
        ) : query.isError || !info ? (
          <div className="mx-auto mt-12 max-w-md">
            <EmptyState
              icon={<Link2Off className="size-5" />}
              title={t("subPage.notFoundTitle")}
              description={t("subPage.notFoundDesc")}
              action={
                <Button
                  variant="outline"
                  size="sm"
                  render={<Link to="/login" />}
                  nativeButton={false}
                >
                  {t("subPage.backToLogin")}
                </Button>
              }
            />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Inactive warning banner */}
            {(info.status === "disabled" ||
              info.status === "expired" ||
              info.status === "exhausted") && (
              <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>{t(`subPage.inactiveNotice.${info.status}`)}</span>
              </div>
            )}

            {/* Hero Summary & Quick Import Card */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <CardTitle className="text-xl tracking-tight">
                        {t("subPage.pageTitle", { username: info.username })}
                      </CardTitle>
                      {(() => {
                        const badge = getStatusBadge(info.status, t)
                        return (
                          <Badge variant="secondary" className={badge.className}>
                            {badge.label}
                          </Badge>
                        )
                      })()}
                    </div>
                    <CardDescription>{t("subPage.subtitle")}</CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    {t("subPage.subUrlLabel")}
                  </Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      readOnly
                      value={info.sub_url}
                      className="min-w-0 flex-1 font-mono text-xs"
                    />
                    <CopyButton
                      value={info.sub_url}
                      label={t("subPage.copyUrl")}
                      size="sm"
                      variant="outline"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    render={<a href={clashImportURL} />}
                    nativeButton={false}
                    disabled={
                      info.status === "disabled" ||
                      info.status === "expired" ||
                      info.status === "exhausted"
                    }
                  >
                    <ExternalLink className="mr-1.5 size-3.5" />
                    {t("subPage.importClient")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    render={<a href={info.download_url} download />}
                    nativeButton={false}
                  >
                    <Download className="mr-1.5 size-3.5" />
                    {t("subPage.downloadYaml")}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* 3 KPI Stat Cards */}
            <div className="grid gap-4 sm:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    {t("subPage.trafficTitle")}
                  </CardTitle>
                  <Activity className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="space-y-2">
                  <TrafficProgress used={info.traffic_used} limit={info.traffic_limit} />
                  <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-muted-foreground tabular-nums">
                    <span>
                      {remainingBytes !== null
                        ? t("subPage.trafficRemaining", { amount: formatBytes(remainingBytes) })
                        : t("common.unlimited")}
                    </span>
                    <span>
                      {t("subPage.trafficUpload", { amount: formatBytes(info.upload_used) })} ·{" "}
                      {t("subPage.trafficDownload", { amount: formatBytes(info.download_used) })}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    {t("subPage.expireTitle")}
                  </CardTitle>
                  <CalendarClock className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="space-y-1">
                  <div className="text-lg font-semibold tracking-tight tabular-nums">
                    {info.expire_at
                      ? formatDateTime(info.expire_at, i18n.language)
                      : t("common.neverExpires")}
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {days === null
                      ? t("common.permanent")
                      : days <= 0
                        ? t("subPage.expiredHint")
                        : t("subPage.daysLeft", { days })}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    {t("subPage.nodesTitle")}
                  </CardTitle>
                  <Server className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="space-y-1">
                  <div className="text-2xl font-semibold tracking-tight tabular-nums">
                    {info.nodes.length}
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {t("subPage.nodesOnline", { online: onlineCount, total: info.nodes.length })}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
