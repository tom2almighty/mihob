import { useMemo, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import {
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Eye,
  KeyRound,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { CopyButton } from "@/components/common/CommonUI"
import { YamlCodeBlock } from "@/components/common/YamlEditor"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api } from "@/lib/api"
import type {
  Inbound,
  MASQUENetwork,
  Node,
  NodeOutbound,
  NodeOutboundConfig,
  OutboundIPVersion,
  OutboundRouteMode,
  OutboundType,
} from "@/lib/types"
import { parseMASQUEConfig, parseWireGuardConf } from "./outboundParsers"

const RULE_PRESET_KEYS = [
  "ai",
  "netflix",
  "disney",
  "youtube",
  "tiktok",
  "spotify",
  "google",
] as const

const OUTBOUND_TYPES: OutboundType[] = [
  "warp",
  "masque",
  "wireguard",
  "socks5",
  "http",
  "mihob-node",
]

const DEFAULT_OUTBOUND_NAMES: Record<OutboundType, string> = {
  warp: "WARP",
  masque: "WARP-MASQUE",
  wireguard: "WG-OUT",
  socks5: "SOCKS5-OUT",
  http: "HTTP-OUT",
  "mihob-node": "UNLOCK-NODE",
}

const WARP_WG_ENDPOINTS = [
  { key: "auto", server: "engage.cloudflareclient.com", port: 2408 },
  { key: "v4", server: "162.159.192.1", port: 2408 },
  { key: "v6", server: "2606:4700:d0::a29f:c001", port: 2408 },
] as const

const WARP_MASQUE_ENDPOINTS = [
  { key: "v4", server: "162.159.198.1", port: 443 },
  { key: "v6", server: "2606:4700:103::1", port: 443 },
  { key: "v4Alt", server: "162.159.198.2", port: 443 },
  { key: "v6Alt", server: "2606:4700:104::1", port: 443 },
] as const

function nextUniqueName(existing: NodeOutbound[], base: string): string {
  const taken = new Set(existing.map((o) => o.name.trim().toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  let idx = 2
  while (taken.has(`${base}-${idx}`.toLowerCase())) {
    idx += 1
  }
  return `${base}-${idx}`
}

function createDefaultOutbound(type: OutboundType, existing: NodeOutbound[]): NodeOutbound {
  const name = nextUniqueName(existing, DEFAULT_OUTBOUND_NAMES[type])
  switch (type) {
    case "warp":
      return {
        name,
        type: "warp",
        enabled: true,
        server: "engage.cloudflareclient.com",
        port: 2408,
        ip: "172.16.0.2/32",
        ipv6: "",
        private_key: "",
        public_key: "bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=",
        reserved: "",
        mtu: 1280,
        udp: true,
        remote_dns_resolve: true,
        dns: ["1.1.1.1", "1.0.0.1"],
      }
    case "masque":
      return {
        name,
        type: "masque",
        enabled: true,
        server: "162.159.198.1",
        port: 443,
        ip: "172.16.0.2/32",
        ipv6: "",
        private_key: "",
        public_key: "",
        sni: "consumer-masque.cloudflareclient.com",
        network: "quic",
        mtu: 1280,
        udp: true,
        remote_dns_resolve: true,
        dns: ["1.1.1.1", "1.0.0.1"],
      }
    case "wireguard":
      return {
        name,
        type: "wireguard",
        enabled: true,
        server: "",
        port: 51820,
        ip: "",
        ipv6: "",
        private_key: "",
        public_key: "",
        mtu: 1420,
        udp: true,
        remote_dns_resolve: false,
      }
    case "socks5":
      return {
        name,
        type: "socks5",
        enabled: true,
        server: "127.0.0.1",
        port: 40000,
        udp: true,
      }
    case "http":
      return {
        name,
        type: "http",
        enabled: true,
        server: "127.0.0.1",
        port: 8080,
      }
    case "mihob-node":
      return {
        name,
        type: "mihob-node",
        enabled: true,
        node_ref: "",
        inbound_ref: "",
      }
  }
}

export function NodeOutboundEditor({
  value,
  onChange,
  nodes,
  inbounds,
  excludeNodeId,
  previewYAML,
  previewPending,
  onPreview,
}: {
  value: NodeOutboundConfig
  onChange: (next: NodeOutboundConfig) => void
  nodes: Node[]
  inbounds: Inbound[]
  excludeNodeId?: number
  previewYAML?: string
  previewPending?: boolean
  onPreview?: () => void
}) {
  const { t } = useTranslation()
  const outbounds = value.outbounds ?? []
  const routing = value.routing ?? {
    mode: "none",
    target: "",
    rule_presets: [],
    custom_domains: [],
  }

  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const [importIdx, setImportIdx] = useState<number | null>(null)
  const [importText, setImportText] = useState("")
  const [warpLicenseIdx, setWarpLicenseIdx] = useState<number | null>(null)
  const [warpLicense, setWarpLicense] = useState("")
  const [generatedPubKeys, setGeneratedPubKeys] = useState<Record<number, string>>({})
  const [cachedAddrs, setCachedAddrs] = useState<Record<number, { ip?: string; ipv6?: string }>>({})

  const availableNodes = useMemo(
    () => nodes.filter((n) => n.enabled && n.id !== excludeNodeId),
    [nodes, excludeNodeId]
  )

  const enabledOutboundNames = useMemo(
    () => outbounds.filter((o) => o.enabled && o.name.trim()).map((o) => o.name.trim()),
    [outbounds]
  )

  const updateOutbounds = (nextOutbounds: NodeOutbound[]) => {
    onChange({
      ...value,
      outbounds: nextOutbounds,
    })
  }

  const updateOutboundAt = (idx: number, patch: Partial<NodeOutbound>) => {
    const next = outbounds.map((item, i) => (i === idx ? { ...item, ...patch } : item))
    updateOutbounds(next)
  }

  const rememberAddr = (idx: number, ip?: string, ipv6?: string) => {
    setCachedAddrs((prev) => ({
      ...prev,
      [idx]: {
        ip: ip?.trim() ? ip.trim() : prev[idx]?.ip,
        ipv6: ipv6?.trim() ? ipv6.trim() : prev[idx]?.ipv6,
      },
    }))
  }

  const addOutbound = (type: OutboundType) => {
    const created = createDefaultOutbound(type, outbounds)
    const next = [...outbounds, created]
    const nextRouting = { ...routing }
    if ((nextRouting.mode === "split" || nextRouting.mode === "global") && !nextRouting.target) {
      nextRouting.target = created.name
    }
    onChange({
      ...value,
      outbounds: next,
      routing: nextRouting,
    })
    setExpandedIdx(next.length - 1)
    setImportIdx(null)
    setImportText("")
  }

  const removeOutbound = (idx: number) => {
    const removed = outbounds[idx]
    const next = outbounds.filter((_, i) => i !== idx)
    const nextRouting = { ...routing }
    if (removed && nextRouting.target === removed.name) {
      const fallback = next.find((o) => o.enabled && o.name.trim())?.name ?? ""
      nextRouting.target = fallback
      if (!fallback && nextRouting.mode !== "none") {
        nextRouting.mode = "none"
      }
    }
    onChange({
      ...value,
      outbounds: next,
      routing: nextRouting,
    })
    if (expandedIdx === idx) {
      setExpandedIdx(null)
    } else if (expandedIdx !== null && expandedIdx > idx) {
      setExpandedIdx(expandedIdx - 1)
    }
  }

  const updateRouting = (patch: Partial<typeof routing>) => {
    onChange({
      ...value,
      routing: {
        ...routing,
        ...patch,
      },
    })
  }

  const togglePreset = (preset: string) => {
    const cur = routing.rule_presets ?? []
    const next = cur.includes(preset) ? cur.filter((p) => p !== preset) : [...cur, preset]
    updateRouting({ rule_presets: next })
  }

  const keygenMutation = useMutation({
    mutationFn: ({ idx, type }: { idx: number; type: "wireguard" | "masque" }) =>
      api.keygen(type).then((res) => ({ idx, type, res })),
    onSuccess: ({ idx, res }) => {
      updateOutboundAt(idx, { private_key: res.private_key })
      if (res.public_key) {
        setGeneratedPubKeys((prev) => ({ ...prev, [idx]: res.public_key }))
      }
      toast.success(t("nodes.form.outbound.keypairGenerated"))
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const warpRegisterMutation = useMutation({
    mutationFn: ({
      idx,
      protocol,
      license,
    }: {
      idx: number
      protocol: "wireguard" | "masque"
      license?: string
    }) => api.registerWARP({ protocol, license }).then((res) => ({ idx, res })),
    onSuccess: ({ idx, res }) => {
      rememberAddr(idx, res.ip, res.ipv6)
      const current = outbounds[idx]
      const patch: Partial<NodeOutbound> = {
        private_key: res.private_key,
        public_key: res.public_key,
        ip: res.ip,
        ipv6: res.ipv6,
        server: res.server || current?.server,
        port: res.port || current?.port,
        mtu: res.mtu || current?.mtu,
      }
      if (res.protocol === "wireguard" && res.reserved) {
        patch.reserved = res.reserved
      }
      if (res.protocol === "masque" && res.sni) {
        patch.sni = res.sni
      }
      updateOutboundAt(idx, patch)
      setWarpLicenseIdx(null)
      setWarpLicense("")
      toast.success(t("nodes.form.outbound.warpRegisterSuccess"))
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleApplyImport = (idx: number, type: OutboundType) => {
    const patch = type === "masque" ? parseMASQUEConfig(importText) : parseWireGuardConf(importText)
    if (!patch.private_key && !patch.ip && !patch.ipv6 && !patch.server && !patch.public_key) {
      toast.error(
        type === "masque"
          ? t("nodes.form.outbound.masqueParseEmpty")
          : t("nodes.form.outbound.wgParseEmpty")
      )
      return
    }
    rememberAddr(idx, patch.ip, patch.ipv6)
    updateOutboundAt(idx, patch)
    setImportIdx(null)
    setImportText("")
    toast.success(
      type === "masque"
        ? t("nodes.form.outbound.masqueParseSuccess")
        : t("nodes.form.outbound.wgParseSuccess")
    )
  }

  const handleTunnelStackMode = (idx: number, item: NodeOutbound, mode: "dual" | "v4" | "v6") => {
    const cached = cachedAddrs[idx] ?? {}
    const v4 = item.ip?.trim() || cached.ip || "172.16.0.2/32"
    const v6 = item.ipv6?.trim() || cached.ipv6 || ""
    rememberAddr(idx, item.ip, item.ipv6)
    if (mode === "v4") {
      updateOutboundAt(idx, { ip: v4, ipv6: "" })
    } else if (mode === "v6") {
      updateOutboundAt(idx, { ip: "", ipv6: v6 })
    } else {
      updateOutboundAt(idx, { ip: v4, ipv6: v6 })
    }
  }

  const typeLabel = (type: OutboundType) => t(`nodes.form.outbound.types.${type}`)

  const summaryOf = (o: NodeOutbound): string => {
    if (o.type === "mihob-node") {
      return o.node_ref
        ? o.inbound_ref
          ? `${o.node_ref} / ${o.inbound_ref}`
          : o.node_ref
        : t("nodes.form.outbound.unconfigured")
    }
    const host =
      o.server ||
      (o.type === "warp"
        ? "engage.cloudflareclient.com"
        : o.type === "masque"
          ? "162.159.198.1"
          : "")
    const port = o.port || (o.type === "warp" ? 2408 : o.type === "masque" ? 443 : 0)
    if (!host) return t("nodes.form.outbound.unconfigured")
    return port ? `${host}:${port}` : host
  }

  const routeMode: OutboundRouteMode = routing.mode || "none"
  const customDomainsText = (routing.custom_domains ?? []).join("\n")

  return (
    <div className="space-y-5">
      {/* Outbound definitions list */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-0.5">
            <div className="text-sm font-medium">{t("nodes.form.outbound.listTitle")}</div>
            <p className="text-xs text-muted-foreground">{t("nodes.form.outbound.listDesc")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {OUTBOUND_TYPES.map((type) => (
              <Button
                key={type}
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => addOutbound(type)}
              >
                <Plus className="mr-1 size-3" />
                {typeLabel(type)}
              </Button>
            ))}
          </div>
        </div>

        {outbounds.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-xs text-muted-foreground">
            {t("nodes.form.outbound.emptyHint")}
          </div>
        ) : (
          <div className="space-y-2.5">
            {outbounds.map((item, idx) => {
              const isExpanded = expandedIdx === idx
              const targetNodeObj =
                item.type === "mihob-node"
                  ? availableNodes.find(
                      (n) => n.name === item.node_ref || String(n.id) === item.node_ref
                    )
                  : undefined
              const targetInbounds = targetNodeObj
                ? inbounds.filter((inb) => inb.node_id === targetNodeObj.id && inb.enabled)
                : []
              const otherOutbounds = outbounds
                .filter((_, i) => i !== idx)
                .map((o) => o.name.trim())
                .filter(Boolean)

              const isTunnelType =
                item.type === "warp" || item.type === "wireguard" || item.type === "masque"
              const isL4Proxy = item.type === "masque" && item.network === "h3-l4proxy"
              const generatedPub = generatedPubKeys[idx]
              const isRegistering =
                warpRegisterMutation.isPending && warpRegisterMutation.variables?.idx === idx
              const isKeygenPending =
                keygenMutation.isPending && keygenMutation.variables?.idx === idx

              return (
                <div
                  key={`${idx}-${item.type}`}
                  className="rounded-md border border-border bg-card"
                >
                  <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Switch
                        checked={item.enabled}
                        onCheckedChange={(checked) => updateOutboundAt(idx, { enabled: checked })}
                        aria-label={t("nodes.form.outbound.toggleAria")}
                      />
                      <button
                        type="button"
                        onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                        className="flex min-w-0 items-center gap-2 text-left"
                      >
                        <span className="truncate font-mono text-xs font-semibold text-foreground">
                          {item.name || t("nodes.form.outbound.unnamed")}
                        </span>
                        <Badge variant="secondary" className="shrink-0 text-[11px]">
                          {typeLabel(item.type)}
                        </Badge>
                        {item.ip_version && item.ip_version !== "dual" && (
                          <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                            {item.ip_version}
                          </Badge>
                        )}
                        <span className="hidden truncate font-mono text-xs text-muted-foreground sm:inline">
                          {summaryOf(item)}
                        </span>
                      </button>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              aria-label={
                                isExpanded
                                  ? t("nodes.form.outbound.collapseAria")
                                  : t("nodes.form.outbound.expandAria")
                              }
                              onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                            >
                              {isExpanded ? (
                                <ChevronUp className="size-3.5" />
                              ) : (
                                <ChevronDown className="size-3.5" />
                              )}
                            </Button>
                          }
                        />
                        <TooltipContent>
                          {isExpanded
                            ? t("nodes.form.outbound.collapseAria")
                            : t("nodes.form.outbound.expandAria")}
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              aria-label={t("nodes.form.outbound.removeAria")}
                              onClick={() => removeOutbound(idx)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          }
                        />
                        <TooltipContent>{t("nodes.form.outbound.removeAria")}</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="space-y-3 border-t border-border bg-muted/20 px-3 py-3">
                      <div className="grid gap-3 sm:grid-cols-4">
                        <div className="space-y-1">
                          <Label className="text-xs">{t("nodes.form.outbound.name")}</Label>
                          <Input
                            value={item.name}
                            onChange={(e) => updateOutboundAt(idx, { name: e.target.value })}
                            placeholder="WARP"
                            className="h-8 font-mono text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t("nodes.form.outbound.type")}</Label>
                          <Select
                            value={item.type}
                            onValueChange={(v) => {
                              if (!v) return
                              const nextType = v as OutboundType
                              const defaults = createDefaultOutbound(nextType, outbounds)
                              updateOutboundAt(idx, {
                                ...defaults,
                                name: item.name || defaults.name,
                                enabled: item.enabled,
                              })
                            }}
                          >
                            <SelectTrigger className="h-8 w-full bg-background text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {OUTBOUND_TYPES.map((tp) => (
                                <SelectItem key={tp} value={tp}>
                                  {typeLabel(tp)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t("nodes.form.outbound.ipVersion")}</Label>
                          <Select
                            value={item.ip_version || "dual"}
                            onValueChange={(v) =>
                              updateOutboundAt(idx, {
                                ip_version: (v === "dual" ? "" : (v ?? "")) as OutboundIPVersion,
                              })
                            }
                          >
                            <SelectTrigger className="h-8 w-full bg-background text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="dual">
                                {t("nodes.form.outbound.ipVersions.dual")}
                              </SelectItem>
                              <SelectItem value="ipv4">
                                {t("nodes.form.outbound.ipVersions.ipv4")}
                              </SelectItem>
                              <SelectItem value="ipv6">
                                {t("nodes.form.outbound.ipVersions.ipv6")}
                              </SelectItem>
                              <SelectItem value="ipv4-prefer">
                                {t("nodes.form.outbound.ipVersions.ipv4-prefer")}
                              </SelectItem>
                              <SelectItem value="ipv6-prefer">
                                {t("nodes.form.outbound.ipVersions.ipv6-prefer")}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t("nodes.form.outbound.dialerProxy")}</Label>
                          <Input
                            value={item.dialer_proxy ?? ""}
                            onChange={(e) =>
                              updateOutboundAt(idx, { dialer_proxy: e.target.value })
                            }
                            placeholder={
                              otherOutbounds[0] || t("nodes.form.outbound.dialerProxyPlaceholder")
                            }
                            className="h-8 font-mono text-xs"
                          />
                        </div>
                      </div>

                      {isTunnelType && (
                        <div className="space-y-3">
                          {/* Quick generate / register / import action bar */}
                          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background/60 px-2.5 py-2">
                            <span className="text-xs text-muted-foreground">
                              {item.type === "masque"
                                ? t("nodes.form.outbound.masqueImportHint")
                                : t("nodes.form.outbound.wgImportHint")}
                            </span>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {(item.type === "warp" || item.type === "masque") && (
                                <>
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    disabled={isRegistering}
                                    onClick={() =>
                                      warpRegisterMutation.mutate({
                                        idx,
                                        protocol: item.type === "masque" ? "masque" : "wireguard",
                                      })
                                    }
                                  >
                                    {isRegistering ? (
                                      <Loader2 className="mr-1 size-3 animate-spin" />
                                    ) : (
                                      <Sparkles className="mr-1 size-3" />
                                    )}
                                    {t("nodes.form.outbound.warpRegisterBtn")}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => {
                                      setWarpLicenseIdx(warpLicenseIdx === idx ? null : idx)
                                      setWarpLicense("")
                                    }}
                                  >
                                    WARP+
                                  </Button>
                                </>
                              )}
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                disabled={isKeygenPending}
                                onClick={() =>
                                  keygenMutation.mutate({
                                    idx,
                                    type: item.type === "masque" ? "masque" : "wireguard",
                                  })
                                }
                              >
                                {isKeygenPending ? (
                                  <Loader2 className="mr-1 size-3 animate-spin" />
                                ) : (
                                  <KeyRound className="mr-1 size-3" />
                                )}
                                {t("nodes.form.outbound.keygenBtn")}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => {
                                  setImportIdx(importIdx === idx ? null : idx)
                                  setImportText("")
                                }}
                              >
                                <ClipboardPaste className="mr-1 size-3" />
                                {t("nodes.form.outbound.importBtn")}
                              </Button>
                            </div>
                          </div>

                          {warpLicenseIdx === idx &&
                            (item.type === "warp" || item.type === "masque") && (
                              <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background p-2.5">
                                <Input
                                  value={warpLicense}
                                  onChange={(e) => setWarpLicense(e.target.value)}
                                  placeholder={t("nodes.form.outbound.warpLicensePlaceholder")}
                                  className="h-8 flex-1 font-mono text-xs"
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-8 text-xs"
                                  disabled={isRegistering}
                                  onClick={() =>
                                    warpRegisterMutation.mutate({
                                      idx,
                                      protocol: item.type === "masque" ? "masque" : "wireguard",
                                      license: warpLicense.trim(),
                                    })
                                  }
                                >
                                  {isRegistering && (
                                    <Loader2 className="mr-1 size-3 animate-spin" />
                                  )}
                                  {t("nodes.form.outbound.warpRegisterWithLicenseBtn")}
                                </Button>
                              </div>
                            )}

                          {generatedPub && (
                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="shrink-0 text-muted-foreground">
                                  {t("nodes.form.outbound.generatedLocalPubKey")}
                                </span>
                                <code className="truncate font-mono text-[11px] text-foreground">
                                  {generatedPub}
                                </code>
                              </div>
                              <CopyButton
                                value={generatedPub}
                                label={t("common.copy")}
                                size="sm"
                                variant="ghost"
                              />
                            </div>
                          )}

                          {importIdx === idx && (
                            <div className="space-y-2 rounded-md border border-border bg-background p-2.5">
                              <Textarea
                                value={importText}
                                onChange={(e) => setImportText(e.target.value)}
                                placeholder={
                                  item.type === "masque"
                                    ? t("nodes.form.outbound.masqueImportPlaceholder")
                                    : t("nodes.form.outbound.wgImportPlaceholder")
                                }
                                className="min-h-24 font-mono text-xs"
                              />
                              <div className="flex justify-end gap-1.5">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => {
                                    setImportIdx(null)
                                    setImportText("")
                                  }}
                                >
                                  {t("common.cancel")}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => handleApplyImport(idx, item.type)}
                                >
                                  {t("nodes.form.outbound.wgApplyBtn")}
                                </Button>
                              </div>
                            </div>
                          )}

                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                              <Label className="text-xs">
                                {t("nodes.form.outbound.privateKey")}
                              </Label>
                              <Input
                                value={item.private_key ?? ""}
                                onChange={(e) =>
                                  updateOutboundAt(idx, { private_key: e.target.value })
                                }
                                placeholder="base64..."
                                className="h-8 font-mono text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">
                                {t("nodes.form.outbound.publicKey")}
                              </Label>
                              <Input
                                value={item.public_key ?? ""}
                                onChange={(e) =>
                                  updateOutboundAt(idx, { public_key: e.target.value })
                                }
                                placeholder={
                                  item.type === "warp"
                                    ? "bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo="
                                    : "base64..."
                                }
                                className="h-8 font-mono text-xs"
                              />
                            </div>
                          </div>

                          {!isL4Proxy && (
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-[11px] text-muted-foreground">
                                  {t("nodes.form.outbound.tunnelStackLabel")}
                                </span>
                                <div className="flex items-center gap-1">
                                  <Button
                                    type="button"
                                    variant={item.ip && item.ipv6 ? "secondary" : "outline"}
                                    size="sm"
                                    className="h-6 px-2 text-[11px]"
                                    onClick={() => handleTunnelStackMode(idx, item, "dual")}
                                  >
                                    {t("nodes.form.outbound.stackDual")}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant={item.ip && !item.ipv6 ? "secondary" : "outline"}
                                    size="sm"
                                    className="h-6 px-2 text-[11px]"
                                    onClick={() => handleTunnelStackMode(idx, item, "v4")}
                                  >
                                    {t("nodes.form.outbound.stackV4Only")}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant={!item.ip && item.ipv6 ? "secondary" : "outline"}
                                    size="sm"
                                    className="h-6 px-2 text-[11px]"
                                    onClick={() => handleTunnelStackMode(idx, item, "v6")}
                                  >
                                    {t("nodes.form.outbound.stackV6Only")}
                                  </Button>
                                </div>
                              </div>

                              <div
                                className={
                                  item.type === "masque"
                                    ? "grid gap-3 sm:grid-cols-2"
                                    : "grid gap-3 sm:grid-cols-3"
                                }
                              >
                                <div className="space-y-1">
                                  <Label className="text-xs">{t("nodes.form.outbound.ip")}</Label>
                                  <Input
                                    value={item.ip ?? ""}
                                    onChange={(e) => {
                                      rememberAddr(idx, e.target.value, item.ipv6)
                                      updateOutboundAt(idx, { ip: e.target.value })
                                    }}
                                    placeholder="172.16.0.2/32"
                                    className="h-8 font-mono text-xs"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">{t("nodes.form.outbound.ipv6")}</Label>
                                  <Input
                                    value={item.ipv6 ?? ""}
                                    onChange={(e) => {
                                      rememberAddr(idx, item.ip, e.target.value)
                                      updateOutboundAt(idx, { ipv6: e.target.value })
                                    }}
                                    placeholder="2606:4700:110::2/128"
                                    className="h-8 font-mono text-xs"
                                  />
                                </div>
                                {item.type !== "masque" && (
                                  <div className="space-y-1">
                                    <Label className="text-xs">
                                      {t("nodes.form.outbound.reserved")}
                                    </Label>
                                    <Input
                                      value={item.reserved ?? ""}
                                      onChange={(e) =>
                                        updateOutboundAt(idx, { reserved: e.target.value })
                                      }
                                      placeholder={t("nodes.form.outbound.reservedPlaceholder")}
                                      className="h-8 font-mono text-xs"
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {(item.type === "warp" || item.type === "masque") && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[11px] text-muted-foreground">
                                {t("nodes.form.outbound.endpointPresetsLabel")}
                              </span>
                              {(item.type === "warp"
                                ? WARP_WG_ENDPOINTS
                                : WARP_MASQUE_ENDPOINTS
                              ).map((ep) => {
                                const active = item.server === ep.server
                                return (
                                  <Button
                                    key={ep.key}
                                    type="button"
                                    variant={active ? "secondary" : "outline"}
                                    size="sm"
                                    className="h-6 px-2 font-mono text-[11px]"
                                    onClick={() =>
                                      updateOutboundAt(idx, { server: ep.server, port: ep.port })
                                    }
                                  >
                                    {t(`nodes.form.outbound.endpointPresets.${ep.key}`)}
                                  </Button>
                                )
                              })}
                            </div>
                          )}

                          <div className="grid gap-3 sm:grid-cols-3">
                            <div className="space-y-1">
                              <Label className="text-xs">{t("nodes.form.outbound.server")}</Label>
                              <Input
                                value={item.server ?? ""}
                                onChange={(e) => updateOutboundAt(idx, { server: e.target.value })}
                                placeholder={
                                  item.type === "warp"
                                    ? "engage.cloudflareclient.com"
                                    : item.type === "masque"
                                      ? "162.159.198.1"
                                      : "wg.example.com"
                                }
                                className="h-8 font-mono text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">{t("nodes.form.outbound.port")}</Label>
                              <Input
                                type="number"
                                min={1}
                                max={65535}
                                value={item.port ?? ""}
                                onChange={(e) =>
                                  updateOutboundAt(idx, {
                                    port: e.target.value ? Number(e.target.value) : 0,
                                  })
                                }
                                placeholder={
                                  item.type === "warp"
                                    ? "2408"
                                    : item.type === "masque"
                                      ? "443"
                                      : "51820"
                                }
                                className="h-8 font-mono text-xs tabular-nums"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">{t("nodes.form.outbound.mtu")}</Label>
                              <Input
                                type="number"
                                min={576}
                                max={9000}
                                value={item.mtu ?? ""}
                                onChange={(e) =>
                                  updateOutboundAt(idx, {
                                    mtu: e.target.value ? Number(e.target.value) : 0,
                                  })
                                }
                                placeholder={
                                  item.type === "warp" || item.type === "masque" ? "1280" : "1420"
                                }
                                className="h-8 font-mono text-xs tabular-nums"
                              />
                            </div>
                          </div>

                          {item.type === "masque" && (
                            <div className="grid gap-3 sm:grid-cols-3">
                              <div className="space-y-1">
                                <Label className="text-xs">
                                  {t("nodes.form.outbound.masqueNetwork")}
                                </Label>
                                <Select
                                  value={item.network || "quic"}
                                  onValueChange={(v) => {
                                    const net = (v ?? "quic") as MASQUENetwork
                                    updateOutboundAt(idx, {
                                      network: net,
                                      ...(net === "h3-l4proxy" ? { udp: false } : {}),
                                    })
                                  }}
                                >
                                  <SelectTrigger className="h-8 w-full bg-background text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="quic">QUIC (HTTP/3)</SelectItem>
                                    <SelectItem value="h2">HTTP/2 (TCP)</SelectItem>
                                    <SelectItem value="h3-l4proxy">H3-L4Proxy</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">SNI</Label>
                                <Input
                                  value={item.sni ?? ""}
                                  onChange={(e) => updateOutboundAt(idx, { sni: e.target.value })}
                                  placeholder="consumer-masque.cloudflareclient.com"
                                  className="h-8 font-mono text-xs"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">
                                  {t("nodes.form.outbound.congestionController")}
                                </Label>
                                <Select
                                  value={item.congestion_controller || "default"}
                                  onValueChange={(v) =>
                                    updateOutboundAt(idx, {
                                      congestion_controller: !v || v === "default" ? "" : v,
                                    })
                                  }
                                >
                                  <SelectTrigger className="h-8 w-full bg-background text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="default">
                                      {t("nodes.form.outbound.ccDefault")}
                                    </SelectItem>
                                    <SelectItem value="bbr">BBR</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          )}

                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                              <Label className="text-xs">{t("nodes.form.outbound.dns")}</Label>
                              <Input
                                value={(item.dns ?? []).join(", ")}
                                onChange={(e) =>
                                  updateOutboundAt(idx, {
                                    dns: e.target.value
                                      .split(",")
                                      .map((s) => s.trim())
                                      .filter(Boolean),
                                  })
                                }
                                placeholder="1.1.1.1, 1.0.0.1"
                                className="h-8 font-mono text-xs"
                              />
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background/60 px-3 py-1.5">
                              <label className="flex items-center gap-2 text-xs">
                                <Switch
                                  checked={Boolean(item.remote_dns_resolve)}
                                  onCheckedChange={(checked) =>
                                    updateOutboundAt(idx, { remote_dns_resolve: checked })
                                  }
                                />
                                <span>{t("nodes.form.outbound.remoteDnsResolve")}</span>
                              </label>
                              <label className="flex items-center gap-2 text-xs">
                                <Switch
                                  disabled={isL4Proxy}
                                  checked={!isL4Proxy && item.udp !== false}
                                  onCheckedChange={(checked) =>
                                    updateOutboundAt(idx, { udp: checked })
                                  }
                                />
                                <span>{t("nodes.form.outbound.enableUdp")}</span>
                              </label>
                            </div>
                          </div>
                        </div>
                      )}

                      {(item.type === "socks5" || item.type === "http") && (
                        <div className="space-y-3">
                          <div className="grid gap-3 sm:grid-cols-3">
                            <div className="space-y-1 sm:col-span-2">
                              <Label className="text-xs">{t("nodes.form.outbound.server")}</Label>
                              <Input
                                value={item.server ?? ""}
                                onChange={(e) => updateOutboundAt(idx, { server: e.target.value })}
                                placeholder="127.0.0.1"
                                className="h-8 font-mono text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">{t("nodes.form.outbound.port")}</Label>
                              <Input
                                type="number"
                                min={1}
                                max={65535}
                                value={item.port ?? ""}
                                onChange={(e) =>
                                  updateOutboundAt(idx, {
                                    port: e.target.value ? Number(e.target.value) : 0,
                                  })
                                }
                                placeholder={item.type === "socks5" ? "40000" : "8080"}
                                className="h-8 font-mono text-xs tabular-nums"
                              />
                            </div>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                              <Label className="text-xs">{t("nodes.form.outbound.username")}</Label>
                              <Input
                                value={item.username ?? ""}
                                onChange={(e) =>
                                  updateOutboundAt(idx, { username: e.target.value })
                                }
                                placeholder={t("nodes.form.outbound.optionalPlaceholder")}
                                className="h-8 font-mono text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">{t("nodes.form.outbound.password")}</Label>
                              <Input
                                type="password"
                                value={item.password ?? ""}
                                onChange={(e) =>
                                  updateOutboundAt(idx, { password: e.target.value })
                                }
                                placeholder={t("nodes.form.outbound.optionalPlaceholder")}
                                className="h-8 font-mono text-xs"
                              />
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-4">
                            <label className="flex items-center gap-2 text-xs">
                              <Switch
                                checked={Boolean(item.tls)}
                                onCheckedChange={(checked) =>
                                  updateOutboundAt(idx, { tls: checked })
                                }
                              />
                              <span>{t("nodes.form.outbound.enableTls")}</span>
                            </label>
                            {item.tls && (
                              <label className="flex items-center gap-2 text-xs">
                                <Switch
                                  checked={Boolean(item.skip_cert_verify)}
                                  onCheckedChange={(checked) =>
                                    updateOutboundAt(idx, { skip_cert_verify: checked })
                                  }
                                />
                                <span>{t("nodes.form.outbound.skipCertVerify")}</span>
                              </label>
                            )}
                            {item.type === "socks5" && (
                              <label className="flex items-center gap-2 text-xs">
                                <Switch
                                  checked={item.udp !== false}
                                  onCheckedChange={(checked) =>
                                    updateOutboundAt(idx, { udp: checked })
                                  }
                                />
                                <span>{t("nodes.form.outbound.enableUdp")}</span>
                              </label>
                            )}
                          </div>
                        </div>
                      )}

                      {item.type === "mihob-node" && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-xs">{t("nodes.form.outbound.targetNode")}</Label>
                            <Select
                              value={item.node_ref || ""}
                              onValueChange={(v) =>
                                updateOutboundAt(idx, { node_ref: v ?? "", inbound_ref: "" })
                              }
                            >
                              <SelectTrigger className="h-8 w-full bg-background text-xs">
                                <SelectValue
                                  placeholder={t("templates.form.selectRefNodePlaceholder")}
                                />
                              </SelectTrigger>
                              <SelectContent>
                                {availableNodes.map((n) => (
                                  <SelectItem key={n.id} value={n.name}>
                                    {n.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">
                              {t("nodes.form.outbound.targetInbound")}
                            </Label>
                            <Select
                              value={item.inbound_ref || "auto"}
                              onValueChange={(v) =>
                                updateOutboundAt(idx, {
                                  inbound_ref: v && v !== "auto" ? v : "",
                                })
                              }
                            >
                              <SelectTrigger className="h-8 w-full bg-background text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="auto">
                                  {t("templates.form.refInboundAuto")}
                                </SelectItem>
                                {targetInbounds.map((inb) => (
                                  <SelectItem key={inb.id} value={inb.name}>
                                    {inb.name} ({inb.protocol}:{inb.port})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Routing mode section */}
      <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3.5">
        <div className="space-y-0.5">
          <div className="text-sm font-medium">{t("nodes.form.outbound.routingTitle")}</div>
          <p className="text-xs text-muted-foreground">{t("nodes.form.outbound.routingDesc")}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">{t("nodes.form.outbound.routeMode")}</Label>
            <Select
              value={routeMode}
              onValueChange={(v) => {
                const nextMode = (v ?? "none") as OutboundRouteMode
                const nextTarget =
                  nextMode !== "none" && !routing.target
                    ? enabledOutboundNames[0] || ""
                    : routing.target || ""
                updateRouting({ mode: nextMode, target: nextTarget })
              }}
            >
              <SelectTrigger className="h-8 w-full bg-background text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("nodes.form.outbound.routeModeNone")}</SelectItem>
                <SelectItem value="split">{t("nodes.form.outbound.routeModeSplit")}</SelectItem>
                <SelectItem value="global">{t("nodes.form.outbound.routeModeGlobal")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {routeMode !== "none" && (
            <div className="space-y-1">
              <Label className="text-xs">{t("nodes.form.outbound.routeTarget")}</Label>
              {enabledOutboundNames.length > 0 ? (
                <Select
                  value={routing.target || ""}
                  onValueChange={(v) => updateRouting({ target: v ?? "" })}
                >
                  <SelectTrigger className="h-8 w-full bg-background font-mono text-xs">
                    <SelectValue placeholder={t("nodes.form.outbound.routeTargetPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {enabledOutboundNames.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={routing.target || ""}
                  onChange={(e) => updateRouting({ target: e.target.value })}
                  placeholder={t("nodes.form.outbound.routeTargetPlaceholder")}
                  className="h-8 bg-background font-mono text-xs"
                />
              )}
            </div>
          )}
        </div>

        {routeMode === "split" && (
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("nodes.form.outbound.rulePresets")}</Label>
              <div className="flex flex-wrap gap-1.5">
                {RULE_PRESET_KEYS.map((preset) => {
                  const active = (routing.rule_presets ?? []).includes(preset)
                  return (
                    <Button
                      key={preset}
                      type="button"
                      size="sm"
                      variant={active ? "default" : "outline"}
                      className="h-7 px-2.5 text-xs"
                      onClick={() => togglePreset(preset)}
                    >
                      {t(`nodes.form.outbound.presets.${preset}`)}
                    </Button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{t("nodes.form.outbound.customDomains")}</Label>
              <Textarea
                value={customDomainsText}
                onChange={(e) =>
                  updateRouting({
                    custom_domains: e.target.value
                      .split(/\r?\n/)
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                placeholder={t("nodes.form.outbound.customDomainsPlaceholder")}
                className="min-h-20 bg-background font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                {t("nodes.form.outbound.customDomainsDesc")}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Inline server config preview */}
      {onPreview && (
        <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-0.5">
              <div className="text-sm font-medium">{t("nodes.form.previewTitle")}</div>
              <div className="text-xs text-muted-foreground">{t("nodes.form.previewDesc")}</div>
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
                disabled={previewPending}
                onClick={onPreview}
              >
                {previewPending ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <Eye className="mr-1.5 size-3.5" />
                )}
                {previewYAML ? t("nodes.form.refreshPreview") : t("nodes.form.previewBtn")}
              </Button>
            </div>
          </div>
          {previewYAML && <YamlCodeBlock value={previewYAML} className="max-h-64" />}
        </div>
      )}
    </div>
  )
}
