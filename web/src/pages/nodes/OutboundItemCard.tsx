import { useTranslation } from "react-i18next"
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react"
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
import { OUTBOUND_TYPES, summarizeOutbound } from "./outboundDefaults"
import { type OutboundItemMeta, OutboundTunnelFields } from "./OutboundTunnelFields"

export function OutboundItemCard({
  item,
  meta,
  isExpanded,
  availableNodes,
  inbounds,
  otherOutboundNames,
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
  otherOutboundNames: string[]
  isRegistering: boolean
  isKeygenPending: boolean
  onToggleExpand: () => void
  onRemove: () => void
  onPatch: (patch: Partial<NodeOutbound>) => void
  onRename: (nextName: string) => void
  onChangeType: (nextType: OutboundType) => void
  onRememberAddr: (ip?: string, ipv6?: string) => void
  onRegisterWARP: (protocol: "wireguard" | "masque", license?: string) => void
  onKeygen: (type: "wireguard" | "masque") => void
}) {
  const { t } = useTranslation()
  const typeLabel = (type: OutboundType) => t(`nodes.form.outbound.types.${type}`)

  const isTunnelType = item.type === "warp" || item.type === "wireguard" || item.type === "masque"
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
                className="h-8 font-mono text-xs"
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
              <Input
                value={item.dialer_proxy ?? ""}
                onChange={(e) => onPatch({ dialer_proxy: e.target.value })}
                placeholder={
                  otherOutboundNames[0] || t("nodes.form.outbound.dialerProxyPlaceholder")
                }
                className="h-8 font-mono text-xs"
              />
            </div>
          </div>

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
                      onPatch({
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
                    onChange={(e) => onPatch({ username: e.target.value })}
                    placeholder={t("nodes.form.outbound.optionalPlaceholder")}
                    className="h-8 font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("nodes.form.outbound.password")}</Label>
                  <Input
                    type="password"
                    value={item.password ?? ""}
                    onChange={(e) => onPatch({ password: e.target.value })}
                    placeholder={t("nodes.form.outbound.optionalPlaceholder")}
                    className="h-8 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-xs">
                  <Switch
                    checked={Boolean(item.tls)}
                    onCheckedChange={(checked) => onPatch({ tls: checked })}
                  />
                  <span>{t("nodes.form.outbound.enableTls")}</span>
                </label>
                {item.tls && (
                  <label className="flex items-center gap-2 text-xs">
                    <Switch
                      checked={Boolean(item.skip_cert_verify)}
                      onCheckedChange={(checked) => onPatch({ skip_cert_verify: checked })}
                    />
                    <span>{t("nodes.form.outbound.skipCertVerify")}</span>
                  </label>
                )}
                {item.type === "socks5" && (
                  <label className="flex items-center gap-2 text-xs">
                    <Switch
                      checked={item.udp !== false}
                      onCheckedChange={(checked) => onPatch({ udp: checked })}
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
