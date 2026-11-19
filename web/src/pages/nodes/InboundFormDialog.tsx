import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { zodResolver } from "@hookform/resolvers/zod"
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
import { PROTOCOL_LABELS, type Inbound, type Protocol } from "@/lib/types"
import {
  InboundProtocolFields,
  NEEDS_CERT_ALWAYS,
  SUPPORTS_REALITY,
} from "./InboundProtocolFields"
import { createInboundSchema, type InboundFormValues } from "./inboundSchema"

const DEFAULT_VALUES: InboundFormValues = {
  name: "vless-443",
  tag: "VLESS",
  protocol: "vless",
  port: 443,
  listen: "0.0.0.0",
  cert_id: "none",
  enabled: true,
  security: "reality",
  sni: "",
  skip_cert_verify: false,
  network: "tcp",
  ws_path: "/ws",
  grpc_service_name: "GunService",
  xhttp_path: "/xhttp",
  flow: "xtls-rprx-vision",
  reality_dest: "www.microsoft.com:443",
  reality_server_names: "www.microsoft.com",
  reality_private_key: "",
  reality_public_key: "",
  reality_short_ids: "",
  up_mbps: 100,
  down_mbps: 500,
  obfs: "",
  obfs_password: "",
  hop_ports: "",
  congestion_controller: "bbr",
  ss_cipher: "2022-blake3-aes-128-gcm",
  ss_server_password: "",
}

