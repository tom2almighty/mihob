import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  ChevronDown,
  ClipboardPaste,
  KeyRound,
  Loader2,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react"
import { toast } from "sonner"
import { CopyButton } from "@/components/common/CommonUI"
import { FormSwitchCard } from "@/components/common/FormControls"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { MASQUENetwork, NodeOutbound } from "@/lib/types"
import {
  DEFAULT_MASQUE_PORT,
  DEFAULT_MASQUE_SERVER,
  DEFAULT_MASQUE_SNI,
  DEFAULT_WARP_IP,
  DEFAULT_WARP_PORT,
  DEFAULT_WARP_SERVER,
  WARP_MASQUE_ENDPOINTS,
  WARP_WG_ENDPOINTS,
} from "./outboundDefaults"
import { parseMASQUEConfig, parseWireGuardConf } from "./outboundParsers"

export interface OutboundItemMeta {
  generatedPubKey?: string
  cachedIp?: string
  cachedIpv6?: string
  registeredV4?: string
  registeredV6?: string
}

type ToolPanel = null | "license" | "jwt" | "import"

export function OutboundTunnelFields({
  item,
  meta,
  canRegisterViaAgent,
  registerSource,
  isRegistering,
  isKeygenPending,
  onPatch,
  onRememberAddr,
  onChangeRegisterSource,
  onRegisterWARP,
  onKeygen,
}: {
  item: NodeOutbound
  meta?: OutboundItemMeta
  canRegisterViaAgent: boolean
  registerSource: "agent" | "hub"
  isRegistering: boolean
  isKeygenPending: boolean
  onPatch: (patch: Partial<NodeOutbound>) => void
  onRememberAddr: (ip?: string, ipv6?: string) => void
  onChangeRegisterSource: (source: "agent" | "hub") => void
  onRegisterWARP: (opts: {
    protocol: "wireguard" | "masque"
    license?: string
    jwt?: string
    source: "agent" | "hub"
  }) => void
  onKeygen: (type: "wireguard" | "masque") => void
}) {
  const { t } = useTranslation()
  const [activePanel, setActivePanel] = useState<ToolPanel>(null)
  const [importText, setImportText] = useState("")
  const [warpLicense, setWarpLicense] = useState("")
  const [warpJWT, setWarpJWT] = useState("")
  const ipv6InputRef = useRef<HTMLInputElement>(null)

  const serializedDns = (item.dns ?? []).join(", ")
  const [dnsText, setDnsText] = useState(serializedDns)
  const lastCommittedDnsRef = useRef(serializedDns)

  useEffect(() => {
    if (serializedDns !== lastCommittedDnsRef.current) {
      lastCommittedDnsRef.current = serializedDns
      setDnsText(serializedDns)
    }
  }, [serializedDns])

  const protocol: "wireguard" | "masque" = item.type === "masque" ? "masque" : "wireguard"
  const isL4Proxy = item.type === "masque" && item.network === "h3-l4proxy"

  const endpointPresets = useMemo(() => {
    const base = item.type === "masque" ? WARP_MASQUE_ENDPOINTS : WARP_WG_ENDPOINTS
    return base.map((ep) => {
      if (ep.key === "v4" && meta?.registeredV4) {
        return { ...ep, server: meta.registeredV4 }
      }
      if (ep.key === "v6" && meta?.registeredV6) {
        return { ...ep, server: meta.registeredV6 }
      }
      return ep
    })
  }, [item.type, meta?.registeredV4, meta?.registeredV6])

  const togglePanel = (panel: Exclude<ToolPanel, null>) => {
    setActivePanel((cur) => (cur === panel ? null : panel))
    setImportText("")
    setWarpLicense("")
    setWarpJWT("")
  }

  const handleApplyImport = () => {
    const patch =
      item.type === "masque" ? parseMASQUEConfig(importText) : parseWireGuardConf(importText)
    if (!patch.private_key && !patch.ip && !patch.ipv6 && !patch.server && !patch.public_key) {
      toast.error(
        item.type === "masque"
          ? t("nodes.form.outbound.masqueParseEmpty")
          : t("nodes.form.outbound.wgParseEmpty")
      )
      return
    }
    onRememberAddr(patch.ip, patch.ipv6)
    onPatch(patch)
    setActivePanel(null)
    setImportText("")
    toast.success(
      item.type === "masque"
        ? t("nodes.form.outbound.masqueParseSuccess")
        : t("nodes.form.outbound.wgParseSuccess")
    )
  }

  const handleTunnelStackMode = (mode: "dual" | "v4" | "v6") => {
    const v4 = item.ip?.trim() || meta?.cachedIp || DEFAULT_WARP_IP
    const v6 = item.ipv6?.trim() || meta?.cachedIpv6 || ""
    onRememberAddr(item.ip, item.ipv6)
    if (mode === "v4") {
      onPatch({ ip: v4, ipv6: "" })
    } else if (mode === "v6") {
      if (!v6) {
        toast.info(t("nodes.form.outbound.stackV6Missing"))
        ipv6InputRef.current?.focus()
        return
      }
      onPatch({ ip: "", ipv6: v6 })
    } else {
      onPatch({ ip: v4, ipv6: v6 })
    }
  }

  return (
    <div className="space-y-3">
      {/* Compact quick actions bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background/60 px-3 py-2">
        <span className="text-xs text-muted-foreground">
          {item.type === "masque"
            ? t("nodes.form.outbound.masqueImportHint")
            : t("nodes.form.outbound.wgImportHint")}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {canRegisterViaAgent && (
            <div className="inline-flex rounded-md border border-border bg-background p-0.5">
              {(["agent", "hub"] as const).map((src) => (
                <button
                  key={src}
                  type="button"
                  disabled={isRegistering}
                  onClick={() => onChangeRegisterSource(src)}
                  className={
                    registerSource === src
                      ? "rounded-sm bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-secondary-foreground"
                      : "rounded-sm px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                  }
                >
                  {t(
                    src === "agent"
                      ? "nodes.form.outbound.warpSourceAgent"
                      : "nodes.form.outbound.warpSourceHub"
                  )}
                </button>
              ))}
            </div>
          )}
          <Button
            type="button"
            size="sm"
            className="h-7 px-2.5 text-xs"
            disabled={isRegistering}
            onClick={() => onRegisterWARP({ protocol, source: registerSource })}
          >
            {isRegistering ? (
              <Loader2 className="mr-1.5 size-3 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 size-3" />
            )}
            {t("nodes.form.outbound.warpRegisterBtn")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={isKeygenPending || isRegistering}
                >
                  {isKeygenPending ? (
                    <Loader2 className="mr-1 size-3 animate-spin" />
                  ) : (
                    <Wrench className="mr-1 size-3" />
                  )}
                  {t("nodes.form.outbound.toolsMenuBtn")}
                  <ChevronDown className="ml-1 size-3 text-muted-foreground" />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => togglePanel("license")}>
                <Sparkles className="mr-2 size-3.5" />
                {t("nodes.form.outbound.warpRegisterWithLicenseBtn")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => togglePanel("jwt")}>
                <ShieldCheck className="mr-2 size-3.5" />
                {t("nodes.form.outbound.warpRegisterWithJwtBtn")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onKeygen(protocol)}>
                <KeyRound className="mr-2 size-3.5" />
                {t("nodes.form.outbound.keygenBtn")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => togglePanel("import")}>
                <ClipboardPaste className="mr-2 size-3.5" />
                {t("nodes.form.outbound.importBtn")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {activePanel === "license" && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background p-2.5">
          <Input
            value={warpLicense}
            onChange={(e) => setWarpLicense(e.target.value)}
            placeholder={t("nodes.form.outbound.warpLicensePlaceholder")}
            className="h-8 flex-1 font-mono text-xs"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setActivePanel(null)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 text-xs"
            disabled={isRegistering}
            onClick={() => {
              onRegisterWARP({
                protocol,
                license: warpLicense.trim(),
                source: registerSource,
              })
              setActivePanel(null)
              setWarpLicense("")
            }}
          >
            {isRegistering && <Loader2 className="mr-1 size-3 animate-spin" />}
            {t("nodes.form.outbound.warpRegisterWithLicenseBtn")}
          </Button>
        </div>
      )}

      {activePanel === "jwt" && (
        <div className="space-y-2 rounded-md border border-border bg-background p-2.5">
          <p className="text-[11px] text-muted-foreground">
            {t("nodes.form.outbound.warpJwtDesc")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={warpJWT}
              onChange={(e) => setWarpJWT(e.target.value)}
              placeholder={t("nodes.form.outbound.warpJwtPlaceholder")}
              className="h-8 flex-1 font-mono text-xs"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setActivePanel(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 text-xs"
              disabled={isRegistering || !warpJWT.trim()}
              onClick={() => {
                onRegisterWARP({
                  protocol,
                  jwt: warpJWT.trim(),
                  source: registerSource,
                })
                setActivePanel(null)
                setWarpJWT("")
              }}
            >
              {isRegistering && <Loader2 className="mr-1 size-3 animate-spin" />}
              {t("nodes.form.outbound.warpRegisterWithJwtBtn")}
            </Button>
          </div>
        </div>
      )}

      {meta?.generatedPubKey && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-muted-foreground">
              {t("nodes.form.outbound.generatedLocalPubKey")}
            </span>
            <code className="truncate font-mono text-xs text-foreground">
              {meta.generatedPubKey}
            </code>
          </div>
          <CopyButton
            value={meta.generatedPubKey}
            label={t("common.copy")}
            size="sm"
            variant="ghost"
          />
        </div>
      )}

      {activePanel === "import" && (
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
                setActivePanel(null)
                setImportText("")
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button type="button" size="sm" className="h-7 text-xs" onClick={handleApplyImport}>
              {t("nodes.form.outbound.wgApplyBtn")}
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">{t("nodes.form.outbound.privateKey")}</Label>
          <Input
            value={item.private_key ?? ""}
            onChange={(e) => onPatch({ private_key: e.target.value })}
            placeholder="base64..."
            className="h-8 bg-background font-mono text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("nodes.form.outbound.publicKey")}</Label>
          <Input
            value={item.public_key ?? ""}
            onChange={(e) => onPatch({ public_key: e.target.value })}
            placeholder="base64..."
            className="h-8 bg-background font-mono text-xs"
          />
        </div>
      </div>

      {!isL4Proxy && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {t("nodes.form.outbound.tunnelStackLabel")}
            </span>
            <div className="inline-flex rounded-md border border-border bg-background p-0.5">
              {(
                [
                  { id: "dual", active: Boolean(item.ip && item.ipv6), key: "stackDual" },
                  { id: "v4", active: Boolean(item.ip && !item.ipv6), key: "stackV4Only" },
                  { id: "v6", active: Boolean(!item.ip && item.ipv6), key: "stackV6Only" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleTunnelStackMode(opt.id)}
                  className={
                    opt.active
                      ? "rounded-sm bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
                      : "rounded-sm px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  }
                >
                  {t(`nodes.form.outbound.${opt.key}`)}
                </button>
              ))}
            </div>
          </div>

          <div
            className={
              item.type === "masque" ? "grid gap-3 sm:grid-cols-2" : "grid gap-3 sm:grid-cols-3"
            }
          >
            <div className="space-y-1">
              <Label className="text-xs">{t("nodes.form.outbound.ip")}</Label>
              <Input
                value={item.ip ?? ""}
                onChange={(e) => {
                  onRememberAddr(e.target.value, item.ipv6)
                  onPatch({ ip: e.target.value })
                }}
                placeholder={DEFAULT_WARP_IP}
                className="h-8 bg-background font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("nodes.form.outbound.ipv6")}</Label>
              <Input
                ref={ipv6InputRef}
                value={item.ipv6 ?? ""}
                onChange={(e) => {
                  onRememberAddr(item.ip, e.target.value)
                  onPatch({ ipv6: e.target.value })
                }}
                placeholder="2606:4700:110::2/128"
                className="h-8 bg-background font-mono text-xs"
              />
            </div>
            {item.type !== "masque" && (
              <div className="space-y-1">
                <Label className="text-xs">{t("nodes.form.outbound.reserved")}</Label>
                <Input
                  value={item.reserved ?? ""}
                  onChange={(e) => onPatch({ reserved: e.target.value })}
                  placeholder={t("nodes.form.outbound.reservedPlaceholder")}
                  className="h-8 bg-background font-mono text-xs"
                />
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-1">
            <Label className="text-xs">{t("nodes.form.outbound.server")}</Label>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    className="inline-flex items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <span>{t("nodes.form.outbound.endpointPresetsShort")}</span>
                    <ChevronDown className="size-3" />
                  </button>
                }
              />
              <DropdownMenuContent align="end" className="w-60">
                {endpointPresets.map((ep) => (
                  <DropdownMenuItem
                    key={ep.key}
                    onClick={() => onPatch({ server: ep.server, port: ep.port })}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="text-xs">
                        {t(`nodes.form.outbound.endpointPresets.${ep.key}`)}
                      </span>
                      <span className="truncate font-mono text-xs text-muted-foreground">
                        {ep.server}
                      </span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Input
            value={item.server ?? ""}
            onChange={(e) => onPatch({ server: e.target.value })}
            placeholder={item.type === "masque" ? DEFAULT_MASQUE_SERVER : DEFAULT_WARP_SERVER}
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
            placeholder={
              item.type === "masque" ? String(DEFAULT_MASQUE_PORT) : String(DEFAULT_WARP_PORT)
            }
            className="h-8 bg-background font-mono text-xs tabular-nums"
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
              onPatch({
                mtu: e.target.value ? Number(e.target.value) : 0,
              })
            }
            placeholder="1280"
            className="h-8 bg-background font-mono text-xs tabular-nums"
          />
        </div>
      </div>

      {item.type === "masque" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">{t("nodes.form.outbound.masqueNetwork")}</Label>
            <Select
              value={item.network || "quic"}
              onValueChange={(v) => {
                const net = (v ?? "quic") as MASQUENetwork
                onPatch({
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
              onChange={(e) => onPatch({ sni: e.target.value })}
              placeholder={DEFAULT_MASQUE_SNI}
              className="h-8 bg-background font-mono text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("nodes.form.outbound.congestionController")}</Label>
            <Select
              value={item.congestion_controller || "default"}
              onValueChange={(v) =>
                onPatch({
                  congestion_controller: !v || v === "default" ? "" : v,
                })
              }
            >
              <SelectTrigger className="h-8 w-full bg-background text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">{t("nodes.form.outbound.ccDefault")}</SelectItem>
                <SelectItem value="bbr">BBR</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-xs">{t("nodes.form.outbound.dns")}</Label>
        <Input
          value={dnsText}
          onChange={(e) => {
            const raw = e.target.value
            setDnsText(raw)
            const parsed = raw
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
            lastCommittedDnsRef.current = parsed.join(", ")
            onPatch({ dns: parsed })
          }}
          placeholder="1.1.1.1, 1.0.0.1"
          className="h-8 bg-background font-mono text-xs"
        />
      </div>

      <div
        className={
          item.type === "masque" ? "grid gap-2.5 sm:grid-cols-3" : "grid gap-2.5 sm:grid-cols-2"
        }
      >
        <FormSwitchCard
          label={t("nodes.form.outbound.remoteDnsResolve")}
          checked={Boolean(item.remote_dns_resolve)}
          onCheckedChange={(checked) => onPatch({ remote_dns_resolve: checked })}
        />
        <FormSwitchCard
          label={t("nodes.form.outbound.enableUdp")}
          disabled={isL4Proxy}
          checked={!isL4Proxy && item.udp !== false}
          onCheckedChange={(checked) => onPatch({ udp: checked })}
        />
        {item.type === "masque" && (
          <FormSwitchCard
            label={t("nodes.form.outbound.skipCertVerify")}
            checked={Boolean(item.skip_cert_verify)}
            onCheckedChange={(checked) => onPatch({ skip_cert_verify: checked })}
          />
        )}
      </div>
    </div>
  )
}
