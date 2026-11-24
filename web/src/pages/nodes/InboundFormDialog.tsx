import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeft, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { TagInput } from "@/components/common/TagInput"
import { Button } from "@/components/ui/button"
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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
import { PROTOCOL_LABELS, type Inbound, type Protocol } from "@/lib/types"
import { InboundAdvancedTab } from "./InboundAdvancedTab"
import {
  InboundProtocolFields,
  NEEDS_CERT_ALWAYS,
  SUPPORTS_OPTIONAL_TLS,
  SUPPORTS_REALITY,
} from "./InboundProtocolFields"
import { createInboundSchema, type InboundFormValues } from "./inboundSchema"

const DEFAULT_VALUES: InboundFormValues = {
  name: "vless-443",
  tag: "VLESS",
  tags: [],
  proxy_name: "",
  client_server: "",
  client_port: 0,
  client_tls: false,
  protocol: "vless",
  port: 443,
  listen: "0.0.0.0",
  cert_id: "none",
  enabled: true,
  security: "reality",
  sni: "",
  alpn: "",
  skip_cert_verify: false,
  client_fingerprint: "",
  ech_key: "",
  ech_enable: false,
  ech_config: "",
  client_auth_type: "",
  client_auth_cert: "",
  port_range: "",
  routing_mark: 0,
  listener_rule: "",
  listener_proxy: "",
  network: "tcp",
  ws_path: "/ws",
  ws_host: "",
  grpc_service_name: "GunService",
  xhttp_path: "/xhttp",
  xhttp_mode: "auto",
  xhttp_host: "",
  xhttp_no_sse_header: false,
  xhttp_x_padding_bytes: "",
  flow: "xtls-rprx-vision",
  vless_decryption: "",
  vless_encryption: "",
  alter_id: 0,
  cipher: "auto",
  reality_dest: "www.microsoft.com:443",
  reality_server_names: "www.microsoft.com",
  reality_private_key: "",
  reality_public_key: "",
  reality_short_ids: "",
  up_mbps: 100,
  down_mbps: 500,
  ignore_client_bandwidth: false,
  obfs: "",
  obfs_password: "",
  masquerade: "",
  hop_ports: "",
  bbr_profile: "",
  congestion_controller: "bbr",
  cwnd: 0,
  max_idle_time: 0,
  udp_relay_mode: "native",
  padding_scheme: "",
  ss_cipher: "2022-blake3-aes-128-gcm",
  ss_server_password: "",
  mieru_transport: "TCP",
  mieru_port_range: "",
  mieru_multiplexing: "MULTIPLEXING_LOW",
  mieru_handshake_mode: "",
  mieru_traffic_pattern: "",
  mieru_tcp_idle_timeout: 0,
  mieru_user_hint_mandatory: false,
  trusttunnel_network: "both",
  trusttunnel_max_connections: 0,
  trusttunnel_min_streams: 0,
  trusttunnel_max_streams: 0,
  name_cert_verify: "",
  shadowquic_jls_addr: "www.microsoft.com:443",
  shadowquic_jls_sni: "www.microsoft.com",
  shadowquic_jls_proxy: "",
  shadowquic_zero_rtt: true,
  snell_psk: "",
  snell_version: 4,
  snell_mode: "default",
  snell_obfs_mode: "",
  snell_obfs_host: "",
  sudoku_key: "",
  sudoku_aead_method: "chacha20-poly1305",
  sudoku_table_type: "prefer_ascii",
  sudoku_custom_table: "",
  sudoku_multiplex: "",
  sudoku_disable_http_mask: false,
  sudoku_http_mask_mode: "legacy",
  sudoku_http_mask_tls: false,
  sudoku_http_mask_host: "",
  sudoku_path_root: "",
  sudoku_fallback: "",
  sudoku_enable_pure_downlink: true,
  extra_server_yaml: "",
  extra_client_yaml: "",
}

