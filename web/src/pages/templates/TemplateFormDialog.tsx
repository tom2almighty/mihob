import { useEffect, useMemo } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { NodeProxyRefPicker } from "@/components/common/NodeProxyRefPicker"
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
import { YamlEditor } from "@/components/common/YamlEditor"
import { api, queryKeys } from "@/lib/api"
import type { Template, TemplateKind } from "@/lib/types"
import { TemplateRuleHelper } from "./TemplateRuleHelper"

type TemplateFormValues = {
  name: string
  description?: string
  content: string
  is_default: boolean
}

const CLIENT_STARTER_YAML = `mixed-port: 7890
allow-lan: false
mode: rule
log-level: info
ipv6: true

proxies:
{{PROXIES}}

proxy-groups:
  - name: "Proxy"
    type: select
    proxies:
{{PROXY_NAMES}}
      - DIRECT

rules:
  - GEOIP,LAN,DIRECT,no-resolve
  - GEOIP,CN,DIRECT,no-resolve
  - MATCH,Proxy
`

const SERVER_PRESET_DIRECT = `mode: direct
log-level: info
ipv6: true
allow-lan: false
`

const SERVER_PRESET_AUDIT = `mode: rule
log-level: info
ipv6: true
allow-lan: false

sniffer:
  enable: true
  parse-pure-ip: true
  sniff:
    HTTP:
      ports: [80, 8080-8880]
    TLS:
      ports: [443, 8443]
    QUIC:
      ports: [443, 8443]

rules:
  - DST-PORT,25,REJECT
  - DST-PORT,465,REJECT
  - DST-PORT,587,REJECT
  - DOMAIN-KEYWORD,announce,REJECT
  - DOMAIN-KEYWORD,torrent,REJECT
  - DOMAIN-KEYWORD,peer_id,REJECT
  - DOMAIN-KEYWORD,info_hash,REJECT
  - DST-PORT,6881-6889,REJECT
  - IP-CIDR,127.0.0.0/8,REJECT,no-resolve
  - IP-CIDR,10.0.0.0/8,REJECT,no-resolve
  - IP-CIDR,172.16.0.0/12,REJECT,no-resolve
  - IP-CIDR,192.168.0.0/16,REJECT,no-resolve
  - MATCH,DIRECT
`

const SERVER_PRESET_WARP = `mode: rule
log-level: info
ipv6: true
allow-lan: false

sniffer:
  enable: true
  parse-pure-ip: true
  sniff:
    HTTP:
      ports: [80, 8080-8880]
    TLS:
      ports: [443, 8443]
    QUIC:
      ports: [443, 8443]

proxies:
  - name: UNLOCK
    type: socks5
    server: 127.0.0.1
    port: 40000

rules:
  - DOMAIN-SUFFIX,openai.com,UNLOCK
  - DOMAIN-SUFFIX,chatgpt.com,UNLOCK
  - DOMAIN-SUFFIX,claude.ai,UNLOCK
  - DOMAIN-SUFFIX,anthropic.com,UNLOCK
  - DOMAIN-SUFFIX,netflix.com,UNLOCK
  - DOMAIN-SUFFIX,nflxvideo.net,UNLOCK
  - DOMAIN-SUFFIX,disneyplus.com,UNLOCK
  - MATCH,DIRECT
`

function buildServerPresetChain(sampleNodeName: string): string {
  const escaped = JSON.stringify(sampleNodeName || "US-LA-01")
  return `mode: rule
log-level: info
ipv6: true
allow-lan: false

sniffer:
  enable: true
  parse-pure-ip: true
  sniff:
    HTTP:
      ports: [80, 8080-8880]
    TLS:
      ports: [443, 8443]
    QUIC:
      ports: [443, 8443]

proxies:
  - name: UNLOCK-NODE
    type: mihob-node
    node: ${escaped}

rules:
  - DOMAIN-SUFFIX,openai.com,UNLOCK-NODE
  - DOMAIN-SUFFIX,chatgpt.com,UNLOCK-NODE
  - DOMAIN-SUFFIX,claude.ai,UNLOCK-NODE
  - DOMAIN-SUFFIX,anthropic.com,UNLOCK-NODE
  - DOMAIN-SUFFIX,netflix.com,UNLOCK-NODE
  - DOMAIN-SUFFIX,nflxvideo.net,UNLOCK-NODE
  - DOMAIN-SUFFIX,disneyplus.com,UNLOCK-NODE
  - MATCH,DIRECT
`
}

