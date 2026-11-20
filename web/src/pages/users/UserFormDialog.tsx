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
import { Checkbox } from "@/components/ui/checkbox"
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api, queryKeys } from "@/lib/api"
import { bytesToGB, gbToBytes } from "@/lib/format"
import type { User } from "@/lib/types"
import { cn } from "@/lib/utils"

type UserFormValues = {
  username: string
  email?: string
  traffic_limit_gb: number
  expire_date?: string
  template_id?: string
  all_nodes: boolean
  node_ids: number[]
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
  const [activeTab, setActiveTab] = useState<"basic" | "nodes">("basic")

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
        all_nodes: z.boolean(),
        node_ids: z.array(z.number()),
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
      all_nodes: true,
      node_ids: [],
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
        all_nodes: Boolean(user.all_nodes),
        node_ids: user.node_ids || [],
        enabled: user.enabled,
        remark: user.remark || "",
      })
    } else {
      form.reset({
        username: "",
        email: "",
        traffic_limit_gb: 100,
        expire_date: "",
        template_id: "default",
        all_nodes: true,
        node_ids: [],
        enabled: true,
        remark: "",
      })
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
        all_nodes: v.all_nodes,
        node_ids: v.all_nodes ? [] : v.node_ids,
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

  const selectedNodeIds = form.watch("node_ids")
  const allNodesEnabled = form.watch("all_nodes")
  const allNodesList = nodesQuery.data ?? []

  const toggleNode = (id: number, checked: boolean) => {
    const cur = form.getValues("node_ids")
    if (checked) {
      form.setValue("node_ids", Array.from(new Set([...cur, id])))
    } else {
      form.setValue("node_ids", cur.filter((x) => x !== id))
    }
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" expandable className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b border-border px-5 pt-5 pr-20 pb-4">
          <SheetTitle>
            {isEdit ? t("users.form.editTitle") : t("users.form.createTitle")}
          </SheetTitle>
          <SheetDescription>{t("users.form.desc")}</SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form
            id="user-form"
            onSubmit={form.handleSubmit((v) => mutation.mutate(v), handleInvalid)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as "basic" | "nodes")}
              className="flex min-h-0 flex-1 flex-col gap-0"
            >
              <div className="border-b border-border px-5 py-3">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="basic">{t("users.form.tabBasic")}</TabsTrigger>
                  <TabsTrigger value="nodes">
                    {allNodesEnabled
                      ? t("users.form.tabNodesAll")
                      : t("users.form.tabNodes", { count: selectedNodeIds.length })}
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4">
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
                              {(templatesQuery.data ?? []).map((tmpl) => (
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

                <TabsContent value="nodes" keepMounted className="mt-0 space-y-3.5">
                  <FormField
                    control={form.control}
                    name="all_nodes"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-md border border-border bg-muted/25 p-3">
                        <div className="space-y-0.5">
                          <FormLabel>{t("users.form.allNodes")}</FormLabel>
                          <FormDescription>{t("users.form.allNodesDesc")}</FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={(checked) => {
                              field.onChange(checked)
                              if (!checked && form.getValues("node_ids").length === 0) {
                                form.setValue(
                                  "node_ids",
                                  allNodesList.map((n) => n.id)
                                )
                              }
                            }}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <div className="flex items-center justify-between">
                    <FormLabel>
                      {t("users.form.authorizedNodes", {
                        count: allNodesEnabled ? allNodesList.length : selectedNodeIds.length,
                      })}
                    </FormLabel>
                    {!allNodesEnabled && (
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() =>
                            form.setValue(
                              "node_ids",
                              allNodesList.map((n) => n.id)
                            )
                          }
                        >
                          {t("common.selectAll")}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => form.setValue("node_ids", [])}
                        >
                          {t("common.clear")}
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-2">
                    {allNodesList.length === 0 ? (
                      <p className="col-span-2 py-8 text-center text-xs text-muted-foreground">
                        {t("users.form.noNodesHint")}
                      </p>
                    ) : (
                      allNodesList.map((n) => {
                        const checked = allNodesEnabled || selectedNodeIds.includes(n.id)
                        return (
                          <label
                            key={n.id}
                            className={cn(
                              "flex items-center gap-2.5 rounded-md border border-border/70 px-2.5 py-2 text-xs",
                              allNodesEnabled
                                ? "cursor-default bg-muted/30 opacity-75"
                                : "cursor-pointer hover:bg-muted/50"
                            )}
                          >
                            <Checkbox
                              checked={checked}
                              disabled={allNodesEnabled}
                              onCheckedChange={(v) => toggleNode(n.id, Boolean(v))}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium text-foreground">{n.name}</div>
                              <div className="truncate text-muted-foreground">
                                {t("users.form.nodeInboundCount", {
                                  host: n.host,
                                  count: n.inbound_count,
                                })}
                              </div>
                            </div>
                          </label>
                        )
                      })
                    )}
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </form>
        </Form>

        <SheetFooter className="flex-row justify-end gap-2 border-t border-border px-5 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form="user-form" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {isEdit ? t("users.form.saveAndSync") : t("users.createUser")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