type InboundTab = "basic" | "security" | "transport" | "advanced"

function buildInboundPayload(v: InboundFormValues): Record<string, unknown> {
  const needsCert =
    NEEDS_CERT_ALWAYS.includes(v.protocol) ||
    ((SUPPORTS_REALITY.includes(v.protocol) || SUPPORTS_OPTIONAL_TLS.includes(v.protocol)) &&
      v.security === "tls")
  const certId = v.cert_id && v.cert_id !== "none" ? Number(v.cert_id) : null
  const splitCSV = (s?: string) =>
    (s || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)

  const resolvedSecurity = NEEDS_CERT_ALWAYS.includes(v.protocol)
    ? "tls"
    : SUPPORTS_REALITY.includes(v.protocol)
      ? v.security
      : SUPPORTS_OPTIONAL_TLS.includes(v.protocol)
        ? v.security === "tls"
          ? "tls"
          : "none"
        : "none"

  return {
    name: v.name,
    tag: v.tag || "",
    tags: v.tags ?? [],
    protocol: v.protocol,
    listen: v.listen || "0.0.0.0",
    port: v.port,
    cert_id: needsCert ? certId : null,
    enabled: v.enabled,
    settings: {
      proxy_name: v.proxy_name || "",
      client_server: v.client_server || "",
      client_port: v.client_port || 0,
      client_tls: Boolean(v.client_tls),
      security: resolvedSecurity,
      sni: v.sni || "",
      alpn: splitCSV(v.alpn),
      skip_cert_verify: v.skip_cert_verify,
      client_fingerprint: v.client_fingerprint || "",
      ech_key: v.ech_key || "",
      ech_enable: Boolean(v.ech_enable),
      ech_config: v.ech_config || "",
      client_auth_type: v.client_auth_type || "",
      client_auth_cert: v.client_auth_cert || "",
      port_range: v.port_range || "",
      routing_mark: v.routing_mark || 0,
      listener_rule: v.listener_rule || "",
      listener_proxy: v.listener_proxy || "",
      network: v.network,
      ws_path: v.ws_path,
      ws_host: v.ws_host || "",
      grpc_service_name: v.grpc_service_name,
      xhttp_path: v.xhttp_path,
      xhttp_mode: v.xhttp_mode,
      xhttp_host: v.xhttp_host,
      xhttp_no_sse_header: Boolean(v.xhttp_no_sse_header),
      xhttp_x_padding_bytes: v.xhttp_x_padding_bytes || "",
      flow: v.flow,
      vless_decryption: v.vless_decryption,
      vless_encryption: v.vless_encryption,
      alter_id: v.alter_id || 0,
      cipher: v.cipher || "auto",
      reality_dest: v.reality_dest,
      reality_server_names: splitCSV(v.reality_server_names),
      reality_private_key: v.reality_private_key,
      reality_public_key: v.reality_public_key,
      reality_short_ids: splitCSV(v.reality_short_ids),
      up_mbps: v.up_mbps,
      down_mbps: v.down_mbps,
      ignore_client_bandwidth: v.ignore_client_bandwidth,
      obfs: v.obfs,
      obfs_password: v.obfs_password,
      masquerade: v.masquerade,
      hop_ports: v.hop_ports,
      bbr_profile: v.bbr_profile,
      congestion_controller: v.congestion_controller,
      cwnd: v.cwnd || 0,
      max_idle_time: v.max_idle_time || 0,
      udp_relay_mode: v.udp_relay_mode,
      padding_scheme: v.padding_scheme,
      ss_cipher: v.ss_cipher,
      ss_server_password: v.ss_server_password,
      udp: true,
      mieru_transport: v.mieru_transport,
      mieru_port_range: v.mieru_port_range,
      mieru_multiplexing: v.mieru_multiplexing,
      mieru_handshake_mode: v.mieru_handshake_mode || "",
      mieru_traffic_pattern: v.mieru_traffic_pattern,
      mieru_tcp_idle_timeout: v.mieru_tcp_idle_timeout || 0,
      mieru_user_hint_mandatory: Boolean(v.mieru_user_hint_mandatory),
      trusttunnel_network: v.trusttunnel_network,
      trusttunnel_max_connections: v.trusttunnel_max_connections || 0,
      trusttunnel_min_streams: v.trusttunnel_min_streams || 0,
      trusttunnel_max_streams: v.trusttunnel_max_streams || 0,
      name_cert_verify: v.name_cert_verify || "",
      shadowquic_jls_addr: v.shadowquic_jls_addr,
      shadowquic_jls_sni: v.shadowquic_jls_sni,
      shadowquic_jls_proxy: v.shadowquic_jls_proxy || "",
      shadowquic_zero_rtt: v.shadowquic_zero_rtt,
      snell_psk: v.snell_psk,
      snell_version: v.snell_version,
      snell_mode: v.snell_mode,
      snell_obfs_mode: v.snell_obfs_mode,
      snell_obfs_host: v.snell_obfs_host,
      sudoku_key: v.sudoku_key,
      sudoku_aead_method: v.sudoku_aead_method,
      sudoku_table_type: v.sudoku_table_type,
      sudoku_custom_table: v.sudoku_custom_table || "",
      sudoku_multiplex: v.sudoku_multiplex || "",
      sudoku_disable_http_mask: v.sudoku_disable_http_mask,
      sudoku_http_mask_mode: v.sudoku_http_mask_mode,
      sudoku_http_mask_tls: Boolean(v.sudoku_http_mask_tls),
      sudoku_http_mask_host: v.sudoku_http_mask_host || "",
      sudoku_path_root: v.sudoku_path_root,
      sudoku_fallback: v.sudoku_fallback,
      sudoku_enable_pure_downlink: v.sudoku_enable_pure_downlink,
      extra_server_yaml: v.extra_server_yaml || "",
      extra_client_yaml: v.extra_client_yaml || "",
    },
  }
}

