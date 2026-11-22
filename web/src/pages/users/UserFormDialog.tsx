import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { zodResolver } from "@hookform/resolvers/zod"
import { format } from "date-fns"
import { z } from "zod"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { DatePickerWithPresets } from "@/components/common/DatePickerWithPresets"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DEFAULT_ACCESS_POLICY,
  normalizeAccessPolicy,
  validateRegex,
} from "@/lib/accessPolicy"
import { api, queryKeys } from "@/lib/api"
import { bytesToGB, gbToBytes } from "@/lib/format"
import type { AccessPolicy, User } from "@/lib/types"
import { AccessPolicyEditor } from "./AccessPolicyEditor"

type UserFormValues = {
  username: string
  email?: string
  traffic_limit_gb: number
  expire_date?: string
  template_id?: string
  enabled: boolean
  remark?: string
}

function toLocalDateInput(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return format(d, "yyyy-MM-dd")
}

export function UserFormDialog({
  open,
  onOpenChange,
  user,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: User | null
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const isEdit = Boolean(user)
  const [activeTab, setActiveTab] = useState<"basic" | "access">("basic")
  const [accessPolicy, setAccessPolicy] = useState<AccessPolicy>(DEFAULT_ACCESS_POLICY)

  const userSchema = useMemo(
    () =>
      z.object({
        username: z
          .string()
          .trim()
          .min(1, t("users.form.validation.usernameRequired"))
          .regex(/^[a-zA-Z0-9._-]+$/, t("users.form.validation.usernamePattern")),
        email: z.string().trim().optional(),
        traffic_limit_gb: z.coerce.number().min(0, t("users.form.validation.trafficMin")),
        expire_date: z.string().optional(),
        template_id: z.string().optional(),
        enabled: z.boolean(),
        remark: z.string().trim().optional(),
      }),
    [t]
  )

  const nodesQuery = useQuery({
    queryKey: queryKeys.nodes,
    queryFn: api.listNodes,
    enabled: open,
  })

  const inboundsQuery = useQuery({
    queryKey: queryKeys.allInbounds,
    queryFn: api.listAllInbounds,
    enabled: open,
  })

  const templatesQuery = useQuery({
    queryKey: queryKeys.templates,
    queryFn: api.listTemplates,
    enabled: open,
  })

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      username: "",
      email: "",
      traffic_limit_gb: 100,
      expire_date: "",
      template_id: "default",
      enabled: true,
      remark: "",
    },
  })

  useEffect(() => {
    if (!open) return
    setActiveTab("basic")
    if (user) {
      form.reset({
        username: user.username,
        email: user.email || "",
        traffic_limit_gb: bytesToGB(user.traffic_limit),
        expire_date: toLocalDateInput(user.expire_at),
        template_id: user.template_id ? String(user.template_id) : "default",
        enabled: user.enabled,
        remark: user.remark || "",
      })
      setAccessPolicy(normalizeAccessPolicy(user.access_policy))
    } else {
      form.reset({
        username: "",
        email: "",
        traffic_limit_gb: 100,
        expire_date: "",
        template_id: "default",
        enabled: true,
        remark: "",
      })
      setAccessPolicy(normalizeAccessPolicy(DEFAULT_ACCESS_POLICY))
    }
  }, [open, user, form])

  const mutation = useMutation({
    mutationFn: (v: UserFormValues) => {
      let expire_at: string | null = null
      if (v.expire_date) {
        expire_at = new Date(`${v.expire_date}T23:59:59`).toISOString()
      }
      const payload = {
        username: v.username,
        email: v.email || "",
        traffic_limit: gbToBytes(v.traffic_limit_gb),
        expire_at,
        template_id: v.template_id && v.template_id !== "default" ? Number(v.template_id) : null,
        access_policy: accessPolicy,
        enabled: v.enabled,
        remark: v.remark || "",
      }
      return isEdit && user ? api.updateUser(user.id, payload) : api.createUser(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.users })
      qc.invalidateQueries({ queryKey: queryKeys.dashboard })
      toast.success(isEdit ? t("users.toastUpdated") : t("users.toastCreated"))
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleSubmit = (values: UserFormValues) => {
    const nodeReErr =
      accessPolicy.node_mode === "rule" ? validateRegex(accessPolicy.node_name_regex ?? "") : null
    const inbReErr =
      accessPolicy.inbound_mode === "rule"
        ? validateRegex(accessPolicy.inbound_name_regex ?? "")
        : null
    if (nodeReErr || inbReErr) {
      setActiveTab("access")
      toast.error(t("users.form.invalidRegex", { error: nodeReErr || inbReErr || "" }))
      return
    }
    mutation.mutate(values)
  }

  const handleInvalid = (errors: Record<string, unknown>) => {
    if (
      errors.username ||
      errors.email ||
      errors.traffic_limit_gb ||
      errors.expire_date ||
      errors.template_id ||
      errors.remark
    ) {
      setActiveTab("basic")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(660px,88vh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 border-b border-border px-6 pt-5 pr-14 pb-4">
          <DialogTitle>
            {isEdit ? t("users.form.editTitle") : t("users.form.createTitle")}
          </DialogTitle>
          <DialogDescription>{t("users.form.desc")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            id="user-form"
            onSubmit={form.handleSubmit(handleSubmit, handleInvalid)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as "basic" | "access")}
              className="flex min-h-0 flex-1 flex-col gap-0"
            >
              <div className="shrink-0 border-b border-border px-6 py-2.5">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="basic">{t("users.form.tabBasic")}</TabsTrigger>
                  <TabsTrigger value="access">{t("users.form.tabAccess")}</TabsTrigger>
                </TabsList>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                <TabsContent value="basic" keepMounted className="mt-0 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("users.form.username")}</FormLabel>
                          <FormControl>
                            <Input placeholder={t("users.form.usernamePlaceholder")} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("users.form.email")}</FormLabel>
                          <FormControl>
                            <Input placeholder="alice@example.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="traffic_limit_gb"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("users.form.trafficLimit")}</FormLabel>
                          <FormControl>
                            <Input type="number" min="0" step="1" className="tabular-nums" {...field} />
                          </FormControl>
                          <FormDescription>{t("users.form.trafficLimitDesc")}</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="template_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("users.form.template")}</FormLabel>
                          <Select
                            value={field.value}
                            onValueChange={(v) => field.onChange(v ?? "default")}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="default">{t("users.form.templateDefault")}</SelectItem>
                              {(templatesQuery.data ?? [])
                                .filter((tmpl) => tmpl.kind !== "server")
                                .map((tmpl) => (
                                  <SelectItem key={tmpl.id} value={String(tmpl.id)}>
                                    {tmpl.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="expire_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("users.form.expireDate")}</FormLabel>
                        <FormControl>
                          <DatePickerWithPresets
                            value={field.value}
                            onChange={field.onChange}
                            placeholder={t("users.form.permanentPlaceholder")}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="remark"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("users.form.remark")}</FormLabel>
                        <FormControl>
                          <Input placeholder={t("users.form.remarkPlaceholder")} {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="enabled"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-md border border-border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>{t("users.form.enabled")}</FormLabel>
                          <FormDescription>{t("users.form.enabledDesc")}</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </TabsContent>

                <TabsContent value="access" keepMounted className="mt-0">
                  <AccessPolicyEditor
                    value={accessPolicy}
                    onChange={setAccessPolicy}
                    nodes={nodesQuery.data ?? []}
                    allInbounds={inboundsQuery.data ?? []}
                  />
                </TabsContent>
              </div>
            </Tabs>
          </form>
        </Form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form="user-form" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {isEdit ? t("users.form.saveAndSync") : t("users.createUser")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