export function TemplateFormDialog({
  open,
  onOpenChange,
  template,
  defaultKind = "client",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: Template | null
  defaultKind?: TemplateKind
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const isEdit = Boolean(template)
  const kind: TemplateKind = template?.kind ?? defaultKind
  const isServer = kind === "server"

  const nodesQuery = useQuery({
    queryKey: queryKeys.nodes,
    queryFn: api.listNodes,
    enabled: open && isServer,
  })

  const inboundsQuery = useQuery({
    queryKey: queryKeys.allInbounds,
    queryFn: api.listAllInbounds,
    enabled: open && isServer,
  })

  const sampleChainNodeName = useMemo(
    () => (nodesQuery.data ?? []).find((n) => n.enabled)?.name ?? "US-LA-01",
    [nodesQuery.data]
  )

  const templateSchema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t("templates.form.validation.nameRequired")),
        description: z.string().trim().optional(),
        content: z.string().min(5, t("templates.form.validation.contentMin")),
        is_default: z.boolean(),
      }),
    [t]
  )

  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      name: "",
      description: "",
      content: isServer ? SERVER_PRESET_DIRECT : CLIENT_STARTER_YAML,
      is_default: false,
    },
  })

  useEffect(() => {
    if (!open) return
    if (template) {
      form.reset({
        name: template.name,
        description: template.description || "",
        content: template.content,
        is_default: template.is_default,
      })
    } else {
      form.reset({
        name: "",
        description: "",
        content: defaultKind === "server" ? SERVER_PRESET_DIRECT : CLIENT_STARTER_YAML,
        is_default: false,
      })
    }
  }, [open, template, defaultKind, form])

  const mutation = useMutation({
    mutationFn: (v: TemplateFormValues) =>
      isEdit && template ? api.updateTemplate(template.id, v) : api.createTemplate({ ...v, kind }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.templates })
      if (isServer) {
        qc.invalidateQueries({ queryKey: queryKeys.nodes })
      }
      toast.success(
        isEdit
          ? isServer
            ? t("templates.toastUpdatedSynced")
            : t("templates.toastUpdated")
          : t("templates.toastCreated")
      )
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const applyServerPreset = (label: string, yaml: string) => {
    form.setValue("content", yaml, { shouldDirty: true, shouldValidate: true })
    toast.success(t("templates.form.presetApplied", { name: label }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        expandable
        className="flex h-[min(760px,90vh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
      >
        <DialogHeader className="shrink-0 border-b border-border px-6 pt-5 pr-20 pb-4">
          <DialogTitle>
            {isServer
              ? isEdit
                ? t("templates.form.editServerTitle")
                : t("templates.form.createServerTitle")
              : isEdit
                ? t("templates.form.editTitle")
                : t("templates.form.createTitle")}
          </DialogTitle>
          <DialogDescription>
            {isServer ? (
              t("templates.form.serverDesc")
            ) : (
              <>
                {t("templates.form.descBefore")}{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  {"{{PROXIES}}"}
                </code>{" "}
                {t("templates.form.descMiddle")}{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  {"{{PROXY_NAMES}}"}
                </code>{" "}
                {t("templates.form.descAfter")}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            id="template-form"
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("templates.form.name")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={
                          isServer
                            ? t("templates.form.serverNamePlaceholder")
                            : t("templates.form.namePlaceholder")
                        }
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("templates.form.description")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("templates.form.descriptionPlaceholder")} {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {isServer && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Sparkles className="size-3.5" />
                    {t("templates.form.presetsLabel")}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2.5 text-xs"
                    onClick={() =>
                      applyServerPreset(t("templates.form.presetDirect"), SERVER_PRESET_DIRECT)
                    }
                  >
                    {t("templates.form.presetDirect")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2.5 text-xs"
                    onClick={() =>
                      applyServerPreset(t("templates.form.presetAudit"), SERVER_PRESET_AUDIT)
                    }
                  >
                    {t("templates.form.presetAudit")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2.5 text-xs"
                    onClick={() =>
                      applyServerPreset(t("templates.form.presetWarp"), SERVER_PRESET_WARP)
                    }
                  >
                    {t("templates.form.presetWarp")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2.5 text-xs"
                    onClick={() =>
                      applyServerPreset(
                        t("templates.form.presetChain"),
                        buildServerPresetChain(sampleChainNodeName)
                      )
                    }
                  >
                    {t("templates.form.presetChain")}
                  </Button>
                </div>

                <NodeProxyRefPicker
                  nodes={nodesQuery.data ?? []}
                  inbounds={inboundsQuery.data ?? []}
                  value={form.watch("content") || ""}
                  onChange={(nextYaml) =>
                    form.setValue("content", nextYaml, { shouldDirty: true, shouldValidate: true })
                  }
                />
              </div>
            )}

            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem className="flex flex-1 flex-col">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <FormLabel>{t("templates.form.content")}</FormLabel>
                    <TemplateRuleHelper
                      yamlValue={field.value || ""}
                      isServer={isServer}
                      onChange={(nextYaml) =>
                        form.setValue("content", nextYaml, {
                          shouldDirty: true,
                          shouldValidate: true,
                        })
                      }
                    />
                  </div>
                  <FormControl>
                    <YamlEditor
                      name={field.name}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      minHeightClass="min-h-[340px] flex-1"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_default"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border border-border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>{t("templates.form.setDefault")}</FormLabel>
                    <FormDescription>
                      {isServer
                        ? t("templates.form.setDefaultServerDesc")
                        : t("templates.form.setDefaultDesc")}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
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
          <Button type="submit" form="template-form" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {isServer && isEdit
              ? t("templates.form.saveAndSyncNodes")
              : t("templates.form.saveTemplate")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
