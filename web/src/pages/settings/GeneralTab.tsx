import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { CopyButton, ErrorState } from "@/components/common/CommonUI"
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
import { api, queryKeys } from "@/lib/api"
import { DeploymentTab } from "./DeploymentTab"

type GeneralSubTab = "hub" | "deployment"

const RESERVED_SUB_SEGMENTS = new Set([
  "api",
  "ws",
  "assets",
  "install",
  "healthz",
  "login",
  "nodes",
  "certificates",
  "users",
  "templates",
  "notifications",
  "settings",
  ".well-known",
])

export function isValidSubPath(raw: string): boolean {
  const cleaned = raw.trim().replace(/^\/+|\/+$/g, "")
  if (!cleaned) return true
  if (!/^[a-zA-Z0-9._/-]+$/.test(cleaned)) return false
  const parts = cleaned.split("/")
  if (parts.some((p) => !p || p === "." || p === "..")) return false
  if (RESERVED_SUB_SEGMENTS.has(parts[0].toLowerCase())) return false
  return true
}

type GeneralFormValues = {
  hub_public_url?: string
  sub_path: string
}

export function GeneralTab() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [subTab, setSubTab] = useState<GeneralSubTab>("hub")

  const query = useQuery({
    queryKey: queryKeys.settings,
    queryFn: api.getSettings,
  })

  const schema = useMemo(
    () =>
      z.object({
        hub_public_url: z.string().trim().optional(),
        sub_path: z.string().trim().refine(isValidSubPath, t("settings.validation.subPathInvalid")),
      }),
    [t]
  )

  const form = useForm<GeneralFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      hub_public_url: "",
      sub_path: "sub",
    },
  })

  useEffect(() => {
    if (query.data) {
      form.reset({
        hub_public_url: query.data.hub_public_url || "",
        sub_path: query.data.sub_path || "sub",
      })
    }
  }, [query.data, form])

  const saveMutation = useMutation({
    mutationFn: (v: GeneralFormValues) =>
      api.updateSettings({
        hub_public_url: v.hub_public_url || "",
        sub_path: v.sub_path.trim().replace(/^\/+|\/+$/g, "") || "sub",
        acme_email: query.data?.acme_email || "",
        agent_image: query.data?.agent_image || "ghcr.io/tom2almighty/mihob-agent:latest",
        github_proxy: query.data?.github_proxy || "",
        geox_url: query.data?.geox_url,
      }),
    onSuccess: (updated) => {
      qc.setQueryData(queryKeys.settings, updated)
      qc.invalidateQueries({ queryKey: queryKeys.settings })
      toast.success(t("settings.toastSaved"))
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const watchedPublicUrl = form.watch("hub_public_url")
  const watchedSubPath = form.watch("sub_path")
  const previewBase = (watchedPublicUrl?.trim() || window.location.origin).replace(/\/+$/, "")
  const previewSubPath = watchedSubPath?.trim().replace(/^\/+|\/+$/g, "") || "sub"
  const subUrlPreview = `${previewBase}/${previewSubPath}/{token}`

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-foreground">
          {t("settings.generalCardTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("settings.generalCardDesc")}</p>
      </div>

      <Tabs
        value={subTab}
        onValueChange={(v) => setSubTab((v as GeneralSubTab) || "hub")}
        className="gap-5"
      >
        <div className="border-b border-border pb-1">
          <TabsList variant="line" size="sm">
            <TabsTrigger value="hub">{t("settings.generalSub.hub")}</TabsTrigger>
            <TabsTrigger value="deployment">{t("settings.generalSub.deployment")}</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="hub" className="mt-0">
          {query.isError ? (
            <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
          ) : query.isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))}
                className="space-y-5"
              >
                <FormField
                  control={form.control}
                  name="hub_public_url"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between gap-2">
                        <FormLabel>{t("settings.hubPublicUrl")}</FormLabel>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() =>
                            form.setValue("hub_public_url", window.location.origin, {
                              shouldDirty: true,
                              shouldValidate: true,
                            })
                          }
                        >
                          {t("settings.useCurrentOrigin")}
                        </Button>
                      </div>
                      <FormControl>
                        <Input
                          placeholder="https://hub.example.com"
                          className="font-mono text-xs sm:text-sm"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>{t("settings.hubPublicUrlDesc")}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator />

                <FormField
                  control={form.control}
                  name="sub_path"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("settings.subPath")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="sub"
                          className="font-mono text-xs sm:text-sm"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>{t("settings.subPathDesc")}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="rounded-lg border border-border bg-muted/30 p-3.5">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("settings.subPreviewLabel")}
                    </span>
                    <CopyButton value={subUrlPreview} size="icon-sm" />
                  </div>
                  <p className="break-all font-mono text-xs text-foreground">{subUrlPreview}</p>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
                  <div>
                    {form.formState.isDirty && (
                      <Badge variant="secondary" className="text-xs font-normal">
                        {t("settings.unsavedChanges")}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
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
                </div>
              </form>
            </Form>
          )}
        </TabsContent>

        <TabsContent value="deployment" className="mt-0">
          <DeploymentTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
