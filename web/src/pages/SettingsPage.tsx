import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "react-router-dom"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  BookOpen,
  Container,
  ExternalLink,
  Eye,
  EyeOff,
  FolderGit2,
  Globe,
  Loader2,
  Palette,
  RotateCcw,
  ShieldCheck,
} from "lucide-react"
import { siGithub } from "simple-icons"
import { toast } from "sonner"
import { CopyButton, ErrorState, PageHeader } from "@/components/common/CommonUI"
import { AppearanceTab } from "@/pages/settings/AppearanceTab"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { useAuth } from "@/lib/auth"
import { cn } from "@/lib/utils"

const DEFAULT_AGENT_IMAGE = "ghcr.io/tom2almighty/mihob-agent:latest"

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

function isValidSubPath(raw: string): boolean {
  const cleaned = raw.trim().replace(/^\/+|\/+$/g, "")
  if (!cleaned) return true // empty defaults to "sub"
  if (!/^[a-zA-Z0-9._/-]+$/.test(cleaned)) return false
  const parts = cleaned.split("/")
  if (parts.some((p) => !p || p === "." || p === "..")) return false
  if (RESERVED_SUB_SEGMENTS.has(parts[0].toLowerCase())) return false
  return true
}

function getPasswordStrength(pw: string): 0 | 1 | 2 | 3 {
  if (!pw) return 0
  let score = 0
  if (pw.length >= 6) score++
  if (pw.length >= 10 && /[a-zA-Z]/.test(pw) && /\d/.test(pw)) score++
  if (pw.length >= 12 && /[^a-zA-Z0-9]/.test(pw)) score++
  return Math.max(1, Math.min(3, score)) as 1 | 2 | 3
}

type SystemFormValues = {
  hub_public_url?: string
  sub_path: string
  acme_email?: string
  agent_image: string
  github_token?: string
}

type PasswordFormValues = {
  old_password: string
  new_password: string
  confirm_password: string
}

type SettingsTab = "general" | "deployment" | "appearance" | "security" | "projects"

const VALID_SETTINGS_TABS = new Set<SettingsTab>([
  "general",
  "deployment",
  "appearance",
  "security",
  "projects",
])

function SimpleIconSvg({
  path,
  className = "size-4",
}: {
  path: string
  className?: string
}) {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  )
}

