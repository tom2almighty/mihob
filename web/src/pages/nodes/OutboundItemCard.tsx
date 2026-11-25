import { useState } from "react"
import { useTranslation } from "react-i18next"
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react"
import { FormSwitchCard, PasswordInput } from "@/components/common/FormControls"
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Inbound, Node, NodeOutbound, OutboundIPVersion, OutboundType } from "@/lib/types"
import { OutboundCustomFields } from "./OutboundCustomFields"
import { OUTBOUND_TYPES, summarizeOutbound } from "./outboundDefaults"
import { type OutboundItemMeta, OutboundTunnelFields } from "./OutboundTunnelFields"

const DIALER_NONE = "__none__"
const DIALER_CUSTOM = "__custom__"

export interface DialerCandidate {
  name: string
  type: OutboundType
  enabled: boolean
  cyclic: boolean
}

export function OutboundItemCard({
  item,
  meta,
  isExpanded,
  availableNodes,
  inbounds,
  dialerCandidates,
  isRegistering,
  isKeygenPending,
  onToggleExpand,
  onRemove,
  onPatch,
  onRename,
  onChangeType,
  onRememberAddr,
  onRegisterWARP,
  onKeygen,
}: {
  item: NodeOutbound
  meta?: OutboundItemMeta
  isExpanded: boolean
  availableNodes: Node[]
  inbounds: Inbound[]
  dialerCandidates: DialerCandidate[]
  isRegistering: boolean
  isKeygenPending: boolean
  onToggleExpand: () => void
  onRemove: () => void
  onPatch: (patch: Partial<NodeOutbound>) => void
  onRename: (nextName: string) => void
  onChangeType: (nextType: OutboundType) => void
  onRememberAddr: (ip?: string, ipv6?: string) => void
  onRegisterWARP: (opts: {
    protocol: "wireguard" | "masque"
    license?: string
    jwt?: string
  }) => void
  onKeygen: (type: "wireguard" | "masque") => void
}) {
  const { t } = useTranslation()
  const typeLabel = (type: OutboundType) => t(`nodes.form.outbound.types.${type}`)

  const currentDialer = (item.dialer_proxy ?? "").trim()
  const isKnownCandidate = dialerCandidates.some((c) => c.name === currentDialer)
  const [customDialerMode, setCustomDialerMode] = useState(
    () => Boolean(currentDialer) && !isKnownCandidate
  )
  const showCustomDialerInput = customDialerMode || (Boolean(currentDialer) && !isKnownCandidate)
  const dialerSelectValue = showCustomDialerInput ? DIALER_CUSTOM : currentDialer || DIALER_NONE

  const isTunnelType = item.type === "wireguard" || item.type === "masque"
  const targetNodeObj =
    item.type === "mihob-node"
      ? availableNodes.find((n) => n.name === item.node_ref || String(n.id) === item.node_ref)
      : undefined
  const targetInbounds = targetNodeObj
    ? inbounds.filter((inb) => inb.node_id === targetNodeObj.id && inb.enabled)
    : []

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Switch
            checked={item.enabled}
            onCheckedChange={(checked) => onPatch({ enabled: checked })}
            aria-label={t("nodes.form.outbound.toggleAria")}
          />
          <button
            type="button"
            aria-expanded={isExpanded}
            onClick={onToggleExpand}
            className="flex min-w-0 items-center gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <span className="truncate font-mono text-xs font-semibold text-foreground">
              {item.name || t("nodes.form.outbound.unnamed")}
            </span>
            <Badge variant="secondary" className="shrink-0 text-xs">
              {typeLabel(item.type)}
            </Badge>
            {currentDialer && (
              <Badge
                variant="outline"
                className="shrink-0 font-mono text-[11px] text-muted-foreground"
              >
                via {currentDialer}
              </Badge>
            )}
            {item.ip_version && item.ip_version !== "dual" && (
              <Badge variant="outline" className="shrink-0 font-mono text-xs">
                {item.ip_version}
              </Badge>
            )}
            <span className="hidden truncate font-mono text-xs text-muted-foreground sm:inline">
              {summarizeOutbound(item, t("nodes.form.outbound.unconfigured"))}
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
                  onClick={onToggleExpand}
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
                  onClick={onRemove}
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
                onChange={(e) => onRename(e.target.value)}
                placeholder="WARP"
                className="h-8 bg-background font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("nodes.form.outbound.type")}</Label>
              <Select
                value={item.type}
                onValueChange={(v) => {
                  if (!v) return
                  onChangeType(v as OutboundType)
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
                  onPatch({
                    ip_version: (v === "dual" ? "" : (v ?? "")) as OutboundIPVersion,
                  })
                }
              >
                <SelectTrigger className="h-8 w-full bg-background text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dual">{t("nodes.form.outbound.ipVersions.dual")}</SelectItem>
                  <SelectItem value="ipv4">{t("nodes.form.outbound.ipVersions.ipv4")}</SelectItem>
                  <SelectItem value="ipv6">{t("nodes.form.outbound.ipVersions.ipv6")}</SelectItem>
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
              <Select
                value={dialerSelectValue}
                onValueChange={(v) => {
                  if (!v || v === DIALER_NONE) {
                    setCustomDialerMode(false)
                    onPatch({ dialer_proxy: "" })
                  } else if (v === DIALER_CUSTOM) {
                    setCustomDialerMode(true)
                    if (isKnownCandidate) {
                      onPatch({ dialer_proxy: "" })
                    }
                  } else {
                    setCustomDialerMode(false)
                    onPatch({ dialer_proxy: v })
                  }
                }}
              >
                <SelectTrigger className="h-8 w-full bg-background text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DIALER_NONE}>
                    {t("nodes.form.outbound.dialerProxyNone")}
                  </SelectItem>
                  {dialerCandidates.map((c) => (
                    <SelectItem key={c.name} value={c.name} disabled={c.cyclic}>
                      <span className="font-mono">{c.name}</span>
                      <span className="ml-1.5 text-muted-foreground">
                        ({typeLabel(c.type)}
                        {!c.enabled ? ` · ${t("common.disabled")}` : ""}
                        {c.cyclic ? ` · ${t("nodes.form.outbound.dialerCycleTag")}` : ""})
                      </span>
                    </SelectItem>
                  ))}
                  <SelectItem value={DIALER_CUSTOM}>
                    {t("nodes.form.outbound.dialerProxyCustom")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {showCustomDialerInput && (
            <div className="space-y-1">
              <Label className="text-xs">{t("nodes.form.outbound.dialerProxyCustomLabel")}</Label>
              <Input
                value={item.dialer_proxy ?? ""}
                onChange={(e) => onPatch({ dialer_proxy: e.target.value })}
                placeholder={t("nodes.form.outbound.dialerProxyPlaceholder")}
                className="h-8 bg-background font-mono text-xs"
              />
            </div>
          )}

          {isTunnelType && (
            <OutboundTunnelFields
              key={item.type}
              item={item}
              meta={meta}
              isRegistering={isRegistering}
              isKeygenPending={isKeygenPending}
              onPatch={onPatch}
              onRememberAddr={onRememberAddr}
              onRegisterWARP={onRegisterWARP}
              onKeygen={onKeygen}
            />
          )}

          {(item.type === "socks5" || item.type === "http") && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">{t("nodes.form.outbound.server")}</Label>
                  <Input
                    value={item.server ?? ""}
                    onChange={(e) => onPatch({ server: e.target.value })}
                    placeholder="127.0.0.1"
                    className="h-8 bg-background font-mono text-xs"
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
                      onPatch({
                        port: e.target.value ? Number(e.target.value) : 0,
                      })
                    }
                    placeholder={item.type === "socks5" ? "40000" : "8080"}
                    className="h-8 bg-background font-mono text-xs tabular-nums"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">{t("nodes.form.outbound.username")}</Label>
                  <Input
                    value={item.username ?? ""}
                    onChange={(e) => onPatch({ username: e.target.value })}
                    placeholder={t("nodes.form.outbound.optionalPlaceholder")}
                    className="h-8 bg-background font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("nodes.form.outbound.password")}</Label>
                  <PasswordInput
                    value={item.password ?? ""}
                    onChange={(e) => onPatch({ password: e.target.value })}
                    placeholder={t("nodes.form.outbound.optionalPlaceholder")}
                    className="h-8 bg-background font-mono text-xs"
                  />
                </div>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
                <FormSwitchCard
                  label={t("nodes.form.outbound.enableTls")}
                  checked={Boolean(item.tls)}
                  onCheckedChange={(checked) => onPatch({ tls: checked })}
                />
                {item.type === "socks5" && (
                  <FormSwitchCard
                    label={t("nodes.form.outbound.enableUdp")}
                    checked={item.udp !== false}
                    onCheckedChange={(checked) => onPatch({ udp: checked })}
                  />
                )}
                {item.tls && (
                  <FormSwitchCard
                    label={t("nodes.form.outbound.skipCertVerify")}
                    checked={Boolean(item.skip_cert_verify)}
                    onCheckedChange={(checked) => onPatch({ skip_cert_verify: checked })}
                  />
                )}
              </div>
            </div>
          )}

          {item.type === "custom" && <OutboundCustomFields item={item} onPatch={onPatch} />}

          {item.type === "mihob-node" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">{t("nodes.form.outbound.targetNode")}</Label>
                <Select
                  value={item.node_ref || ""}
                  onValueChange={(v) => onPatch({ node_ref: v ?? "", inbound_ref: "" })}
                >
                  <SelectTrigger className="h-8 w-full bg-background text-xs">
                    <SelectValue placeholder={t("templates.form.selectRefNodePlaceholder")} />
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
                <Label className="text-xs">{t("nodes.form.outbound.targetInbound")}</Label>
                <Select
                  value={item.inbound_ref || "auto"}
                  onValueChange={(v) =>
                    onPatch({
                      inbound_ref: v && v !== "auto" ? v : "",
                    })
                  }
                >
                  <SelectTrigger className="h-8 w-full bg-background text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{t("templates.form.refInboundAuto")}</SelectItem>
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
}
