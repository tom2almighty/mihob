import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { CheckCircle2, CloudDownload, Loader2, RefreshCw, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { ErrorState } from "@/components/common/CommonUI"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { api, queryKeys } from "@/lib/api"
import { formatBytes, formatDateShort } from "@/lib/format"
import type { GeoXURLs } from "@/lib/types"

export const DEFAULT_GEOX_URLS: GeoXURLs = {
  geosite: "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat",
  geoip: "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.dat",
  mmdb: "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/country.mmdb",
  asn: "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/GeoLite2-ASN.mmdb",
}

type GeoFormValues = {
  github_proxy?: string
  geosite: string
  geoip: string
  mmdb: string
  asn: string
}

export function GeoDataTab() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const [updatingKind, setUpdatingKind] = useState<string | null>(null)

  const settingsQuery = useQuery({
    queryKey: queryKeys.settings,
    queryFn: api.getSettings,
  })

  const statusQuery = useQuery({
    queryKey: queryKeys.geodataStatus,
    queryFn: api.getGeoDataStatus,
  })

  const schema = useMemo(
    () =>
      z.object({
        github_proxy: z.string().trim().optional(),
        geosite: z.string().trim().min(1, t("settings.geodata.urlRequired")),
        geoip: z.string().trim().min(1, t("settings.geodata.urlRequired")),
        mmdb: z.string().trim().min(1, t("settings.geodata.urlRequired")),
        asn: z.string().trim().min(1, t("settings.geodata.urlRequired")),
      }),
    [t]
  )

  const form = useForm<GeoFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      github_proxy: "",
      ...DEFAULT_GEOX_URLS,
    },
  })

  useEffect(() => {
    if (settingsQuery.data) {
      const geo = settingsQuery.data.geox_url
      form.reset({
        github_proxy: settingsQuery.data.github_proxy || "",
        geosite: geo?.geosite || DEFAULT_GEOX_URLS.geosite,
        geoip: geo?.geoip || DEFAULT_GEOX_URLS.geoip,
        mmdb: geo?.mmdb || DEFAULT_GEOX_URLS.mmdb,
        asn: geo?.asn || DEFAULT_GEOX_URLS.asn,
      })
    }
  }, [settingsQuery.data, form])

  const saveMutation = useMutation({
    mutationFn: (v: GeoFormValues) =>
      api.updateSettings({
        hub_public_url: settingsQuery.data?.hub_public_url || "",
        sub_path: settingsQuery.data?.sub_path || "sub",
        agent_image: settingsQuery.data?.agent_image || "ghcr.io/tom2almighty/mihob-agent:latest",
        acme_email: settingsQuery.data?.acme_email || "",
        github_proxy: (v.github_proxy || "").trim(),
        geox_url: {
          geosite: v.geosite.trim(),
          geoip: v.geoip.trim(),
          mmdb: v.mmdb.trim(),
          asn: v.asn.trim(),
        },
      }),
    onSuccess: (updated) => {
      qc.setQueryData(queryKeys.settings, updated)
      qc.invalidateQueries({ queryKey: queryKeys.settings })
      qc.invalidateQueries({ queryKey: queryKeys.geodataStatus })
      toast.success(t("settings.toastSaved"))
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const updateGeoMutation = useMutation({
    mutationFn: async (kinds?: string[]) => {
      setUpdatingKind(kinds && kinds.length === 1 ? kinds[0] : "all")
      return api.updateGeoData(kinds)
    },
    onSuccess: (res) => {
      qc.setQueryData(queryKeys.geodataStatus, { files: res.files })
      qc.invalidateQueries({ queryKey: ["geodata", "tags"] })
      const errEntries = Object.entries(res.errors ?? {})
      if (errEntries.length > 0) {
        toast.warning(
          t("settings.geodata.updatePartialError", {
            detail: errEntries.map(([k, msg]) => `${k}: ${msg}`).join("; "),
          })
        )
      } else {
        toast.success(t("settings.geodata.updateSuccess"))
      }
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => setUpdatingKind(null),
  })

  const resetDefaults = () => {
    form.setValue("geosite", DEFAULT_GEOX_URLS.geosite, { shouldDirty: true })
    form.setValue("geoip", DEFAULT_GEOX_URLS.geoip, { shouldDirty: true })
    form.setValue("mmdb", DEFAULT_GEOX_URLS.mmdb, { shouldDirty: true })
    form.setValue("asn", DEFAULT_GEOX_URLS.asn, { shouldDirty: true })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">{t("settings.geodata.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("settings.geodata.desc")}</p>
        </div>
        {form.formState.isDirty && (
          <Badge variant="secondary" className="text-xs font-normal">
            {t("settings.unsavedChanges")}
          </Badge>
        )}
      </div>

      <Separator />

      {settingsQuery.isError ? (
        <ErrorState message={settingsQuery.error.message} onRetry={() => settingsQuery.refetch()} />
      ) : settingsQuery.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="space-y-6">
            {/* GitHub Proxy for client subscriptions & Hub downloads */}
            <FormField
              control={form.control}
              name="github_proxy"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.geodata.githubProxy")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://ghfast.top/"
                      className="font-mono text-xs sm:text-sm"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>{t("settings.geodata.githubProxyDesc")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            {/* GeoX URLs */}
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium text-foreground">
                  {t("settings.geodata.geoxUrlsTitle")}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={resetDefaults}
                >
                  {t("settings.geodata.resetDefaults")}
                </Button>
              </div>

              {(
                [
                  { name: "geosite", label: "GeoSite (geosite.dat)" },
                  { name: "geoip", label: "GeoIP (geoip.dat)" },
                  { name: "mmdb", label: "MMDB (country.mmdb)" },
                  { name: "asn", label: "ASN (GeoLite2-ASN.mmdb)" },
                ] as const
              ).map((item) => (
                <FormField
                  key={item.name}
                  control={form.control}
                  name={item.name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">{item.label}</FormLabel>
                      <FormControl>
                        <Input className="font-mono text-xs" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
              {form.formState.isDirty && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => form.reset()}
                  disabled={saveMutation.isPending}
                >
                  <RotateCcw className="mr-1.5 size-3.5" />
                  {t("settings.discardChanges")}
                </Button>
              )}
              <Button type="submit" size="sm" disabled={saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                {t("settings.saveSettings")}
              </Button>
            </div>
          </form>
        </Form>
      )}

      <Separator />

      {/* Local Hub GeoData Cache & Tag Index */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-0.5">
            <div className="text-sm font-medium text-foreground">
              {t("settings.geodata.cacheTitle")}
            </div>
            <p className="text-xs text-muted-foreground">{t("settings.geodata.cacheDesc")}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={updateGeoMutation.isPending}
            onClick={() => updateGeoMutation.mutate(undefined)}
          >
            {updatingKind === "all" ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <CloudDownload className="mr-1.5 size-3.5" />
            )}
            {t("settings.geodata.downloadAllBtn")}
          </Button>
        </div>

        {statusQuery.isLoading ? (
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {(statusQuery.data?.files ?? []).map((f) => (
              <div
                key={f.kind}
                className="flex items-start justify-between gap-2 rounded-lg border border-border bg-card p-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-semibold uppercase text-foreground">
                      {f.kind}
                    </span>
                    {f.downloaded ? (
                      <Badge
                        variant="secondary"
                        className="gap-1 bg-success/15 text-[11px] font-normal text-success"
                      >
                        <CheckCircle2 className="size-3" />
                        {formatBytes(f.size_bytes)}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[11px] font-normal">
                        {t("settings.geodata.notDownloaded")}
                      </Badge>
                    )}
                    {(f.kind === "geosite" || f.kind === "geoip") && f.tag_count > 0 && (
                      <Badge
                        variant="outline"
                        className="font-mono text-[11px] font-normal tabular-nums"
                      >
                        {t("settings.geodata.tagCount", { count: f.tag_count })}
                      </Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground tabular-nums">
                    {f.updated_at
                      ? t("common.updatedAt", {
                          date: formatDateShort(f.updated_at, i18n.language),
                        })
                      : t("settings.geodata.notDownloadedHint")}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-7 shrink-0"
                  disabled={updateGeoMutation.isPending}
                  aria-label={t("settings.geodata.downloadOneAria", { kind: f.kind })}
                  onClick={() => updateGeoMutation.mutate([f.kind])}
                >
                  {updatingKind === f.kind ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
