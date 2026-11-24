import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { ChevronDown, ChevronUp, ClipboardPaste, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
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
import type {
  Inbound,
  Node,
  NodeOutbound,
  NodeOutboundConfig,
  OutboundRouteMode,
  OutboundType,
} from "@/lib/types"

const RULE_PRESET_KEYS = [
  "ai",
  "netflix",
  "disney",
  "youtube",
  "tiktok",
  "spotify",
  "google",
] as const

const DEFAULT_OUTBOUND_NAMES: Record<OutboundType, string> = {
  warp: "WARP",
  wireguard: "WG-OUT",
  socks5: "SOCKS5-OUT",
  http: "HTTP-OUT",
  "mihob-node": "UNLOCK-NODE",
}

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

function parseWireGuardConf(raw: string): Partial<NodeOutbound> {
  const patch: Partial<NodeOutbound> = {}
  const lines = raw.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("[")) continue
    const eqIdx = trimmed.indexOf("=")
    if (eqIdx <= 0) continue
    const key = trimmed.slice(0, eqIdx).trim().toLowerCase()
    const val = trimmed.slice(eqIdx + 1).trim()
    if (!val) continue

    switch (key) {
      case "privatekey":
        patch.private_key = val
        break
      case "publickey":
        patch.public_key = val
        break
      case "presharedkey":
        patch.pre_shared_key = val
        break
      case "mtu": {
        const n = Number.parseInt(val, 10)
        if (!Number.isNaN(n) && n > 0) patch.mtu = n
        break
      }
      case "reserved":
        patch.reserved = val
        break
      case "dns": {
        const dnsList = val
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
        if (dnsList.length > 0) patch.dns = dnsList
        break
      }
      case "address": {
        const addrs = val
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
        for (const addr of addrs) {
          if (addr.includes(":")) {
            patch.ipv6 = addr
          } else {
            patch.ip = addr
          }
        }
        break
      }
      case "endpoint": {
        // Supports IPv4:port, host:port, and [IPv6]:port
        const bracketMatch = val.match(/^\[([^\]]+)\]:(\d+)$/)
        if (bracketMatch) {
          patch.server = bracketMatch[1]
          patch.port = Number.parseInt(bracketMatch[2], 10)
        } else {
          const lastColon = val.lastIndexOf(":")
          if (lastColon > 0) {
            patch.server = val.slice(0, lastColon).trim()
            const p = Number.parseInt(val.slice(lastColon + 1).trim(), 10)
            if (!Number.isNaN(p) && p > 0) patch.port = p
          }
        }
        break
      }
    }
  }
  return patch
}

export function NodeOutboundEditor({
  value,
  onChange,
  nodes,
  inbounds,
  excludeNodeId,
}: {
  value: NodeOutboundConfig
  onChange: (next: NodeOutboundConfig) => void
  nodes: Node[]
  inbounds: Inbound[]
  excludeNodeId?: number
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
  const [wgPasteIdx, setWgPasteIdx] = useState<number | null>(null)
  const [wgPasteText, setWgPasteText] = useState("")

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
    setWgPasteIdx(null)
    setWgPasteText("")
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

  const handleApplyWgConf = (idx: number) => {
    const patch = parseWireGuardConf(wgPasteText)
    if (!patch.private_key && !patch.ip && !patch.ipv6 && !patch.server && !patch.public_key) {
      toast.error(t("nodes.form.outbound.wgParseEmpty"))
      return
    }
    updateOutboundAt(idx, patch)
    setWgPasteIdx(null)
    setWgPasteText("")
    toast.success(t("nodes.form.outbound.wgParseSuccess"))
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
    const host = o.server || (o.type === "warp" ? "engage.cloudflareclient.com" : "")
    const port = o.port || (o.type === "warp" ? 2408 : 0)
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
            {(["warp", "socks5", "http", "wireguard", "mihob-node"] as OutboundType[]).map(
              (type) => (
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
              )
            )}
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
                      <div className="grid gap-3 sm:grid-cols-3">
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
                              {(
                                [
                                  "warp",
                                  "socks5",
                                  "http",
                                  "wireguard",
                                  "mihob-node",
                                ] as OutboundType[]
                              ).map((tp) => (
                                <SelectItem key={tp} value={tp}>
                                  {typeLabel(tp)}
                                </SelectItem>
                              ))}
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

                      {(item.type === "warp" || item.type === "wireguard") && (
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background/60 px-2.5 py-2">
                            <span className="text-xs text-muted-foreground">
                              {t("nodes.form.outbound.wgImportHint")}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => {
                                setWgPasteIdx(wgPasteIdx === idx ? null : idx)
                                setWgPasteText("")
                              }}
                            >
                              <ClipboardPaste className="mr-1 size-3" />
                              {t("nodes.form.outbound.wgImportBtn")}
                            </Button>
                          </div>

                          {wgPasteIdx === idx && (
                            <div className="space-y-2 rounded-md border border-border bg-background p-2.5">
                              <Textarea
                                value={wgPasteText}
                                onChange={(e) => setWgPasteText(e.target.value)}
                                placeholder={t("nodes.form.outbound.wgImportPlaceholder")}
                                className="min-h-24 font-mono text-xs"
                              />
                              <div className="flex justify-end gap-1.5">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => {
                                    setWgPasteIdx(null)
                                    setWgPasteText("")
                                  }}
                                >
                                  {t("common.cancel")}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => handleApplyWgConf(idx)}
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

                          <div className="grid gap-3 sm:grid-cols-3">
                            <div className="space-y-1">
                              <Label className="text-xs">{t("nodes.form.outbound.ip")}</Label>
                              <Input
                                value={item.ip ?? ""}
                                onChange={(e) => updateOutboundAt(idx, { ip: e.target.value })}
                                placeholder="172.16.0.2/32"
                                className="h-8 font-mono text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">{t("nodes.form.outbound.ipv6")}</Label>
                              <Input
                                value={item.ipv6 ?? ""}
                                onChange={(e) => updateOutboundAt(idx, { ipv6: e.target.value })}
                                placeholder="2606:4700:110::2/128"
                                className="h-8 font-mono text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">{t("nodes.form.outbound.reserved")}</Label>
                              <Input
                                value={item.reserved ?? ""}
                                onChange={(e) =>
                                  updateOutboundAt(idx, { reserved: e.target.value })
                                }
                                placeholder={t("nodes.form.outbound.reservedPlaceholder")}
                                className="h-8 font-mono text-xs"
                              />
                            </div>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-3">
                            <div className="space-y-1">
                              <Label className="text-xs">{t("nodes.form.outbound.server")}</Label>
                              <Input
                                value={item.server ?? ""}
                                onChange={(e) => updateOutboundAt(idx, { server: e.target.value })}
                                placeholder={
                                  item.type === "warp"
                                    ? "engage.cloudflareclient.com"
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
                                placeholder={item.type === "warp" ? "2408" : "51820"}
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
                                placeholder={item.type === "warp" ? "1280" : "1420"}
                                className="h-8 font-mono text-xs tabular-nums"
                              />
                            </div>
                          </div>

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
                            <div className="flex items-center justify-between rounded-md border border-border bg-background/60 px-3 py-1.5">
                              <Label className="text-xs">
                                {t("nodes.form.outbound.remoteDnsResolve")}
                              </Label>
                              <Switch
                                checked={Boolean(item.remote_dns_resolve)}
                                onCheckedChange={(checked) =>
                                  updateOutboundAt(idx, { remote_dns_resolve: checked })
                                }
                              />
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
    </div>
  )
}