export function SettingsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { admin } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const tabParam = searchParams.get("tab") as SettingsTab | null
  const [activeTab, setActiveTab] = useState<SettingsTab>(() =>
    tabParam && VALID_SETTINGS_TABS.has(tabParam) ? tabParam : "general"
  )

  useEffect(() => {
    if (tabParam && VALID_SETTINGS_TABS.has(tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam)
    }
  }, [tabParam, activeTab])

  const handleTabChange = (next: SettingsTab) => {
    setActiveTab(next)
    if (next === "general") {
      searchParams.delete("tab")
    } else {
      searchParams.set("tab", next)
    }
    setSearchParams(searchParams, { replace: true })
  }
  const [showOldPw, setShowOldPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)
  const [showGithubToken, setShowGithubToken] = useState(false)

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
        github_token: z.string().trim().optional(),
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
      agent_image: DEFAULT_AGENT_IMAGE,
      github_token: "",
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
        agent_image: query.data.agent_image || DEFAULT_AGENT_IMAGE,
        github_token: query.data.github_token || "",
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
        github_token: v.github_token?.trim() || "",
      }),
    onSuccess: (updated) => {
      qc.setQueryData(queryKeys.settings, updated)
      qc.invalidateQueries({ queryKey: queryKeys.settings })
      qc.invalidateQueries({ queryKey: queryKeys.mihomoLatest })
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

  const handleSysInvalid = (errors: Record<string, unknown>) => {
    if (errors.hub_public_url || errors.sub_path) {
      setActiveTab("general")
    } else if (errors.agent_image || errors.acme_email) {
      setActiveTab("deployment")
    }
  }

  const watchedPublicUrl = sysForm.watch("hub_public_url")
  const watchedSubPath = sysForm.watch("sub_path")
  const watchedNewPw = pwForm.watch("new_password")
  const pwStrength = getPasswordStrength(watchedNewPw || "")

  const previewBase = (watchedPublicUrl?.trim() || window.location.origin).replace(/\/+$/, "")
  const previewSubPath = watchedSubPath?.trim().replace(/^\/+|\/+$/g, "") || "sub"
  const subUrlPreview = `${previewBase}/${previewSubPath}/{token}`

  const isSysDirty = sysForm.formState.isDirty

  return (
    <div className="space-y-6">
      <PageHeader title={t("settings.title")} description={t("settings.description")} />

      <Tabs
        value={activeTab}
        onValueChange={(v) => handleTabChange(v as SettingsTab)}
        className="max-w-4xl space-y-5"
      >
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:grid-cols-5">
          <TabsTrigger value="general" className="min-h-8 gap-1.5 py-1.5 text-xs sm:min-h-7 sm:py-1 sm:text-sm">
            <Globe className="size-3.5 shrink-0" />
            <span className="truncate">{t("settings.tabs.general")}</span>
          </TabsTrigger>
          <TabsTrigger value="deployment" className="min-h-8 gap-1.5 py-1.5 text-xs sm:min-h-7 sm:py-1 sm:text-sm">
            <Container className="size-3.5 shrink-0" />
            <span className="truncate">{t("settings.tabs.deployment")}</span>
          </TabsTrigger>
          <TabsTrigger value="appearance" className="min-h-8 gap-1.5 py-1.5 text-xs sm:min-h-7 sm:py-1 sm:text-sm">
            <Palette className="size-3.5 shrink-0" />
            <span className="truncate">{t("settings.tabs.appearance")}</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="min-h-8 gap-1.5 py-1.5 text-xs sm:min-h-7 sm:py-1 sm:text-sm">
            <ShieldCheck className="size-3.5 shrink-0" />
            <span className="truncate">{t("settings.tabs.security")}</span>
          </TabsTrigger>
          <TabsTrigger value="projects" className="min-h-8 gap-1.5 py-1.5 text-xs sm:min-h-7 sm:py-1 sm:text-sm">
            <FolderGit2 className="size-3.5 shrink-0" />
            <span className="truncate">{t("settings.tabs.projects")}</span>
          </TabsTrigger>
        </TabsList>

        {/* System Settings Form wraps both 'general' and 'deployment' tabs */}
        <Form {...sysForm}>
          <form
            id="system-settings-form"
            onSubmit={sysForm.handleSubmit((v) => saveSysMutation.mutate(v), handleSysInvalid)}
          >
            <TabsContent value="general" keepMounted className="mt-0">
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-1">
                      <CardTitle className="text-base">{t("settings.generalCardTitle")}</CardTitle>
                      <CardDescription>{t("settings.generalCardDesc")}</CardDescription>
                    </div>
                    {isSysDirty && (
                      <Badge variant="secondary" className="text-xs font-normal">
                        {t("settings.unsavedChanges")}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  {query.isError ? (
                    <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
                  ) : query.isLoading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ) : (
                    <>
                      <FormField
                        control={sysForm.control}
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
                                  sysForm.setValue("hub_public_url", window.location.origin, {
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
                        control={sysForm.control}
                        name="sub_path"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("settings.subPath")}</FormLabel>
                            <FormControl>
                              <Input placeholder="sub" className="font-mono text-xs sm:text-sm" {...field} />
                            </FormControl>
                            <FormDescription>{t("settings.subPathDesc")}</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="rounded-lg border border-border bg-muted/35 p-3.5">
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-muted-foreground">
                            {t("settings.subPreviewLabel")}
                          </span>
                          <CopyButton value={subUrlPreview} size="icon-sm" />
                        </div>
                        <p className="break-all font-mono text-xs text-foreground">{subUrlPreview}</p>
                      </div>
                    </>
                  )}
                </CardContent>
                {!query.isLoading && !query.isError && (
                  <CardFooter className="flex items-center justify-end gap-2 border-t border-border pt-4">
                    {isSysDirty && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => sysForm.reset()}
                        disabled={saveSysMutation.isPending}
                      >
                        <RotateCcw className="mr-1.5 size-3.5" />
                        {t("settings.discardChanges")}
                      </Button>
                    )}
                    <Button type="submit" size="sm" disabled={saveSysMutation.isPending}>
                      {saveSysMutation.isPending && (
                        <Loader2 className="mr-1.5 size-4 animate-spin" />
                      )}
                      {t("settings.saveSettings")}
                    </Button>
                  </CardFooter>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="deployment" keepMounted className="mt-0">
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-1">
                      <CardTitle className="text-base">{t("settings.deployCardTitle")}</CardTitle>
                      <CardDescription>{t("settings.deployCardDesc")}</CardDescription>
                    </div>
                    {isSysDirty && (
                      <Badge variant="secondary" className="text-xs font-normal">
                        {t("settings.unsavedChanges")}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  {query.isError ? (
                    <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
                  ) : query.isLoading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ) : (
                    <>
                      <FormField
                        control={sysForm.control}
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
                                  sysForm.setValue("agent_image", DEFAULT_AGENT_IMAGE, {
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

                      <Separator />

                      <FormField
                        control={sysForm.control}
                        name="github_token"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("settings.githubToken")}</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Input
                                  type={showGithubToken ? "text" : "password"}
                                  autoComplete="off"
                                  placeholder={t("settings.githubTokenPlaceholder")}
                                  className="pr-9 font-mono text-xs sm:text-sm"
                                  {...field}
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="absolute top-1/2 right-1 size-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                  onClick={() => setShowGithubToken((v) => !v)}
                                  aria-label={
                                    showGithubToken
                                      ? t("common.hidePassword")
                                      : t("common.showPassword")
                                  }
                                >
                                  {showGithubToken ? (
                                    <EyeOff className="size-3.5" />
                                  ) : (
                                    <Eye className="size-3.5" />
                                  )}
                                </Button>
                              </div>
                            </FormControl>
                            <FormDescription>{t("settings.githubTokenDesc")}</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </>
                  )}
                </CardContent>
                {!query.isLoading && !query.isError && (
                  <CardFooter className="flex items-center justify-end gap-2 border-t border-border pt-4">
                    {isSysDirty && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => sysForm.reset()}
                        disabled={saveSysMutation.isPending}
                      >
                        <RotateCcw className="mr-1.5 size-3.5" />
                        {t("settings.discardChanges")}
                      </Button>
                    )}
                    <Button type="submit" size="sm" disabled={saveSysMutation.isPending}>
                      {saveSysMutation.isPending && (
                        <Loader2 className="mr-1.5 size-4 animate-spin" />
                      )}
                      {t("settings.saveSettings")}
                    </Button>
                  </CardFooter>
                )}
              </Card>
            </TabsContent>
          </form>
        </Form>

        {/* Appearance & Themes Tab */}
        <TabsContent value="appearance" className="mt-0">
          <AppearanceTab />
        </TabsContent>

        {/* Security & Password Tab */}
        <TabsContent value="security" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("settings.pwCardTitle")}</CardTitle>
              <CardDescription>{t("settings.pwCardDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/35 p-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {(admin?.username || "A").slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      {t("settings.currentAccountLabel")}
                    </div>
                    <div className="font-mono text-sm font-medium text-foreground">
                      {admin?.username || "admin"}
                    </div>
                  </div>
                </div>
                <Badge variant="secondary" className="text-xs font-normal">
                  {t("settings.adminRoleBadge")}
                </Badge>
              </div>

              <Form {...pwForm}>
                <form
                  id="password-settings-form"
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
                          <div className="relative">
                            <Input
                              type={showOldPw ? "text" : "password"}
                              autoComplete="current-password"
                              className="pr-9"
                              {...field}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute top-1/2 right-1 size-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              onClick={() => setShowOldPw((v) => !v)}
                              aria-label={
                                showOldPw ? t("common.hidePassword") : t("common.showPassword")
                              }
                            >
                              {showOldPw ? (
                                <EyeOff className="size-3.5" />
                              ) : (
                                <Eye className="size-3.5" />
                              )}
                            </Button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={pwForm.control}
                      name="new_password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("settings.newPassword")}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type={showNewPw ? "text" : "password"}
                                autoComplete="new-password"
                                className="pr-9"
                                {...field}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute top-1/2 right-1 size-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                onClick={() => setShowNewPw((v) => !v)}
                                aria-label={
                                  showNewPw ? t("common.hidePassword") : t("common.showPassword")
                                }
                              >
                                {showNewPw ? (
                                  <EyeOff className="size-3.5" />
                                ) : (
                                  <Eye className="size-3.5" />
                                )}
                              </Button>
                            </div>
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
                            <div className="relative">
                              <Input
                                type={showConfirmPw ? "text" : "password"}
                                autoComplete="new-password"
                                className="pr-9"
                                {...field}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute top-1/2 right-1 size-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                onClick={() => setShowConfirmPw((v) => !v)}
                                aria-label={
                                  showConfirmPw
                                    ? t("common.hidePassword")
                                    : t("common.showPassword")
                                }
                              >
                                {showConfirmPw ? (
                                  <EyeOff className="size-3.5" />
                                ) : (
                                  <Eye className="size-3.5" />
                                )}
                              </Button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {pwStrength > 0 && (
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-3 gap-1.5">
                        {[1, 2, 3].map((step) => (
                          <div
                            key={step}
                            className={cn(
                              "h-1.5 rounded-full transition-colors",
                              pwStrength >= step
                                ? pwStrength === 1
                                  ? "bg-destructive"
                                  : pwStrength === 2
                                    ? "bg-warning"
                                    : "bg-success"
                                : "bg-muted"
                            )}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {pwStrength === 1
                          ? t("settings.pwStrengthWeak")
                          : pwStrength === 2
                            ? t("settings.pwStrengthMedium")
                            : t("settings.pwStrengthStrong")}
                      </p>
                    </div>
                  )}
                </form>
              </Form>
            </CardContent>
            <CardFooter className="flex items-center justify-end border-t border-border pt-4">
              <Button
                type="submit"
                form="password-settings-form"
                size="sm"
                disabled={pwMutation.isPending}
              >
                {pwMutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                {t("settings.updatePassword")}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* Project Links Tab */}
        <TabsContent value="projects" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("settings.projectsCardTitle")}</CardTitle>
              <CardDescription>{t("settings.projectsCardDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-muted/25 p-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground">
                      <SimpleIconSvg path={siGithub.path} className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">mihob</div>
                      <div className="truncate font-mono text-xs text-muted-foreground">
                        tom2almighty/mihob
                      </div>
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {t("settings.projectMihobDesc")}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    render={
                      <a
                        href="https://github.com/tom2almighty/mihob"
                        target="_blank"
                        rel="noreferrer"
                      />
                    }
                    nativeButton={false}
                  >
                    <SimpleIconSvg path={siGithub.path} className="mr-1.5 size-3.5" />
                    {t("settings.openGithub")}
                    <ExternalLink className="ml-1 size-3 text-muted-foreground" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    render={
                      <a
                        href="https://github.com/tom2almighty/mihob/releases"
                        target="_blank"
                        rel="noreferrer"
                      />
                    }
                    nativeButton={false}
                  >
                    {t("settings.openReleases")}
                    <ExternalLink className="ml-1 size-3 text-muted-foreground" />
                  </Button>
                </div>
              </div>

              <div className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-muted/25 p-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground">
                      <SimpleIconSvg path={siGithub.path} className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">Mihomo</div>
                      <div className="truncate font-mono text-xs text-muted-foreground">
                        MetaCubeX/mihomo
                      </div>
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {t("settings.projectMihomoDesc")}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    render={
                      <a
                        href="https://github.com/MetaCubeX/mihomo"
                        target="_blank"
                        rel="noreferrer"
                      />
                    }
                    nativeButton={false}
                  >
                    <SimpleIconSvg path={siGithub.path} className="mr-1.5 size-3.5" />
                    {t("settings.openGithub")}
                    <ExternalLink className="ml-1 size-3 text-muted-foreground" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    render={
                      <a
                        href="https://wiki.metacubex.one/"
                        target="_blank"
                        rel="noreferrer"
                      />
                    }
                    nativeButton={false}
                  >
                    <BookOpen className="mr-1.5 size-3.5" />
                    {t("settings.openDocs")}
                    <ExternalLink className="ml-1 size-3 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
