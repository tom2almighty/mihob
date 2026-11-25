import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, RotateCcw, X } from "lucide-react"
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
import { api, queryKeys } from "@/lib/api"

const DEFAULT_AGENT_IMAGE = "ghcr.io/tom2almighty/mihob-agent:latest"

type DeploymentFormValues = {
  agent_image: string
  acme_email?: string
  github_token?: string
}

export function DeploymentTab() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [clearGithubToken, setClearGithubToken] = useState(false)

  const query = useQuery({
    queryKey: queryKeys.settings,
    queryFn: api.getSettings,
  })

  const schema = useMemo(
    () =>
      z.object({
        agent_image: z.string().trim().min(1, t("settings.validation.agentImageRequired")),
        acme_email: z.string().trim().optional(),
        github_token: z.string().trim().optional(),
      }),
    [t]
  )

  const form = useForm<DeploymentFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      agent_image: DEFAULT_AGENT_IMAGE,
      acme_email: "",
      github_token: "",
    },
  })

  useEffect(() => {
    if (query.data) {
      form.reset({
        agent_image: query.data.agent_image || DEFAULT_AGENT_IMAGE,
        acme_email: query.data.acme_email || "",
        github_token: "",
      })
      setClearGithubToken(false)
    }
  }, [query.data, form])

  const saveMutation = useMutation({
    mutationFn: (v: DeploymentFormValues) =>
      api.updateSettings({
        hub_public_url: query.data?.hub_public_url || "",
        sub_path: query.data?.sub_path || "sub",
        agent_image: v.agent_image,
        acme_email: v.acme_email || "",
        github_token: clearGithubToken ? "" : v.github_token?.trim() || "",
        clear_github_token: clearGithubToken,
        github_proxy: query.data?.github_proxy || "",
        geox_url: query.data?.geox_url,
      }),
    onSuccess: (updated) => {
      setClearGithubToken(false)
      qc.setQueryData(queryKeys.settings, updated)
      qc.invalidateQueries({ queryKey: queryKeys.settings })
      qc.invalidateQueries({ queryKey: queryKeys.mihomoLatest })
      toast.success(t("settings.toastSaved"))
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const isDirty = form.formState.isDirty || clearGithubToken
  const hasSavedGithubToken = Boolean(query.data?.has_github_token) && !clearGithubToken

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">
            {t("settings.deployCardTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("settings.deployCardDesc")}</p>
        </div>
        {isDirty && (
          <Badge variant="secondary" className="text-xs font-normal">
            {t("settings.unsavedChanges")}
          </Badge>
        )}
      </div>

      <Separator />

      {query.isError ? (
        <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="space-y-6">
            <FormField
              control={form.control}
              name="agent_image"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between gap-2">
                    <FormLabel>{t("settings.agentImage")}</FormLabel>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        form.setValue("agent_image", DEFAULT_AGENT_IMAGE, {
                          shouldDirty: true,
                          shouldValidate: true,
                        })
                      }
                    >
                      {t("settings.useDefaultImage")}
                    </Button>
                  </div>
                  <FormControl>
                    <Input className="font-mono text-xs sm:text-sm" {...field} />
                  </FormControl>
                  <FormDescription>{t("settings.agentImageDesc")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            <FormField
              control={form.control}
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

            <Separator />

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
                            masked: query.data?.github_token_masked || "****",
                          })}
                        </Badge>
                      )}
                      {clearGithubToken && (
                        <Badge variant="outline" className="text-xs font-normal text-destructive">
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
    </div>
  )
}