export function InboundFormView({
  nodeId,
  nodeName,
  nodeOutbounds = [],
  inbound,
  onBack,
}: {
  nodeId: number
  nodeName: string
  nodeOutbounds?: string[]
  inbound: Inbound | null
  onBack: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const isEdit = Boolean(inbound)
  const [keygenLoading, setKeygenLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<InboundTab>("basic")

  const inboundSchema = useMemo(() => createInboundSchema(t), [t])

  const certsQuery = useQuery({
    queryKey: queryKeys.certificates,
    queryFn: api.listCertificates,
  })

  const allInboundsQuery = useQuery({
    queryKey: queryKeys.allInbounds,
    queryFn: api.listAllInbounds,
  })

  const tagSuggestions = useMemo(() => {
    const set = new Set<string>()
    for (const inb of allInboundsQuery.data ?? []) {
      for (const tg of inb.tags ?? []) {
        if (tg.trim()) set.add(tg.trim())
      }
    }
    return Array.from(set)
  }, [allInboundsQuery.data])

  const form = useForm<InboundFormValues>({
    resolver: zodResolver(inboundSchema),
    defaultValues: DEFAULT_VALUES,
  })

  useEffect(() => {
    setActiveTab("basic")
    if (inbound) {
      const s = inbound.settings || {}
      form.reset({
        name: inbound.name,
        tag: inbound.tag || "",
        tags: inbound.tags ?? [],
        proxy_name: s.proxy_name || "",
        client_server: s.client_server || "",
        client_port: s.client_port || 0,
        client_tls: Boolean(s.client_tls),
        protocol: inbound.protocol,
        port: inbound.port,
        listen: inbound.listen || "0.0.0.0",
        cert_id: inbound.cert_id ? String(inbound.cert_id) : "none",
        enabled: inbound.enabled,
        security: s.security || (NEEDS_CERT_ALWAYS.includes(inbound.protocol) ? "tls" : "none"),
        sni: s.sni || "",
        alpn: (s.alpn || []).join(", "),
        skip_cert_verify: Boolean(s.skip_cert_verify),
        client_fingerprint: s.client_fingerprint || "",
        ech_key: s.ech_key || "",
        ech_enable: Boolean(s.ech_enable),
        ech_config: s.ech_config || "",
        client_auth_type: s.client_auth_type || "",
        client_auth_cert: s.client_auth_cert || "",
        port_range: s.port_range || "",
        routing_mark: s.routing_mark ?? 0,
        listener_rule: s.listener_rule || "",
        listener_proxy: s.listener_proxy || "",
        network: s.network || "tcp",
        ws_path: s.ws_path || "/ws",
        ws_host: s.ws_host || "",
        grpc_service_name: s.grpc_service_name || "GunService",
        xhttp_path: s.xhttp_path || "/xhttp",
        xhttp_mode: s.xhttp_mode || "auto",
        xhttp_host: s.xhttp_host || "",
        xhttp_no_sse_header: Boolean(s.xhttp_no_sse_header),
        xhttp_x_padding_bytes: s.xhttp_x_padding_bytes || "",
        flow: s.flow || "",
        vless_decryption: s.vless_decryption || "",
        vless_encryption: s.vless_encryption || "",
        alter_id: s.alter_id ?? 0,
        cipher: s.cipher || "auto",
        reality_dest: s.reality_dest || "www.microsoft.com:443",
        reality_server_names: (s.reality_server_names || []).join(","),
        reality_private_key: s.reality_private_key || "",
        reality_public_key: s.reality_public_key || "",
        reality_short_ids: (s.reality_short_ids || []).join(","),
        up_mbps: s.up_mbps ?? 100,
        down_mbps: s.down_mbps ?? 500,
        ignore_client_bandwidth: Boolean(s.ignore_client_bandwidth),
        obfs: s.obfs || "",
        obfs_password: s.obfs_password || "",
        masquerade: s.masquerade || "",
        hop_ports: s.hop_ports || "",
        bbr_profile: s.bbr_profile || "",
        congestion_controller: s.congestion_controller || "bbr",
        cwnd: s.cwnd ?? 0,
        max_idle_time: s.max_idle_time ?? 0,
        udp_relay_mode: s.udp_relay_mode || "native",
        padding_scheme: s.padding_scheme || "",
        ss_cipher: s.ss_cipher || "2022-blake3-aes-128-gcm",
        ss_server_password: s.ss_server_password || "",
        mieru_transport: s.mieru_transport || "TCP",
        mieru_port_range: s.mieru_port_range || "",
        mieru_multiplexing: s.mieru_multiplexing || "MULTIPLEXING_LOW",
        mieru_handshake_mode: s.mieru_handshake_mode || "",
        mieru_traffic_pattern: s.mieru_traffic_pattern || "",
        mieru_tcp_idle_timeout: s.mieru_tcp_idle_timeout ?? 0,
        mieru_user_hint_mandatory: Boolean(s.mieru_user_hint_mandatory),
        trusttunnel_network:
          s.trusttunnel_network === "quic" ? "udp" : s.trusttunnel_network || "both",
        trusttunnel_max_connections: s.trusttunnel_max_connections ?? 0,
        trusttunnel_min_streams: s.trusttunnel_min_streams ?? 0,
        trusttunnel_max_streams: s.trusttunnel_max_streams ?? 0,
        name_cert_verify: s.name_cert_verify || "",
        shadowquic_jls_addr: s.shadowquic_jls_addr || "www.microsoft.com:443",
        shadowquic_jls_sni: s.shadowquic_jls_sni || "www.microsoft.com",
        shadowquic_jls_proxy: s.shadowquic_jls_proxy || "",
        shadowquic_zero_rtt: s.shadowquic_zero_rtt ?? true,
        snell_psk: s.snell_psk || "",
        snell_version: s.snell_version ?? 4,
        snell_mode: s.snell_mode || "default",
        snell_obfs_mode: s.snell_obfs_mode || "",
        snell_obfs_host: s.snell_obfs_host || "",
        sudoku_key: s.sudoku_key || "",
        sudoku_aead_method: s.sudoku_aead_method || "chacha20-poly1305",
        sudoku_table_type: s.sudoku_table_type || "prefer_ascii",
        sudoku_custom_table: s.sudoku_custom_table || "",
        sudoku_multiplex: s.sudoku_multiplex || "",
        sudoku_disable_http_mask: Boolean(s.sudoku_disable_http_mask),
        sudoku_http_mask_mode: s.sudoku_http_mask_mode || "legacy",
        sudoku_http_mask_tls: Boolean(s.sudoku_http_mask_tls),
        sudoku_http_mask_host: s.sudoku_http_mask_host || "",
        sudoku_path_root: s.sudoku_path_root || "",
        sudoku_fallback: s.sudoku_fallback || "",
        sudoku_enable_pure_downlink: s.sudoku_enable_pure_downlink ?? true,
        extra_server_yaml: s.extra_server_yaml || "",
        extra_client_yaml: s.extra_client_yaml || "",
      })
    } else {
      form.reset(DEFAULT_VALUES)
    }
  }, [inbound, form])

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

  const generateSecret = async (field: "snell_psk" | "sudoku_key") => {
    setKeygenLoading(true)
    try {
      const res = await api.keygen(field)
      form.setValue(field, res.password)
      toast.success(t("nodes.inbound.toastSecretGenerated"))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("nodes.inbound.toastKeygenFailed"))
    } finally {
      setKeygenLoading(false)
    }
  }

  const mutation = useMutation({
    mutationFn: (v: InboundFormValues) => {
      const payload = buildInboundPayload(v)
      return isEdit && inbound
        ? api.updateInbound(inbound.id, payload)
        : api.createInbound(nodeId, payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.inbounds(nodeId) })
      qc.invalidateQueries({ queryKey: queryKeys.allInbounds })
      qc.invalidateQueries({ queryKey: queryKeys.nodes })
      qc.invalidateQueries({ queryKey: queryKeys.users })
      toast.success(isEdit ? t("nodes.inbound.toastUpdated") : t("nodes.inbound.toastCreated"))
      onBack()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleInvalid = (errors: Record<string, unknown>) => {
    if (errors.name || errors.port || errors.protocol || errors.tag) {
      setActiveTab("basic")
    } else if (errors.routing_mark || errors.extra_server_yaml || errors.extra_client_yaml) {
      setActiveTab("advanced")
    }
  }

  return (
    <>
      <DialogHeader className="shrink-0 border-b border-border px-6 pt-4 pr-20 pb-3.5">
        <div className="mb-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2 h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={onBack}
          >
            <ArrowLeft className="mr-1 size-3.5" />
            {t("nodes.inbound.backToList")}
          </Button>
        </div>
        <DialogTitle>
          {isEdit ? t("nodes.inbound.dialogEditTitle") : t("nodes.inbound.dialogAddTitle")}
        </DialogTitle>
        <DialogDescription>{t("nodes.inbound.dialogDesc")}</DialogDescription>
      </DialogHeader>

      <Form {...form}>
        <form
          id="inbound-form"
          onSubmit={form.handleSubmit((v) => mutation.mutate(v), handleInvalid)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as InboundTab)}
            className="flex min-h-0 flex-1 flex-col gap-0"
          >
            <div className="shrink-0 border-b border-border px-6 py-2.5">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="basic">{t("nodes.inbound.tabBasic")}</TabsTrigger>
                <TabsTrigger value="security">{t("nodes.inbound.tabSecurity")}</TabsTrigger>
                <TabsTrigger value="transport">{t("nodes.inbound.tabTransport")}</TabsTrigger>
                <TabsTrigger value="advanced">{t("nodes.inbound.tabAdvanced")}</TabsTrigger>
              </TabsList>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              <div className="group-data-[expanded=true]/dialog:mx-auto group-data-[expanded=true]/dialog:w-full group-data-[expanded=true]/dialog:max-w-4xl">
                <TabsContent value="basic" keepMounted className="mt-0 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="protocol"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("nodes.inbound.protocol")}</FormLabel>
                          <Select
                            value={field.value}
                            onValueChange={(val) => {
                              if (!val) return
                              const proto = val as Protocol
                              field.onChange(proto)
                              if (!isEdit) {
                                form.setValue("tag", PROTOCOL_LABELS[proto])
                                form.setValue("name", `${proto}-${form.getValues("port")}`)
                              }
                              if (
                                NEEDS_CERT_ALWAYS.includes(proto) ||
                                SUPPORTS_OPTIONAL_TLS.includes(proto)
                              ) {
                                form.setValue("security", "tls")
                              } else if (SUPPORTS_REALITY.includes(proto)) {
                                form.setValue("security", "reality")
                              } else {
                                form.setValue("security", "none")
                              }
                            }}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full">
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
                            <Input
                              type="number"
                              min={1}
                              max={65535}
                              className="tabular-nums"
                              {...field}
                            />
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
                    name="proxy_name"
                    render={({ field }) => {
                      const tagVal = form.watch("tag")?.trim()
                      const protoVal = form.watch("protocol")
                      const defaultPreview = tagVal
                        ? `${nodeName} · ${tagVal}`
                        : `${nodeName} · ${protoVal.toUpperCase()}`
                      return (
                        <FormItem>
                          <FormLabel>{t("nodes.inbound.proxyName")}</FormLabel>
                          <FormControl>
                            <Input placeholder={defaultPreview} {...field} />
                          </FormControl>
                          <FormDescription>
                            {t("nodes.inbound.proxyNameDesc", { preview: defaultPreview })}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )
                    }}
                  />

                  <FormField
                    control={form.control}
                    name="tags"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("nodes.inbound.tags")}</FormLabel>
                        <FormControl>
                          <TagInput
                            value={field.value ?? []}
                            onChange={field.onChange}
                            suggestions={tagSuggestions}
                            placeholder={t("nodes.inbound.tagsPlaceholder")}
                          />
                        </FormControl>
                        <FormDescription>{t("nodes.inbound.tagsDesc")}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

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

                <TabsContent value="security" keepMounted className="mt-0">
                  <InboundProtocolFields
                    form={form}
                    certs={certsQuery.data ?? []}
                    section="security"
                    keygenLoading={keygenLoading}
                    onGenerateReality={generateReality}
                    onGenerateSSKey={generateSSKey}
                    onGenerateSecret={generateSecret}
                  />
                </TabsContent>

                <TabsContent value="transport" keepMounted className="mt-0">
                  <InboundProtocolFields
                    form={form}
                    certs={certsQuery.data ?? []}
                    section="transport"
                    keygenLoading={keygenLoading}
                    onGenerateReality={generateReality}
                    onGenerateSSKey={generateSSKey}
                    onGenerateSecret={generateSecret}
                  />
                </TabsContent>

                <TabsContent value="advanced" keepMounted className="mt-0">
                  <InboundAdvancedTab
                    key={inbound?.id ?? "new"}
                    nodeId={nodeId}
                    nodeOutbounds={nodeOutbounds}
                    form={form}
                    buildPayload={buildInboundPayload}
                  />
                </TabsContent>
              </div>
            </div>
          </Tabs>
        </form>
      </Form>

      <DialogFooter>
        <Button variant="outline" onClick={onBack} disabled={mutation.isPending}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" form="inbound-form" disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
          {isEdit ? t("nodes.inbound.saveAndPush") : t("nodes.inbound.createAndPush")}
        </Button>
      </DialogFooter>
    </>
  )
}
