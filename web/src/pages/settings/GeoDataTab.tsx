import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { CheckCircle2, CloudDownload, Loader2, RefreshCw, RotateCcw, X } from "lucide-react"
import { toast } from "sonner"
import { ErrorState } from "@/components/common/CommonUI"
import { PasswordInput } from "@/components/common/FormControls"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api, queryKeys } from "@/lib/api"
import { formatBytes, formatDateShort } from "@/lib/format"
import type { GeoXURLs } from "@/lib/types"

export const DEFAULT_GEOX_URLS: GeoXURLs = {
  geosite: "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat",
  geoip: "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.dat",
  mmdb: "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/country.mmdb",
  asn: "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/GeoLite2-ASN.mmdb",
}

type GeoSubTab = "github" | "geox" | "cache"

type GeoFormValues = {
  github_token?: string
  github_proxy?: string
  geosite: string
  geoip: string
  mmdb: string
  asn: string
}

export function GeoDataTab() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const [subTab, setSubTab] = useState<GeoSubTab>("github")
  const [clearGithubToken, setClearGithubToken] = useState(false)
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
        github_token: z.string().trim().optional(),
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
      github_token: "",
      github_proxy: "",
      ...DEFAULT_GEOX_URLS,
    },
  })

  useEffect(() => {
    if (settingsQuery.data) {
      const geo = settingsQuery.data.geox_url
      form.reset({
        github_token: "",
        github_proxy: settingsQuery.data.github_proxy || "",
        geosite: geo?.geosite || DEFAULT_GEOX_URLS.geosite,
        geoip: geo?.geoip || DEFAULT_GEOX_URLS.geoip,
        mmdb: geo?.mmdb || DEFAULT_GEOX_URLS.mmdb,
        asn: geo?.asn || DEFAULT_GEOX_URLS.asn,
      })
      setClearGithubToken(false)
    }
  }, [settingsQuery.data, form])

  const saveMutation = useMutation({
    mutationFn: (v: GeoFormValues) =>
      api.updateSettings({
        hub_public_url: settingsQuery.data?.hub_public_url || "",
        sub_path: settingsQuery.data?.sub_path || "sub",
        agent_image: settingsQuery.data?.agent_image || "ghcr.io/tom2almighty/mihob-agent:latest",
        acme_email: settingsQuery.data?.acme_email || "",
        github_token: clearGithubToken ? "" : v.github_token?.trim() || "",
        clear_github_token: clearGithubToken,
        github_proxy: (v.github_proxy || "").trim(),
        geox_url: {
          geosite: v.geosite.trim(),
          geoip: v.geoip.trim(),
          mmdb: v.mmdb.trim(),
          asn: v.asn.trim(),
        },
      }),
    onSuccess: (updated) => {
      setClearGithubToken(false)
      qc.setQueryData(queryKeys.settings, updated)
      qc.invalidateQueries({ queryKey: queryKeys.settings })
      qc.invalidateQueries({ queryKey: queryKeys.mihomoLatest })
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

  const isDirty = form.formState.isDirty || clearGithubToken
  const hasSavedGithubToken = Boolean(settingsQuery.data?.has_github_token) && !clearGithubToken

  const handleSubmit = form.handleSubmit(
    (v) => saveMutation.mutate(v),
    (errors) => {
      if (errors.geosite || errors.geoip || errors.mmdb || errors.asn) {
        setSubTab("geox")
      }
    }
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">{t("settings.geodata.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("settings.geodata.desc")}</p>
        </div>
        {isDirty && (
          <Badge variant="secondary" className="text-xs font-normal">
            {t("settings.unsavedChanges")}
          </Badge>
        )}
      </div>

      <Tabs
        value={subTab}
        onValueChange={(v) => setSubTab((v as GeoSubTab) || "github")}
        className="gap-5"
      >
        <div className="border-b border-border pb-1">
          <TabsList variant="line" size="sm">
            <TabsTrigger value="github">{t("settings.geodata.subGithub")}</TabsTrigger>
            <TabsTrigger value="geox">{t("settings.geodata.subGeox")}</TabsTrigger>
            <TabsTrigger value="cache">{t("settings.geodata.subCache")}</TabsTrigger>
          </TabsList>
        </div>

        {/* Sub-tab 1: GitHub Integration (Token + Proxy) */}
        <TabsContent value="github" className="mt-0">
          {settingsQuery.isError ? (
            <ErrorState
              message={settingsQuery.error.message}
              onRetry={() => settingsQuery.refetch()}
            />
          ) : settingsQuery.isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={handleSubmit} className="space-y-5">
                <FormField
                  control={form.control}
                  name="github_token"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <FormLabel>{t("settings.githubToken")}</FormLabel>
                          {hasSavedGithubToken && (
                            <Badge variant="secondary" className="font-mono text-xs font-normal">
                              {t("settings.githubTokenSavedBadge", {
                                masked: settingsQuery.data?.github_token_masked || "****",
                              })}
                            </Badge>
                          )}
                          {clearGithubToken && (
                            <Badge
                              variant="outline"
                              className="text-xs font-normal text-destructive"
                            >
                              {t("settings.githubTokenClearPending")}
                            </Badge>
                          )}
                        </div>
                        {hasSavedGithubToken && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              setClearGithubToken(true)
                              form.setValue("github_token", "")
                            }}
                          >
                            <X className="mr-1 size-3" />
                            {t("settings.githubTokenClear")}
                          </Button>
                        )}
                      </div>
                      <FormControl>
                        <PasswordInput
                          autoComplete="off"
                          placeholder={
                            hasSavedGithubToken
                              ? t("settings.githubTokenKeepPlaceholder")
                              : t("settings.githubTokenPlaceholder")
                          }
                          className="font-mono text-xs sm:text-sm"
                          {...field}
                          onChange={(e) => {
                            if (clearGithubToken && e.target.value) {
                              setClearGithubToken(false)
                            }
                            field.onChange(e)
                          }}
                        />
                      </FormControl>
                      <FormDescription>{t("settings.githubTokenDesc")}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator />

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

                <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
                  {isDirty && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        form.reset()
                        setClearGithubToken(false)
                      }}
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
        </TabsContent>

        {/* Sub-tab 2: Default geox-url Sources */}
        <TabsContent value="geox" className="mt-0">
          {settingsQuery.isError ? (
            <ErrorState
              message={settingsQuery.error.message}
              onRetry={() => settingsQuery.refetch()}
            />
          ) : settingsQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {t("settings.geodata.geoxUrlsDesc")}
                  </p>
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

                <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
                  {isDirty && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        form.reset()
                        setClearGithubToken(false)
                      }}
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
        </TabsContent>

        {/* Sub-tab 3: Local Hub GeoData Cache & Tag Index */}
        <TabsContent value="cache" className="mt-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{t("settings.geodata.cacheDesc")}</p>
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
                  <Tooltip>
                    <TooltipTrigger
                      render={
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
                      }
                    />
                    <TooltipContent>{t("settings.geodata.downloadOneTooltip")}</TooltipContent>
                  </Tooltip>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