export function InboundFormDialog({
  nodeId,
  inbound,
  open,
  onOpenChange,
}: {
  nodeId: number
  inbound: Inbound | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const isEdit = Boolean(inbound)
  const [keygenLoading, setKeygenLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<"basic" | "security" | "transport">("basic")

  const inboundSchema = useMemo(() => createInboundSchema(t), [t])

  const certsQuery = useQuery({
    queryKey: queryKeys.certificates,
    queryFn: api.listCertificates,
    enabled: open,
  })

  const form = useForm<InboundFormValues>({
    resolver: zodResolver(inboundSchema),
    defaultValues: DEFAULT_VALUES,
  })

  useEffect(() => {
    if (!open) return
    setActiveTab("basic")
    if (inbound) {
      const s = inbound.settings || {}
      form.reset({
        name: inbound.name,
        tag: inbound.tag || "",
        protocol: inbound.protocol,
        port: inbound.port,
        listen: inbound.listen || "0.0.0.0",
        cert_id: inbound.cert_id ? String(inbound.cert_id) : "none",
        enabled: inbound.enabled,
        security: s.security || (NEEDS_CERT_ALWAYS.includes(inbound.protocol) ? "tls" : "none"),
        sni: s.sni || "",
        skip_cert_verify: Boolean(s.skip_cert_verify),
        network: s.network || "tcp",
        ws_path: s.ws_path || "/ws",
        grpc_service_name: s.grpc_service_name || "GunService",
        xhttp_path: s.xhttp_path || "/xhttp",
        flow: s.flow || "",
        reality_dest: s.reality_dest || "www.microsoft.com:443",
        reality_server_names: (s.reality_server_names || []).join(","),
        reality_private_key: s.reality_private_key || "",
        reality_public_key: s.reality_public_key || "",
        reality_short_ids: (s.reality_short_ids || []).join(","),
        up_mbps: s.up_mbps ?? 100,
        down_mbps: s.down_mbps ?? 500,
        obfs: s.obfs || "",
        obfs_password: s.obfs_password || "",
        hop_ports: s.hop_ports || "",
        congestion_controller: s.congestion_controller || "bbr",
        ss_cipher: s.ss_cipher || "2022-blake3-aes-128-gcm",
        ss_server_password: s.ss_server_password || "",
      })
    } else {
      form.reset(DEFAULT_VALUES)
    }
  }, [open, inbound, form])

  const generateReality = async () => {
    setKeygenLoading(true)
    try {
      const res = await api.keygen("reality")
      form.setValue("reality_private_key", res.private_key)
      form.setValue("reality_public_key", res.public_key)
      if (!form.getValues("reality_short_ids")) {
        form.setValue("reality_short_ids", res.short_id)
      }
      toast.success(t("nodes.inbound.toastRealityGenerated"))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("nodes.inbound.toastKeygenFailed"))
    } finally {
      setKeygenLoading(false)
    }
  }

  const generateSSKey = async () => {
    setKeygenLoading(true)
    try {
      const is256 = (form.getValues("ss_cipher") || "").includes("256")
      const res = await api.keygen(is256 ? "ss2022_256" : "ss2022_128")
      form.setValue("ss_server_password", res.password)
      toast.success(t("nodes.inbound.toastSSGenerated"))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("nodes.inbound.toastKeygenFailed"))
    } finally {
      setKeygenLoading(false)
    }
  }

  const mutation = useMutation({
    mutationFn: (v: InboundFormValues) => {
      const needsCert =
        NEEDS_CERT_ALWAYS.includes(v.protocol) ||
        (SUPPORTS_REALITY.includes(v.protocol) && v.security === "tls")
      const certId = v.cert_id && v.cert_id !== "none" ? Number(v.cert_id) : null
      const splitCSV = (s?: string) =>
        (s || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)

      const payload = {
        name: v.name,
        tag: v.tag || "",
        protocol: v.protocol,
        listen: v.listen || "0.0.0.0",
        port: v.port,
        cert_id: needsCert ? certId : null,
        enabled: v.enabled,
        settings: {
          security: NEEDS_CERT_ALWAYS.includes(v.protocol)
            ? "tls"
            : v.protocol === "shadowsocks"
              ? "none"
              : v.security,
          sni: v.sni || "",
          skip_cert_verify: v.skip_cert_verify,
          network: v.network,
          ws_path: v.ws_path,
          grpc_service_name: v.grpc_service_name,
          xhttp_path: v.xhttp_path,
          flow: v.flow,
          reality_dest: v.reality_dest,
          reality_server_names: splitCSV(v.reality_server_names),
          reality_private_key: v.reality_private_key,
          reality_public_key: v.reality_public_key,
          reality_short_ids: splitCSV(v.reality_short_ids),
          up_mbps: v.up_mbps,
          down_mbps: v.down_mbps,
          obfs: v.obfs,
          obfs_password: v.obfs_password,
          hop_ports: v.hop_ports,
          congestion_controller: v.congestion_controller,
          ss_cipher: v.ss_cipher,
          ss_server_password: v.ss_server_password,
          udp: true,
        },
      }
      return isEdit && inbound
        ? api.updateInbound(inbound.id, payload)
        : api.createInbound(nodeId, payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.inbounds(nodeId) })
      qc.invalidateQueries({ queryKey: queryKeys.nodes })
      toast.success(isEdit ? t("nodes.inbound.toastUpdated") : t("nodes.inbound.toastCreated"))
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleInvalid = (errors: Record<string, unknown>) => {
    if (errors.name || errors.port || errors.protocol || errors.tag) {
      setActiveTab("basic")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("nodes.inbound.dialogEditTitle") : t("nodes.inbound.dialogAddTitle")}
          </DialogTitle>
          <DialogDescription>{t("nodes.inbound.dialogDesc")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            id="inbound-form"
            onSubmit={form.handleSubmit((v) => mutation.mutate(v), handleInvalid)}
            className="flex flex-col gap-3"
          >
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as "basic" | "security" | "transport")}
            >
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="basic">{t("nodes.inbound.tabBasic")}</TabsTrigger>
                <TabsTrigger value="security">{t("nodes.inbound.tabSecurity")}</TabsTrigger>
                <TabsTrigger value="transport">{t("nodes.inbound.tabTransport")}</TabsTrigger>
              </TabsList>

              <div className="mt-3 h-[380px] max-h-[58vh] overflow-y-auto px-1 py-1">
                <TabsContent
                  value="basic"
                  forceMount
                  className="mt-0 space-y-4 data-[state=inactive]:hidden"
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="protocol"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("nodes.inbound.protocol")}</FormLabel>
                          <Select
                            value={field.value}
                            onValueChange={(val: Protocol) => {
                              field.onChange(val)
                              if (!isEdit) {
                                form.setValue("tag", PROTOCOL_LABELS[val])
                                form.setValue("name", `${val}-${form.getValues("port")}`)
                              }
                              if (NEEDS_CERT_ALWAYS.includes(val)) form.setValue("security", "tls")
                              if (val === "shadowsocks") form.setValue("security", "none")
                            }}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {(Object.keys(PROTOCOL_LABELS) as Protocol[]).map((p) => (
                                <SelectItem key={p} value={p}>
                                  {PROTOCOL_LABELS[p]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="port"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("nodes.inbound.port")}</FormLabel>
                          <FormControl>
                            <Input type="number" min={1} max={65535} className="tabular-nums" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("nodes.inbound.name")}</FormLabel>
                          <FormControl>
                            <Input placeholder="vless-443" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="tag"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("nodes.inbound.tag")}</FormLabel>
                          <FormControl>
                            <Input placeholder={t("nodes.inbound.tagPlaceholder")} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="enabled"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-md border border-border p-3">
                        <FormLabel>{t("nodes.inbound.enabled")}</FormLabel>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </TabsContent>

                <TabsContent
                  value="security"
                  forceMount
                  className="mt-0 data-[state=inactive]:hidden"
                >
                  <InboundProtocolFields
                    form={form}
                    certs={certsQuery.data ?? []}
                    section="security"
                    keygenLoading={keygenLoading}
                    onGenerateReality={generateReality}
                    onGenerateSSKey={generateSSKey}
                  />
                </TabsContent>

                <TabsContent
                  value="transport"
                  forceMount
                  className="mt-0 data-[state=inactive]:hidden"
                >
                  <InboundProtocolFields
                    form={form}
                    certs={certsQuery.data ?? []}
                    section="transport"
                    keygenLoading={keygenLoading}
                    onGenerateReality={generateReality}
                    onGenerateSSKey={generateSSKey}
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
          <Button type="submit" form="inbound-form" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {isEdit ? t("nodes.inbound.saveAndPush") : t("nodes.inbound.createAndPush")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
