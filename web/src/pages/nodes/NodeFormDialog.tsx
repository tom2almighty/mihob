import { useEffect, useMemo, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
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
import { api, queryKeys } from "@/lib/api"
import { bytesToGB, gbToBytes } from "@/lib/format"
import type { Node } from "@/lib/types"

type NodeFormValues = {
  name: string
  host: string
  region?: string
  traffic_limit_gb: number
  traffic_used_gb?: number
  traffic_multiplier: number
  reset_day: number
  expire_date?: string
  billing_cycle?: string
  enabled: boolean
  remark?: string
}

function toLocalDateInput(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return format(d, "yyyy-MM-dd")
}

export function NodeFormDialog({
  open,
  onOpenChange,
  node,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  node: Node | null
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const isEdit = Boolean(node)
  const [activeTab, setActiveTab] = useState<"basic" | "traffic">("basic")

  const nodeSchema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t("nodes.form.validation.nameRequired")),
        host: z.string().trim().min(1, t("nodes.form.validation.hostRequired")),
        region: z.string().trim().optional(),
        traffic_limit_gb: z.coerce.number().min(0, t("nodes.form.validation.trafficMin")),
        traffic_used_gb: z.coerce.number().min(0, t("nodes.form.validation.trafficUsedMin")).optional(),
        traffic_multiplier: z.coerce
          .number()
          .min(0.1, t("nodes.form.validation.multiplierMin"))
          .max(100, t("nodes.form.validation.multiplierMax")),
        reset_day: z.coerce
          .number()
          .int()
          .min(1, t("nodes.form.validation.resetDayRange"))
          .max(31, t("nodes.form.validation.resetDayRange")),
        expire_date: z.string().optional(),
        billing_cycle: z.string().optional(),
        enabled: z.boolean(),
        remark: z.string().trim().optional(),
      }),
    [t]
  )

  const form = useForm<NodeFormValues>({
    resolver: zodResolver(nodeSchema),
    defaultValues: {
      name: "",
      host: "",
      region: "",
      traffic_limit_gb: 0,
      traffic_used_gb: 0,
      traffic_multiplier: 1,
      reset_day: 1,
      expire_date: "",
      billing_cycle: "none",
      enabled: true,
      remark: "",
    },
  })

  useEffect(() => {
    if (open) {
      setActiveTab("basic")
      if (node) {
        form.reset({
          name: node.name,
          host: node.host,
          region: node.region || "",
          traffic_limit_gb: bytesToGB(node.traffic_limit),
          traffic_used_gb: bytesToGB(node.traffic_used),
          traffic_multiplier: node.traffic_multiplier || 1,
          reset_day: node.reset_day || 1,
          expire_date: toLocalDateInput(node.expire_at),
          billing_cycle: node.billing_cycle || "none",
          enabled: node.enabled,
          remark: node.remark || "",
        })
      } else {
        form.reset({
          name: "",
          host: "",
          region: "",
          traffic_limit_gb: 0,
          traffic_used_gb: 0,
          traffic_multiplier: 1,
          reset_day: 1,
          expire_date: "",
          billing_cycle: "none",
          enabled: true,
          remark: "",
        })
      }
    }
  }, [open, node, form])

  const mutation = useMutation({
    mutationFn: (values: NodeFormValues) => {
      let expire_at: string | null = null
      if (values.expire_date) {
        expire_at = new Date(`${values.expire_date}T23:59:59`).toISOString()
      }
      const payload: Record<string, unknown> = {
        name: values.name,
        host: values.host,
        region: values.region || "",
        traffic_limit: gbToBytes(values.traffic_limit_gb),
        traffic_multiplier: values.traffic_multiplier,
        reset_day: values.reset_day,
        expire_at,
        billing_cycle: values.billing_cycle && values.billing_cycle !== "none" ? values.billing_cycle : "",
        enabled: values.enabled,
        remark: values.remark || "",
      }
      if (isEdit && node && form.formState.dirtyFields.traffic_used_gb) {
        payload.traffic_used = gbToBytes(values.traffic_used_gb ?? 0)
      }
      return isEdit && node ? api.updateNode(node.id, payload) : api.createNode(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.nodes })
      qc.invalidateQueries({ queryKey: queryKeys.dashboard })
      toast.success(isEdit ? t("nodes.toastUpdated") : t("nodes.toastCreated"))
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleInvalid = (errors: Record<string, unknown>) => {
    if (errors.name || errors.host || errors.region || errors.remark) {
      setActiveTab("basic")
    } else if (
      errors.traffic_limit_gb ||
      errors.traffic_used_gb ||
      errors.traffic_multiplier ||
      errors.reset_day ||
      errors.expire_date ||
      errors.billing_cycle
    ) {
      setActiveTab("traffic")
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" expandable className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border px-5 pt-5 pr-20 pb-4">
          <SheetTitle>
            {isEdit ? t("nodes.form.editTitle") : t("nodes.form.createTitle")}
          </SheetTitle>
          <SheetDescription>
            {isEdit ? t("nodes.form.editDesc") : t("nodes.form.createDesc")}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form
            id="node-form"
            onSubmit={form.handleSubmit((v) => mutation.mutate(v), handleInvalid)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as "basic" | "traffic")}
              className="flex min-h-0 flex-1 flex-col gap-0"
            >
              <div className="border-b border-border px-5 py-3">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="basic">{t("nodes.form.tabBasic")}</TabsTrigger>
                  <TabsTrigger value="traffic">{t("nodes.form.tabTraffic")}</TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                <div className="group-data-[expanded=true]/sheet:mx-auto group-data-[expanded=true]/sheet:w-full group-data-[expanded=true]/sheet:max-w-3xl">
                <TabsContent value="basic" keepMounted className="mt-0 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("nodes.form.name")}</FormLabel>
                          <FormControl>
                            <Input placeholder={t("nodes.form.namePlaceholder")} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="region"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("nodes.form.region")}</FormLabel>
                          <FormControl>
                            <Input placeholder={t("nodes.form.regionPlaceholder")} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="host"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("nodes.form.host")}</FormLabel>
                        <FormControl>
                          <Input placeholder={t("nodes.form.hostPlaceholder")} {...field} />
                        </FormControl>
                        <FormDescription>{t("nodes.form.hostDesc")}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="remark"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("nodes.form.remark")}</FormLabel>
                        <FormControl>
                          <Input placeholder={t("nodes.form.remarkPlaceholder")} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="enabled"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-md border border-border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>{t("nodes.form.enabled")}</FormLabel>
                          <FormDescription>{t("nodes.form.enabledDesc")}</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </TabsContent>

                <TabsContent value="traffic" keepMounted className="mt-0 space-y-4">
                  <div className={isEdit ? "grid gap-4 sm:grid-cols-2" : undefined}>
                    <FormField
                      control={form.control}
                      name="traffic_limit_gb"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("nodes.form.trafficLimit")}</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.5" min="0" className="tabular-nums" {...field} />
                          </FormControl>
                          <FormDescription>{t("nodes.form.trafficLimitDesc")}</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {isEdit && (
                      <FormField
                        control={form.control}
                        name="traffic_used_gb"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("nodes.form.trafficUsed")}</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                className="tabular-nums"
                                {...field}
                              />
                            </FormControl>
                            <FormDescription>{t("nodes.form.trafficUsedDesc")}</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="traffic_multiplier"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("nodes.form.multiplier")}</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.1" min="0.1" className="tabular-nums" {...field} />
                          </FormControl>
                          <FormDescription>{t("nodes.form.multiplierDesc")}</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="reset_day"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("nodes.form.resetDay")}</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              max={31}
                              step={1}
                              className="tabular-nums"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>{t("nodes.form.resetDayDesc")}</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="billing_cycle"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("nodes.form.billingCycle")}</FormLabel>
                          <Select
                            value={field.value || "none"}
                            onValueChange={(v) => field.onChange(v ?? "none")}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">{t("nodes.billingCycles.none")}</SelectItem>
                              <SelectItem value="monthly">{t("nodes.billingCycles.monthly")}</SelectItem>
                              <SelectItem value="quarterly">{t("nodes.billingCycles.quarterly")}</SelectItem>
                              <SelectItem value="semiannual">{t("nodes.billingCycles.semiannual")}</SelectItem>
                              <SelectItem value="yearly">{t("nodes.billingCycles.yearly")}</SelectItem>
                              <SelectItem value="onetime">{t("nodes.billingCycles.onetime")}</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="expire_date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("nodes.form.expireDate")}</FormLabel>
                          <FormControl>
                            <DatePickerWithPresets
                              value={field.value}
                              onChange={field.onChange}
                              placeholder={t("nodes.form.expireDatePlaceholder")}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </TabsContent>
                </div>
              </div>
            </Tabs>
          </form>
        </Form>

        <SheetFooter className="flex-row justify-end gap-2 border-t border-border px-5 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form="node-form" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {isEdit ? t("nodes.form.saveChanges") : t("nodes.createNode")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
