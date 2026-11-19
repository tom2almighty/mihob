import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { zodResolver } from "@hookform/resolvers/zod"
import { format, isValid, parse } from "date-fns"
import { enUS, zhCN } from "date-fns/locale"
import { z } from "zod"
import { CalendarIcon, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api, queryKeys } from "@/lib/api"
import { bytesToGB, gbToBytes } from "@/lib/format"
import { normalizeLanguage } from "@/lib/i18n"
import type { User } from "@/lib/types"
import { cn } from "@/lib/utils"

type UserFormValues = {
  username: string
  email?: string
  traffic_limit_gb: number
  expire_date?: string
  template_id?: string
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

function parseDateInput(value?: string): Date | undefined {
  if (!value) return undefined
  const parsed = parse(value, "yyyy-MM-dd", new Date())
  return isValid(parsed) ? parsed : undefined
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
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const isEdit = Boolean(user)
  const [activeTab, setActiveTab] = useState<"basic" | "nodes">("basic")
  const [expireOpen, setExpireOpen] = useState(false)
  const calendarLocale = normalizeLanguage(i18n.resolvedLanguage || i18n.language) === "zh-CN" ? zhCN : enUS
  const currentYear = new Date().getFullYear()

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
      traffic_limit_gb: 0,
      expire_date: "",
      template_id: "default",
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
        node_ids: [],
        enabled: true,
        remark: "",
      })
    }
  }, [open, user, form])

  const addDays = (days: number) => {
    const d = new Date()
    d.setDate(d.getDate() + days)
    form.setValue("expire_date", format(d, "yyyy-MM-dd"), {
      shouldDirty: true,
      shouldValidate: true,
    })
  }

  const setPermanent = () => {
    form.setValue("expire_date", "", {
      shouldDirty: true,
      shouldValidate: true,
    })
    setExpireOpen(false)
  }

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
        node_ids: v.node_ids,
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("users.form.editTitle") : t("users.form.createTitle")}
          </DialogTitle>
          <DialogDescription>{t("users.form.desc")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            id="user-form"
            onSubmit={form.handleSubmit((v) => mutation.mutate(v), handleInvalid)}
            className="flex flex-col gap-3"
          >
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "basic" | "nodes")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="basic">{t("users.form.tabBasic")}</TabsTrigger>
                <TabsTrigger value="nodes">
                  {t("users.form.tabNodes", { count: selectedNodeIds.length })}
                </TabsTrigger>
              </TabsList>

              <div className="mt-3 h-[410px] max-h-[58vh] overflow-y-auto px-1 py-1">
                <TabsContent
                  value="basic"
                  forceMount
                  className="mt-0 space-y-4 data-[state=inactive]:hidden"
                >
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
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger>
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
                    render={({ field }) => {
                      const selectedDate = parseDateInput(field.value)
                      const isPermanent = !selectedDate
                      return (
                        <FormItem>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <FormLabel>{t("users.form.expireDate")}</FormLabel>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={() => addDays(30)}
                              >
                                {t("users.form.plus30d")}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={() => addDays(90)}
                              >
                                {t("users.form.plus90d")}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={() => addDays(365)}
                              >
                                {t("users.form.plus1y")}
                              </Button>
                              <Button
                                type="button"
                                variant={isPermanent ? "secondary" : "ghost"}
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={setPermanent}
                              >
                                {t("users.form.permanent")}
                              </Button>
                            </div>
                          </div>
                          <Popover open={expireOpen} onOpenChange={setExpireOpen} modal>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className={cn(
                                    "w-full justify-start font-normal tabular-nums",
                                    isPermanent && "text-muted-foreground"
                                  )}
                                >
                                  <CalendarIcon className="mr-2 size-4 shrink-0 text-muted-foreground" />
                                  <span>
                                    {selectedDate
                                      ? format(selectedDate, "yyyy-MM-dd")
                                      : t("users.form.permanentPlaceholder")}
                                  </span>
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                locale={calendarLocale}
                                captionLayout="dropdown"
                                selected={selectedDate}
                                defaultMonth={selectedDate ?? new Date()}
                                startMonth={new Date(currentYear - 1, 0)}
                                endMonth={new Date(currentYear + 20, 11)}
                                onSelect={(date) => {
                                  field.onChange(date ? format(date, "yyyy-MM-dd") : "")
                                  setExpireOpen(false)
                                }}
                              />
                            </PopoverContent>
                          </Popover>
                        </FormItem>
                      )
                    }}
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

                <TabsContent
                  value="nodes"
                  forceMount
                  className="mt-0 space-y-3 data-[state=inactive]:hidden"
                >
                  <div className="flex items-center justify-between">
                    <FormLabel>
                      {t("users.form.authorizedNodes", { count: selectedNodeIds.length })}
                    </FormLabel>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() =>
                          form.setValue(
                            "node_ids",
                            (nodesQuery.data ?? []).map((n) => n.id)
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
                  </div>
                  <div className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-2">
                    {(nodesQuery.data ?? []).length === 0 ? (
                      <p className="col-span-2 py-8 text-center text-xs text-muted-foreground">
                        {t("users.form.noNodesHint")}
                      </p>
                    ) : (
                      (nodesQuery.data ?? []).map((n) => {
                        const checked = selectedNodeIds.includes(n.id)
                        return (
                          <label
                            key={n.id}
                            className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border/70 px-2.5 py-2 text-xs hover:bg-muted/50"
                          >
                            <Checkbox
                              checked={checked}
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
