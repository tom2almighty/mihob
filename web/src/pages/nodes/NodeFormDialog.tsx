import { useEffect, useMemo, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
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
  traffic_multiplier: number
  reset_day: number
  enabled: boolean
  remark?: string
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
        traffic_multiplier: z.coerce
          .number()
          .min(0.1, t("nodes.form.validation.multiplierMin"))
          .max(100, t("nodes.form.validation.multiplierMax")),
        reset_day: z.coerce
          .number()
          .int()
          .min(1, t("nodes.form.validation.resetDayRange"))
          .max(28, t("nodes.form.validation.resetDayRange")),
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
      traffic_multiplier: 1,
      reset_day: 1,
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
          traffic_multiplier: node.traffic_multiplier || 1,
          reset_day: node.reset_day || 1,
          enabled: node.enabled,
          remark: node.remark || "",
        })
      } else {
        form.reset({
          name: "",
          host: "",
          region: "",
          traffic_limit_gb: 0,
          traffic_multiplier: 1,
          reset_day: 1,
          enabled: true,
          remark: "",
        })
      }
    }
  }, [open, node, form])

  const mutation = useMutation({
    mutationFn: (values: NodeFormValues) => {
      const payload = {
        name: values.name,
        host: values.host,
        region: values.region || "",
        traffic_limit: gbToBytes(values.traffic_limit_gb),
        traffic_multiplier: values.traffic_multiplier,
        reset_day: values.reset_day,
        enabled: values.enabled,
        remark: values.remark || "",
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
    } else if (errors.traffic_limit_gb || errors.traffic_multiplier || errors.reset_day) {
      setActiveTab("traffic")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("nodes.form.editTitle") : t("nodes.form.createTitle")}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? t("nodes.form.editDesc") : t("nodes.form.createDesc")}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            id="node-form"
            onSubmit={form.handleSubmit((v) => mutation.mutate(v), handleInvalid)}
            className="flex flex-col gap-3"
          >
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as "basic" | "traffic")}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="basic">{t("nodes.form.tabBasic")}</TabsTrigger>
                <TabsTrigger value="traffic">{t("nodes.form.tabTraffic")}</TabsTrigger>
              </TabsList>

              <div className="mt-3 h-[340px] max-h-[58vh] overflow-y-auto px-1 py-1">
                <TabsContent
                  value="basic"
                  forceMount
                  className="mt-0 space-y-4 data-[state=inactive]:hidden"
                >
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

                <TabsContent
                  value="traffic"
                  forceMount
                  className="mt-0 space-y-4 data-[state=inactive]:hidden"
                >
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
                            <Input type="number" min="1" max="28" className="tabular-nums" {...field} />
                          </FormControl>
                          <FormDescription>{t("nodes.form.resetDayDesc")}</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
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
          <Button type="submit" form="node-form" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {isEdit ? t("nodes.form.saveChanges") : t("nodes.createNode")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
