import { useMemo, useRef, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import type {
  Inbound,
  Node,
  NodeOutbound,
  NodeOutboundConfig,
  NodeOutboundRouting,
  OutboundType,
} from "@/lib/types"
import { createDefaultOutbound, OUTBOUND_TYPES } from "./outboundDefaults"
import { OutboundItemCard } from "./OutboundItemCard"
import { OutboundRoutingSection } from "./OutboundRoutingSection"
import type { OutboundItemMeta } from "./OutboundTunnelFields"
import { ServerConfigPreviewCard } from "./ServerConfigPreviewCard"

const EMPTY_ROUTING: NodeOutboundRouting = {
  mode: "none",
  target: "",
  rule_presets: [],
  custom_domains: [],
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
      }
    })
  }

  const addOutbound = (type: OutboundType) => {
    const created = createDefaultOutbound(type, outbounds)
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
    const next = outbounds.filter((o) => getItemUid(o) !== uid)
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
    }: {
      uid: string
      protocol: "wireguard" | "masque"
      license?: string
    }) => api.registerWARP({ protocol, license }).then((res) => ({ uid, res })),
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
                {t(`nodes.form.outbound.types.${type}`)}
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
            {outbounds.map((item) => {
              const uid = getItemUid(item)
              const otherOutboundNames = outbounds
                .filter((o) => getItemUid(o) !== uid)
                .map((o) => o.name.trim())
                .filter(Boolean)

              return (
                <OutboundItemCard
                  key={uid}
                  item={item}
                  meta={itemMeta[uid]}
                  isExpanded={expandedUid === uid}
                  availableNodes={availableNodes}
                  inbounds={inbounds}
                  otherOutboundNames={otherOutboundNames}
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
                  onRegisterWARP={(protocol, license) =>
                    warpRegisterMutation.mutate({ uid, protocol, license })
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
