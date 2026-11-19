import { useEffect, useMemo } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { ErrorState, PageHeader } from "@/components/common/CommonUI"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Skeleton } from "@/components/ui/skeleton"
import { api, queryKeys } from "@/lib/api"

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
  "settings",
  ".well-known",
])

function isValidSubPath(raw: string): boolean {
  const cleaned = raw.trim().replace(/^\/+|\/+$/g, "")
  if (!cleaned) return true // empty defaults to "sub"
  if (!/^[a-zA-Z0-9._/-]+$/.test(cleaned)) return false
  const parts = cleaned.split("/")
  if (parts.some((p) => !p || p === "." || p === "..")) return false
  if (RESERVED_SUB_SEGMENTS.has(parts[0].toLowerCase())) return false
  return true
}

type SystemFormValues = {
  hub_public_url?: string
  sub_path: string
  acme_email?: string
  agent_image: string
}

type PasswordFormValues = {
  old_password: string
  new_password: string
  confirm_password: string
}

export function SettingsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()

  const systemSchema = useMemo(
    () =>
      z.object({
        hub_public_url: z.string().trim().optional(),
        sub_path: z
          .string()
          .trim()
          .refine(isValidSubPath, t("settings.validation.subPathInvalid")),
        acme_email: z.string().trim().optional(),
        agent_image: z.string().trim().min(1, t("settings.validation.agentImageRequired")),
      }),
    [t]
  )

  const passwordSchema = useMemo(
    () =>
      z
        .object({
          old_password: z.string().min(1, t("settings.validation.oldPwRequired")),
          new_password: z.string().min(6, t("settings.validation.newPwMin")),
          confirm_password: z.string().min(1, t("settings.validation.confirmPwRequired")),
        })
        .refine((d) => d.new_password === d.confirm_password, {
          message: t("settings.validation.pwMismatch"),
          path: ["confirm_password"],
        }),
    [t]
  )

  const query = useQuery({
    queryKey: queryKeys.settings,
    queryFn: api.getSettings,
  })

  const sysForm = useForm<SystemFormValues>({
    resolver: zodResolver(systemSchema),
    defaultValues: {
      hub_public_url: "",
      sub_path: "sub",
      acme_email: "",
      agent_image: "ghcr.io/tom2almighty/mihob-agent:latest",
    },
  })

  const pwForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      old_password: "",
      new_password: "",
      confirm_password: "",
    },
  })

  useEffect(() => {
    if (query.data) {
      sysForm.reset({
        hub_public_url: query.data.hub_public_url || "",
        sub_path: query.data.sub_path || "sub",
        acme_email: query.data.acme_email || "",
        agent_image: query.data.agent_image || "ghcr.io/tom2almighty/mihob-agent:latest",
      })
    }
  }, [query.data, sysForm])

  const saveSysMutation = useMutation({
    mutationFn: (v: SystemFormValues) =>
      api.updateSettings({
        hub_public_url: v.hub_public_url || "",
        sub_path: v.sub_path.trim().replace(/^\/+|\/+$/g, "") || "sub",
        acme_email: v.acme_email || "",
        agent_image: v.agent_image,
      }),
    onSuccess: (updated) => {
      qc.setQueryData(queryKeys.settings, updated)
      qc.invalidateQueries({ queryKey: queryKeys.settings })
      toast.success(t("settings.toastSaved"))
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const pwMutation = useMutation({
    mutationFn: (v: PasswordFormValues) =>
      api.changePassword({ old_password: v.old_password, new_password: v.new_password }),
    onSuccess: () => {
      pwForm.reset()
      toast.success(t("settings.toastPwUpdated"))
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const watchedPublicUrl = sysForm.watch("hub_public_url")
  const watchedSubPath = sysForm.watch("sub_path")
  const previewBase = (watchedPublicUrl?.trim() || window.location.origin).replace(/\/+$/, "")
  const previewSubPath = watchedSubPath?.trim().replace(/^\/+|\/+$/g, "") || "sub"
  const subUrlPreview = `${previewBase}/${previewSubPath}/{token}`

  return (
    <div className="space-y-6">
      <PageHeader title={t("settings.title")} description={t("settings.description")} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("settings.hubCardTitle")}</CardTitle>
            <CardDescription>{t("settings.hubCardDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {query.isError ? (
              <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
            ) : query.isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <Form {...sysForm}>
                <form
                  onSubmit={sysForm.handleSubmit((v) => saveSysMutation.mutate(v))}
                  className="space-y-4"
                >
                  <FormField
                    control={sysForm.control}
                    name="hub_public_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("settings.hubPublicUrl")}</FormLabel>
                        <FormControl>
                          <Input placeholder="https://hub.example.com" {...field} />
                        </FormControl>
                        <FormDescription>{t("settings.hubPublicUrlDesc")}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={sysForm.control}
                    name="sub_path"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("settings.subPath")}</FormLabel>
                        <FormControl>
                          <Input placeholder="sub" className="font-mono text-xs" {...field} />
                        </FormControl>
                        <FormDescription className="space-y-1">
                          <span className="block">{t("settings.subPathDesc")}</span>
                          <span className="block truncate font-mono text-xs text-foreground/80">
                            {t("settings.subPathPreview", { url: subUrlPreview })}
                          </span>
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={sysForm.control}
                    name="acme_email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("settings.acmeEmail")}</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="ops@example.com" {...field} />
                        </FormControl>
                        <FormDescription>{t("settings.acmeEmailDesc")}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={sysForm.control}
                    name="agent_image"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("settings.agentImage")}</FormLabel>
                        <FormControl>
                          <Input className="font-mono text-xs" {...field} />
                        </FormControl>
                        <FormDescription>{t("settings.agentImageDesc")}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" disabled={saveSysMutation.isPending}>
                    {saveSysMutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                    {t("settings.saveSettings")}
                  </Button>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("settings.pwCardTitle")}</CardTitle>
            <CardDescription>{t("settings.pwCardDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...pwForm}>
              <form
                onSubmit={pwForm.handleSubmit((v) => pwMutation.mutate(v))}
                className="space-y-4"
              >
                <FormField
                  control={pwForm.control}
                  name="old_password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("settings.oldPassword")}</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="current-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={pwForm.control}
                  name="new_password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("settings.newPassword")}</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={pwForm.control}
                  name="confirm_password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("settings.confirmPassword")}</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={pwMutation.isPending}>
                  {pwMutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                  {t("settings.updatePassword")}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
