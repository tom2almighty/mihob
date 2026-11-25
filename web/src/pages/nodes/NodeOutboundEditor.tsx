import { useMemo, useRef, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { ChevronDown, Plus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { api } from "@/lib/api"
import type {
  Inbound,
  Node,
  NodeOutbound,
  NodeOutboundConfig,
  NodeOutboundRouting,
  OutboundType,
} from "@/lib/types"
import { createDefaultOutbound } from "./outboundDefaults"
import { type DialerCandidate, OutboundItemCard } from "./OutboundItemCard"
import { OutboundRoutingSection } from "./OutboundRoutingSection"
import type { OutboundItemMeta } from "./OutboundTunnelFields"
import { ServerConfigPreviewCard } from "./ServerConfigPreviewCard"

const EMPTY_ROUTING: NodeOutboundRouting = {
  mode: "none",
  target: "",
  rule_presets: [],
  custom_domains: [],
}

function wouldCreateDialerCycle(
  outbounds: NodeOutbound[],
  fromName: string,
  candidateName: string
): boolean {
  const fromKey = fromName.trim().toLowerCase()
  const startKey = candidateName.trim().toLowerCase()
  if (!fromKey || !startKey) return false
  if (fromKey === startKey) return true
  const nextByKey = new Map<string, string>()
  for (const o of outbounds) {
    const k = o.name.trim().toLowerCase()
    const d = (o.dialer_proxy ?? "").trim().toLowerCase()
    if (k && d) nextByKey.set(k, d)
  }
  const visited = new Set<string>([fromKey])
  let cur: string | undefined = startKey
  while (cur) {
    if (visited.has(cur)) return true
    visited.add(cur)
    cur = nextByKey.get(cur)
  }
  return false
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
  const routing = value.routing ?? EMPTY_ROUTING

  // Stable per-item UIDs immune to index shifts and async mutation races
  const uidMapRef = useRef(new WeakMap<NodeOutbound, string>())
  const uidSeqRef = useRef(1)
  const latestValueRef = useRef(value)
  latestValueRef.current = value
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const getItemUid = (item: NodeOutbound): string => {
    const existing = uidMapRef.current.get(item)
    if (existing) return existing
    const next = `ob-${uidSeqRef.current++}`
    uidMapRef.current.set(item, next)
    return next
  }

  const bindUid = (item: NodeOutbound, uid: string): NodeOutbound => {
    uidMapRef.current.set(item, uid)
    return item
  }

  const [expandedUid, setExpandedUid] = useState<string | null>(null)
  const [itemMeta, setItemMeta] = useState<Record<string, OutboundItemMeta>>({})

  const availableNodes = useMemo(
    () => nodes.filter((n) => n.enabled && n.id !== excludeNodeId),
    [nodes, excludeNodeId]
  )

  const enabledOutboundNames = useMemo(
    () => outbounds.filter((o) => o.enabled && o.name.trim()).map((o) => o.name.trim()),
    [outbounds]
  )

  const patchMeta = (uid: string, patch: Partial<OutboundItemMeta>) => {
    setItemMeta((prev) => ({
      ...prev,
      [uid]: {
        ...prev[uid],
        ...patch,
      },
    }))
  }

  const clearMeta = (uid: string) => {
    setItemMeta((prev) => {
      if (!(uid in prev)) return prev
      const next = { ...prev }
      delete next[uid]
      return next
    })
  }

  const rememberAddr = (uid: string, ip?: string, ipv6?: string) => {
    setItemMeta((prev) => ({
      ...prev,
      [uid]: {
        ...prev[uid],
        cachedIp: ip?.trim() ? ip.trim() : prev[uid]?.cachedIp,
        cachedIpv6: ipv6?.trim() ? ipv6.trim() : prev[uid]?.cachedIpv6,
      },
    }))
  }

  const patchOutboundByUid = (
    uid: string,
    buildPatch: (current: NodeOutbound) => Partial<NodeOutbound>
  ) => {
    const curVal = latestValueRef.current
    const curOutbounds = curVal.outbounds ?? []
    let matched = false
    const nextOutbounds = curOutbounds.map((item) => {
      const itemUid = getItemUid(item)
      if (itemUid !== uid) return item
      matched = true
      return bindUid({ ...item, ...buildPatch(item) }, uid)
    })
    if (!matched) return
    onChangeRef.current({
      ...curVal,
      outbounds: nextOutbounds,
    })
  }

  const renameOutboundByUid = (uid: string, nextName: string) => {
    const curVal = latestValueRef.current
    const curOutbounds = curVal.outbounds ?? []
    const curRouting = curVal.routing ?? EMPTY_ROUTING
    const targetItem = curOutbounds.find((o) => getItemUid(o) === uid)
    if (!targetItem) return

    const oldName = targetItem.name.trim()
    const nextOutbounds = curOutbounds.map((item) => {
      const itemUid = getItemUid(item)
      if (itemUid === uid) {
        return bindUid({ ...item, name: nextName }, uid)
      }
      if (oldName && item.dialer_proxy === oldName) {
        return bindUid({ ...item, dialer_proxy: nextName }, itemUid)
      }
      return item
    })

    const nextRouting =
      oldName && curRouting.target === oldName ? { ...curRouting, target: nextName } : curRouting

    onChangeRef.current({
      ...curVal,
      outbounds: nextOutbounds,
      routing: nextRouting,
    })
  }

  const changeTypeByUid = (uid: string, nextType: OutboundType) => {
    clearMeta(uid)
    patchOutboundByUid(uid, (current) => {
      const defaults = createDefaultOutbound(nextType, latestValueRef.current.outbounds ?? [])
      return {
        ...defaults,
        name: current.name || defaults.name,
        enabled: current.enabled,
        ip_version: current.ip_version,
        dialer_proxy: current.dialer_proxy,
      }
    })
  }

  const addOutbound = (type: OutboundType, preset?: "warp") => {
    const created = createDefaultOutbound(type, outbounds, preset)
    const uid = getItemUid(created)
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
    setExpandedUid(uid)
  }

  const removeOutbound = (uid: string) => {
    const removed = outbounds.find((o) => getItemUid(o) === uid)
    const removedName = removed?.name.trim() || ""
    const next = outbounds
      .filter((o) => getItemUid(o) !== uid)
      .map((item) => {
        if (removedName && (item.dialer_proxy ?? "").trim() === removedName) {
          return bindUid({ ...item, dialer_proxy: "" }, getItemUid(item))
        }
        return item
      })
    const nextRouting = { ...routing }
    if (removedName && nextRouting.target === removedName) {
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
    clearMeta(uid)
    if (expandedUid === uid) {
      setExpandedUid(null)
    }
  }

  const updateRouting = (patch: Partial<NodeOutboundRouting>) => {
    onChange({
      ...value,
      routing: {
        ...routing,
        ...patch,
      },
    })
  }

  const keygenMutation = useMutation({
    mutationFn: ({ uid, type }: { uid: string; type: "wireguard" | "masque" }) =>
      api.keygen(type).then((res) => ({ uid, res })),
    onSuccess: ({ uid, res }) => {
      const exists = (latestValueRef.current.outbounds ?? []).some((o) => getItemUid(o) === uid)
      if (!exists) return
      patchOutboundByUid(uid, () => ({ private_key: res.private_key }))
      if (res.public_key) {
        patchMeta(uid, { generatedPubKey: res.public_key })
      }
      toast.success(t("nodes.form.outbound.keypairGenerated"))
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const warpRegisterMutation = useMutation({
    mutationFn: ({
      uid,
      protocol,
      license,
      jwt,
    }: {
      uid: string
      protocol: "wireguard" | "masque"
      license?: string
      jwt?: string
    }) => api.registerWARP({ protocol, license, jwt }).then((res) => ({ uid, res })),
    onSuccess: ({ uid, res }) => {
      const exists = (latestValueRef.current.outbounds ?? []).some((o) => getItemUid(o) === uid)
      if (!exists) return
      patchMeta(uid, {
        cachedIp: res.ip?.trim() || undefined,
        cachedIpv6: res.ipv6?.trim() || undefined,
        registeredV4: res.server_v4?.trim() || undefined,
        registeredV6: res.server_v6?.trim() || undefined,
      })
      patchOutboundByUid(uid, (current) => {
        const patch: Partial<NodeOutbound> = {
          private_key: res.private_key,
          public_key: res.public_key,
          ip: res.ip,
          ipv6: res.ipv6,
          server: res.server || current.server,
          port: res.port || current.port,
          mtu: res.mtu || current.mtu,
        }
        if (res.protocol === "wireguard" && res.reserved) {
          patch.reserved = res.reserved
        }
        if (res.protocol === "masque" && res.sni) {
          patch.sni = res.sni
        }
        return patch
      })
      toast.success(t("nodes.form.outbound.warpRegisterSuccess"))
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <div className="space-y-5">
      {/* Outbound definitions list */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-0.5">
            <div className="text-sm font-medium">{t("nodes.form.outbound.listTitle")}</div>
            <p className="text-xs text-muted-foreground">{t("nodes.form.outbound.listDesc")}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button type="button" variant="outline" size="sm">
                  <Plus className="mr-1.5 size-3.5" />
                  {t("nodes.form.outbound.addOutboundBtn")}
                  <ChevronDown className="ml-1.5 size-3.5 text-muted-foreground" />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>{t("nodes.form.outbound.menuGroupWarp")}</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => addOutbound("wireguard", "warp")}>
                  {t("nodes.form.outbound.menuWarpWg")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addOutbound("masque", "warp")}>
                  {t("nodes.form.outbound.menuWarpMasque")}
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>{t("nodes.form.outbound.menuGroupProxy")}</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => addOutbound("wireguard")}>
                  {t("nodes.form.outbound.types.wireguard")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addOutbound("masque")}>
                  {t("nodes.form.outbound.types.masque")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addOutbound("socks5")}>
                  {t("nodes.form.outbound.types.socks5")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addOutbound("http")}>
                  {t("nodes.form.outbound.types.http")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addOutbound("custom")}>
                  {t("nodes.form.outbound.types.custom")}
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>{t("nodes.form.outbound.menuGroupRelay")}</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => addOutbound("mihob-node")}>
                  {t("nodes.form.outbound.types.mihob-node")}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {outbounds.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-xs text-muted-foreground">
            {t("nodes.form.outbound.emptyHint")}
          </div>
        ) : (
          <div className="space-y-2.5">
            {outbounds.map((item) => {
              const uid = getItemUid(item)
              const dialerCandidates: DialerCandidate[] = outbounds
                .filter((o) => getItemUid(o) !== uid && o.name.trim())
                .map((o) => ({
                  name: o.name.trim(),
                  type: o.type,
                  enabled: o.enabled,
                  cyclic: wouldCreateDialerCycle(outbounds, item.name, o.name),
                }))

              return (
                <OutboundItemCard
                  key={uid}
                  item={item}
                  meta={itemMeta[uid]}
                  isExpanded={expandedUid === uid}
                  availableNodes={availableNodes}
                  inbounds={inbounds}
                  dialerCandidates={dialerCandidates}
                  isRegistering={
                    warpRegisterMutation.isPending && warpRegisterMutation.variables?.uid === uid
                  }
                  isKeygenPending={
                    keygenMutation.isPending && keygenMutation.variables?.uid === uid
                  }
                  onToggleExpand={() => setExpandedUid(expandedUid === uid ? null : uid)}
                  onRemove={() => removeOutbound(uid)}
                  onPatch={(patch) => patchOutboundByUid(uid, () => patch)}
                  onRename={(nextName) => renameOutboundByUid(uid, nextName)}
                  onChangeType={(nextType) => changeTypeByUid(uid, nextType)}
                  onRememberAddr={(ip, ipv6) => rememberAddr(uid, ip, ipv6)}
                  onRegisterWARP={({ protocol, license, jwt }) =>
                    warpRegisterMutation.mutate({ uid, protocol, license, jwt })
                  }
                  onKeygen={(type) => keygenMutation.mutate({ uid, type })}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Routing mode section */}
      <OutboundRoutingSection
        routing={routing}
        enabledOutboundNames={enabledOutboundNames}
        onUpdateRouting={updateRouting}
      />

      {/* Inline server config preview */}
      {onPreview && (
        <ServerConfigPreviewCard
          previewYAML={previewYAML}
          previewPending={previewPending}
          onPreview={onPreview}
        />
      )}
    </div>
  )
}
