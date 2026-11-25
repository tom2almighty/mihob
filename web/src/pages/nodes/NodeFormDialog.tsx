import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { zodResolver } from "@hookform/resolvers/zod"
import { format } from "date-fns"
import { z } from "zod"
import { Eye, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { CopyButton } from "@/components/common/CommonUI"
import { DatePickerWithPresets } from "@/components/common/DatePickerWithPresets"
import { TagInput } from "@/components/common/TagInput"
import { YamlCodeBlock, YamlEditor } from "@/components/common/YamlEditor"
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
import { api, queryKeys } from "@/lib/api"
import { bytesToGB, gbToBytes } from "@/lib/format"
import type { Node, NodeOutboundConfig } from "@/lib/types"
import { NodeOutboundEditor } from "./NodeOutboundEditor"

type NodeFormValues = {
  name: string
  host: string
  region?: string
  tags: string[]
  traffic_limit_gb: number
  traffic_used_gb?: number
  traffic_multiplier: number
  reset_day: number
  expire_date?: string
  billing_cycle?: string
  enabled: boolean
  remark?: string
  server_template_id: string
  server_log_level: string
  server_ipv6: string
  extra_server_yaml: string
}

function toLocalDateInput(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return format(d, "yyyy-MM-dd")
}

function ipv6ToSelectValue(v: boolean | null | undefined): string {
  if (v === true) return "true"
  if (v === false) return "false"
  return "follow"
}

function selectValueToIPv6(v: string): boolean | null {
  if (v === "true") return true
  if (v === "false") return false
  return null
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
  const [activeTab, setActiveTab] = useState<"basic" | "traffic" | "outbound" | "config">("basic")
  const [outboundConfig, setOutboundConfig] = useState<NodeOutboundConfig>({
    outbounds: [],
    routing: { mode: "none", target: "", rule_presets: [], custom_domains: [] },
  })
  const [previewYAML, setPreviewYAML] = useState<string>("")

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

  const inboundsQuery = useQuery({
    queryKey: queryKeys.allInbounds,
    queryFn: api.listAllInbounds,
    enabled: open,
  })

  const serverTemplates = useMemo(
    () => (templatesQuery.data ?? []).filter((tmpl) => tmpl.kind === "server"),
    [templatesQuery.data]
  )

  const defaultServerTemplate = useMemo(
    () => serverTemplates.find((tmpl) => tmpl.is_default) ?? serverTemplates[0] ?? null,
    [serverTemplates]
  )

  const tagSuggestions = useMemo(() => {
    const set = new Set<string>()
    for (const n of nodesQuery.data ?? []) {
      for (const tag of n.tags ?? []) {
        if (tag.trim()) set.add(tag.trim())
      }
    }
    return Array.from(set)
  }, [nodesQuery.data])

  const nodeSchema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t("nodes.form.validation.nameRequired")),
        host: z.string().trim().min(1, t("nodes.form.validation.hostRequired")),
        region: z.string().trim().optional(),
        tags: z.array(z.string()),
        traffic_limit_gb: z.coerce.number().min(0, t("nodes.form.validation.trafficMin")),
        traffic_used_gb: z.coerce
          .number()
          .min(0, t("nodes.form.validation.trafficUsedMin"))
          .optional(),
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
        server_template_id: z.string(),
        server_log_level: z.string(),
        server_ipv6: z.string(),
        extra_server_yaml: z.string(),
      }),
    [t]
  )

  const form = useForm<NodeFormValues>({
    resolver: zodResolver(nodeSchema),
    defaultValues: {
      name: "",
      host: "",
      region: "",
      tags: [],
      traffic_limit_gb: 0,
      traffic_used_gb: 0,
      traffic_multiplier: 1,
      reset_day: 1,
      expire_date: "",
      billing_cycle: "none",
      enabled: true,
      remark: "",
      server_template_id: "default",
      server_log_level: "follow",
      server_ipv6: "follow",
      extra_server_yaml: "",
    },
  })

  useEffect(() => {
    if (open) {
      setActiveTab("basic")
      setPreviewYAML("")
      if (node) {
        setOutboundConfig({
          outbounds: node.outbound_config?.outbounds ?? [],
          routing: {
            mode: node.outbound_config?.routing?.mode || "none",
            target: node.outbound_config?.routing?.target || "",
            rule_presets: node.outbound_config?.routing?.rule_presets ?? [],
            custom_domains: node.outbound_config?.routing?.custom_domains ?? [],
          },
        })
        form.reset({
          name: node.name,
          host: node.host,
          region: node.region || "",
          tags: node.tags ?? [],
          traffic_limit_gb: bytesToGB(node.traffic_limit),
          traffic_used_gb: bytesToGB(node.traffic_used),
          traffic_multiplier: node.traffic_multiplier || 1,
          reset_day: node.reset_day || 1,
          expire_date: toLocalDateInput(node.expire_at),
          billing_cycle: node.billing_cycle || "none",
          enabled: node.enabled,
          remark: node.remark || "",
          server_template_id: node.server_template_id ? String(node.server_template_id) : "default",
          server_log_level: node.server_log_level || "follow",
          server_ipv6: ipv6ToSelectValue(node.server_ipv6),
          extra_server_yaml: node.extra_server_yaml || "",
        })
      } else {
        setOutboundConfig({
          outbounds: [],
          routing: { mode: "none", target: "", rule_presets: [], custom_domains: [] },
        })
        form.reset({
          name: "",
          host: "",
          region: "",
          tags: [],
          traffic_limit_gb: 0,
          traffic_used_gb: 0,
          traffic_multiplier: 1,
          reset_day: 1,
          expire_date: "",
          billing_cycle: "none",
          enabled: true,
          remark: "",
          server_template_id: "default",
          server_log_level: "follow",
          server_ipv6: "follow",
          extra_server_yaml: "",
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
        tags: values.tags ?? [],
        traffic_limit: gbToBytes(values.traffic_limit_gb),
        traffic_multiplier: values.traffic_multiplier,
        reset_day: values.reset_day,
        expire_at,
        billing_cycle:
          values.billing_cycle && values.billing_cycle !== "none" ? values.billing_cycle : "",
        enabled: values.enabled,
        remark: values.remark || "",
        server_template_id:
          values.server_template_id && values.server_template_id !== "default"
            ? Number(values.server_template_id)
            : null,
        server_log_level:
          values.server_log_level && values.server_log_level !== "follow"
            ? values.server_log_level
            : "",
        server_ipv6: selectValueToIPv6(values.server_ipv6),
        outbound_config: outboundConfig,
        extra_server_yaml: values.extra_server_yaml || "",
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

  const previewMutation = useMutation({
    mutationFn: () => {
      const v = form.getValues()
      const ipv6Val = selectValueToIPv6(v.server_ipv6)
      return api.previewServerConfig({
        node_id: node?.id ?? null,
        use_draft_template: true,
        template_id:
          v.server_template_id && v.server_template_id !== "default"
            ? Number(v.server_template_id)
            : null,
        server_log_level:
          v.server_log_level && v.server_log_level !== "follow" ? v.server_log_level : "",
        server_ipv6: ipv6Val,
        clear_server_ipv6: ipv6Val === null,
        outbound_config: outboundConfig,
        extra_server_yaml: v.extra_server_yaml || "",
      })
    },
    onSuccess: (res) => setPreviewYAML(res.yaml),
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
    } else if (
      errors.server_template_id ||
      errors.server_log_level ||
      errors.server_ipv6 ||
      errors.extra_server_yaml
    ) {
      setActiveTab("config")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        expandable
        className="flex h-[min(680px,88vh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
      >
        <DialogHeader className="shrink-0 border-b border-border px-6 pt-5 pr-20 pb-4">
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
            className="flex min-h-0 flex-1 flex-col"
          >
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as "basic" | "traffic" | "outbound" | "config")}
              className="flex min-h-0 flex-1 flex-col gap-0"
            >
              <div className="shrink-0 border-b border-border px-6 py-2.5">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="basic">{t("nodes.form.tabBasic")}</TabsTrigger>
                  <TabsTrigger value="traffic">{t("nodes.form.tabTraffic")}</TabsTrigger>
                  <TabsTrigger value="outbound">{t("nodes.form.tabOutbound")}</TabsTrigger>
                  <TabsTrigger value="config">{t("nodes.form.tabConfig")}</TabsTrigger>
                </TabsList>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
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
                    name="tags"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("nodes.form.tags")}</FormLabel>
                        <FormControl>
                          <TagInput
                            value={field.value ?? []}
                            onChange={field.onChange}
                            suggestions={tagSuggestions}
                            placeholder={t("nodes.form.tagsPlaceholder")}
                          />
                        </FormControl>
                        <FormDescription>{t("nodes.form.tagsDesc")}</FormDescription>
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
                            <Input
                              type="number"
                              step="0.5"
                              min="0"
                              className="tabular-nums"
                              {...field}
                            />
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
                            <Input
                              type="number"
                              step="0.1"
                              min="0.1"
                              className="tabular-nums"
                              {...field}
                            />
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
                              <SelectItem value="monthly">
                                {t("nodes.billingCycles.monthly")}
                              </SelectItem>
                              <SelectItem value="quarterly">
                                {t("nodes.billingCycles.quarterly")}
                              </SelectItem>
                              <SelectItem value="semiannual">
                                {t("nodes.billingCycles.semiannual")}
                              </SelectItem>
                              <SelectItem value="yearly">
                                {t("nodes.billingCycles.yearly")}
                              </SelectItem>
                              <SelectItem value="onetime">
                                {t("nodes.billingCycles.onetime")}
                              </SelectItem>
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

                <TabsContent value="outbound" keepMounted className="mt-0 space-y-4">
                  <NodeOutboundEditor
                    value={outboundConfig}
                    onChange={setOutboundConfig}
                    nodes={nodesQuery.data ?? []}
                    inbounds={inboundsQuery.data ?? []}
                    excludeNodeId={node?.id}
                    previewYAML={previewYAML}
                    previewPending={previewMutation.isPending}
                    onPreview={() => previewMutation.mutate()}
                  />
                </TabsContent>

                <TabsContent value="config" keepMounted className="mt-0 space-y-4">
                  <FormField
                    control={form.control}
                    name="server_template_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("nodes.form.serverTemplate")}</FormLabel>
                        <Select
                          value={field.value || "default"}
                          onValueChange={(v) => field.onChange(v ?? "default")}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="default">
                              {defaultServerTemplate
                                ? t("nodes.form.serverTemplateDefaultNamed", {
                                    name: defaultServerTemplate.name,
                                  })
                                : t("nodes.form.serverTemplateDefault")}
                            </SelectItem>
                            {serverTemplates.map((tmpl) => (
                              <SelectItem key={tmpl.id} value={String(tmpl.id)}>
                                {tmpl.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>{t("nodes.form.serverTemplateDesc")}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="server_log_level"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("nodes.form.serverLogLevel")}</FormLabel>
                          <Select
                            value={field.value || "follow"}
                            onValueChange={(v) => field.onChange(v ?? "follow")}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="follow">
                                {t("nodes.form.followTemplate")}
                              </SelectItem>
                              <SelectItem value="silent">silent</SelectItem>
                              <SelectItem value="error">error</SelectItem>
                              <SelectItem value="warning">warning</SelectItem>
                              <SelectItem value="info">info</SelectItem>
                              <SelectItem value="debug">debug</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="server_ipv6"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("nodes.form.serverIPv6")}</FormLabel>
                          <Select
                            value={field.value || "follow"}
                            onValueChange={(v) => field.onChange(v ?? "follow")}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="follow">
                                {t("nodes.form.followTemplate")}
                              </SelectItem>
                              <SelectItem value="true">{t("nodes.form.ipv6Enabled")}</SelectItem>
                              <SelectItem value="false">{t("nodes.form.ipv6Disabled")}</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="extra_server_yaml"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("nodes.form.extraServerYaml")}</FormLabel>
                        <FormControl>
                          <YamlEditor
                            name={field.name}
                            value={field.value}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            minHeightClass="min-h-[160px]"
                          />
                        </FormControl>
                        <FormDescription>{t("nodes.form.extraServerYamlDesc")}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="text-sm font-medium">{t("nodes.form.previewTitle")}</div>
                        <div className="text-xs text-muted-foreground">
                          {t("nodes.form.previewDesc")}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {previewYAML && (
                          <CopyButton
                            value={previewYAML}
                            label={t("templates.copyYaml")}
                            size="sm"
                            variant="outline"
                          />
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={previewMutation.isPending}
                          onClick={() => previewMutation.mutate()}
                        >
                          {previewMutation.isPending ? (
                            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                          ) : (
                            <Eye className="mr-1.5 size-3.5" />
                          )}
                          {previewYAML
                            ? t("nodes.form.refreshPreview")
                            : t("nodes.form.previewBtn")}
                        </Button>
                      </div>
                    </div>
                    {previewYAML && <YamlCodeBlock value={previewYAML} className="max-h-64" />}
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </form>
        </Form>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
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
