import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { AlertCircle, ChevronDown, ChevronUp, Info, ShieldCheck } from "lucide-react"
import { TagInput } from "@/components/common/TagInput"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  evaluateAccessPolicy,
  matchNode,
  validateRegex,
} from "@/lib/accessPolicy"
import {
  PROTOCOL_LABELS,
  type AccessMode,
  type AccessPolicy,
  type Inbound,
  type MatchMode,
  type Node,
  type Protocol,
} from "@/lib/types"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

const ALL_PROTOCOLS = Object.keys(PROTOCOL_LABELS) as Protocol[]

function ModeToggle({
  value,
  onChange,
  labels,
}: {
  value: AccessMode
  onChange: (next: AccessMode) => void
  labels: Record<AccessMode, string>
}) {
  return (
    <div className="inline-flex items-center rounded-md border border-border bg-muted/50 p-0.5">
      {(["all", "rule", "manual"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={cn(
            "rounded px-2.5 py-1 text-xs font-medium transition-colors",
            value === m
              ? "bg-background text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {labels[m]}
        </button>
      ))}
    </div>
  )
}

function MatchModeToggle({
  value,
  onChange,
  labelAll,
  labelAny,
}: {
  value: MatchMode
  onChange: (next: MatchMode) => void
  labelAll: string
  labelAny: string
}) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange((v as MatchMode) || "all")}>
      <TabsList size="xs">
        <TabsTrigger value="all" className="text-[11px]">
          {labelAll}
        </TabsTrigger>
        <TabsTrigger value="any" className="text-[11px]">
          {labelAny}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )
}

export function AccessPolicyEditor({
  value,
  onChange,
  nodes,
  allInbounds,
}: {
  value: AccessPolicy
  onChange: (next: AccessPolicy) => void
  nodes: Node[]
  allInbounds: Inbound[]
}) {
  const { t } = useTranslation()
  const [previewOpen, setPreviewOpen] = useState(false)
  const [excludeNodesOpen, setExcludeNodesOpen] = useState(false)
  const [excludeInboundsOpen, setExcludeInboundsOpen] = useState(false)

  const patch = (partial: Partial<AccessPolicy>) => {
    onChange({ ...value, ...partial })
  }

  const regionSuggestions = useMemo(() => {
    const set = new Set<string>()
    for (const n of nodes) {
      if (n.region?.trim()) set.add(n.region.trim())
    }
    return Array.from(set)
  }, [nodes])

  const nodeTagSuggestions = useMemo(() => {
    const set = new Set<string>()
    for (const n of nodes) {
      for (const tg of n.tags ?? []) {
        if (tg.trim()) set.add(tg.trim())
      }
    }
    return Array.from(set)
  }, [nodes])

  const inboundTagSuggestions = useMemo(() => {
    const set = new Set<string>()
    for (const inb of allInbounds) {
      for (const tg of inb.tags ?? []) {
        if (tg.trim()) set.add(tg.trim())
      }
    }
    return Array.from(set)
  }, [allInbounds])

  const usedProtocols = useMemo(() => {
    const set = new Set<Protocol>()
    for (const inb of allInbounds) {
      set.add(inb.protocol)
    }
    return set
  }, [allInbounds])

  const inboundsByNode = useMemo(() => {
    const map = new Map<number, Inbound[]>()
    for (const inb of allInbounds) {
      const list = map.get(inb.node_id) ?? []
      list.push(inb)
      map.set(inb.node_id, list)
    }
    return map
  }, [allInbounds])

  const matchedNodesOnly = useMemo(
    () => nodes.filter((n) => matchNode(value, n)),
    [nodes, value]
  )

  const evaluation = useMemo(
    () => evaluateAccessPolicy(value, nodes, allInbounds),
    [value, nodes, allInbounds]
  )

  const nodeRegexError = validateRegex(value.node_name_regex ?? "")
  const inboundRegexError = validateRegex(value.inbound_name_regex ?? "")

  const nodeRuleEmpty =
    value.node_mode === "rule" &&
    !(value.node_regions?.length) &&
    !(value.node_tags?.length) &&
    !(value.node_name_regex?.trim())

  const inboundRuleEmpty =
    value.inbound_mode === "rule" &&
    !(value.inbound_protocols?.length) &&
    !(value.inbound_tags?.length) &&
    !(value.inbound_name_regex?.trim())

  const toggleID = (list: number[] | undefined, id: number, checked: boolean) => {
    const cur = list ?? []
    return checked ? Array.from(new Set([...cur, id])) : cur.filter((x) => x !== id)
  }

  const toggleProtocol = (proto: Protocol) => {
    const cur = value.inbound_protocols ?? []
    const next = cur.includes(proto) ? cur.filter((p) => p !== proto) : [...cur, proto]
    patch({ inbound_protocols: next })
  }

  const modeLabels: Record<AccessMode, string> = {
    all: t("users.form.modeAll"),
    rule: t("users.form.modeRule"),
    manual: t("users.form.modeManual"),
  }

  return (
    <div className="space-y-4">
      {/* Layer 1: Node Access Scope */}
      <div className="space-y-3 rounded-lg border border-border bg-card p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label className="text-sm font-medium text-foreground">
            {t("users.form.nodeScopeTitle")}
          </Label>
          <ModeToggle
            value={value.node_mode}
            onChange={(next) => patch({ node_mode: next })}
            labels={modeLabels}
          />
        </div>

        {value.node_mode === "rule" && (
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">{t("users.form.matchModeLabel")}</span>
              <MatchModeToggle
                value={value.node_match === "any" ? "any" : "all"}
                onChange={(next) => patch({ node_match: next })}
                labelAll={t("users.form.matchAll")}
                labelAny={t("users.form.matchAny")}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t("users.form.nodeRegions")}</Label>
              <TagInput
                value={value.node_regions ?? []}
                onChange={(next) => patch({ node_regions: next })}
                suggestions={regionSuggestions}
                placeholder={t("users.form.nodeRegionsPlaceholder")}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t("users.form.nodeTags")}</Label>
              <TagInput
                value={value.node_tags ?? []}
                onChange={(next) => patch({ node_tags: next })}
                suggestions={nodeTagSuggestions}
                placeholder={t("users.form.nodeTagsPlaceholder")}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {t("users.form.nodeNameRegex")}
              </Label>
              <Input
                value={value.node_name_regex ?? ""}
                onChange={(e) => patch({ node_name_regex: e.target.value })}
                placeholder={t("users.form.nodeNameRegexPlaceholder")}
                className={cn(
                  "h-8 font-mono text-xs",
                  nodeRegexError && "border-destructive focus-visible:ring-destructive/40"
                )}
              />
              {nodeRegexError && (
                <p className="flex items-center gap-1 text-xs text-destructive">
                  <AlertCircle className="size-3.5 shrink-0" />
                  {t("users.form.invalidRegex", { error: nodeRegexError })}
                </p>
              )}
            </div>

            {nodeRuleEmpty && (
              <p className="text-xs text-warning">{t("users.form.ruleHintEmpty")}</p>
            )}
          </div>
        )}

        {value.node_mode === "manual" && (
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-end gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => patch({ node_ids: nodes.map((n) => n.id) })}
              >
                {t("common.selectAll")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => patch({ node_ids: [] })}
              >
                {t("common.clear")}
              </Button>
            </div>
            <div className="grid max-h-44 gap-2 overflow-y-auto rounded-md border border-border p-2.5 sm:grid-cols-2">
              {nodes.length === 0 ? (
                <p className="col-span-2 py-6 text-center text-xs text-muted-foreground">
                  {t("users.form.noNodesHint")}
                </p>
              ) : (
                nodes.map((n) => {
                  const checked = Boolean(value.node_ids?.includes(n.id))
                  return (
                    <label
                      key={n.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md border border-border/70 px-2.5 py-2 text-xs hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) =>
                          patch({ node_ids: toggleID(value.node_ids, n.id, Boolean(v)) })
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-medium text-foreground">{n.name}</span>
                          {n.region && (
                            <Badge variant="secondary" className="px-1 py-0 text-[10px] font-normal">
                              {n.region}
                            </Badge>
                          )}
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {t("users.form.nodeInboundCount", {
                            host: n.host,
                            count: n.inbound_count,
                          })}
                        </div>
                      </div>
                    </label>
                  )
                })
              )}
            </div>
          </div>
        )}

        {(value.node_mode === "all" || value.node_mode === "rule") && nodes.length > 0 && (
          <div className="border-t border-border/60 pt-2">
            <button
              type="button"
              onClick={() => setExcludeNodesOpen((v) => !v)}
              className="flex w-full items-center justify-between text-xs text-muted-foreground hover:text-foreground"
            >
              <span>
                {value.exclude_node_ids?.length
                  ? t("users.form.excludeNodesHint", { count: value.exclude_node_ids.length })
                  : t("users.form.excludeNodes")}
              </span>
              {excludeNodesOpen ? (
                <ChevronUp className="size-3.5" />
              ) : (
                <ChevronDown className="size-3.5" />
              )}
            </button>
            {excludeNodesOpen && (
              <div className="mt-2 grid max-h-32 gap-1.5 overflow-y-auto rounded-md border border-border bg-muted/20 p-2 sm:grid-cols-2">
                {nodes.map((n) => {
                  const excluded = Boolean(value.exclude_node_ids?.includes(n.id))
                  return (
                    <label
                      key={n.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={excluded}
                        onCheckedChange={(v) =>
                          patch({
                            exclude_node_ids: toggleID(value.exclude_node_ids, n.id, Boolean(v)),
                          })
                        }
                      />
                      <span className="truncate text-foreground">{n.name}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Layer 2: Protocol / Inbound Scope */}
      <div className="space-y-3 rounded-lg border border-border bg-card p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label className="text-sm font-medium text-foreground">
            {t("users.form.inboundScopeTitle")}
          </Label>
          <ModeToggle
            value={value.inbound_mode}
            onChange={(next) => patch({ inbound_mode: next })}
            labels={modeLabels}
          />
        </div>

        {value.inbound_mode === "rule" && (
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">{t("users.form.matchModeLabel")}</span>
              <MatchModeToggle
                value={value.inbound_match === "any" ? "any" : "all"}
                onChange={(next) => patch({ inbound_match: next })}
                labelAll={t("users.form.matchAll")}
                labelAny={t("users.form.matchAny")}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {t("users.form.inboundProtocols")}
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {ALL_PROTOCOLS.map((proto) => {
                  const active = Boolean(value.inbound_protocols?.includes(proto))
                  const deployed = usedProtocols.has(proto)
                  return (
                    <button
                      key={proto}
                      type="button"
                      onClick={() => toggleProtocol(proto)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : deployed
                            ? "border-border bg-background text-foreground hover:bg-muted"
                            : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/60"
                      )}
                    >
                      <span>{PROTOCOL_LABELS[proto]}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t("users.form.inboundTags")}</Label>
              <TagInput
                value={value.inbound_tags ?? []}
                onChange={(next) => patch({ inbound_tags: next })}
                suggestions={inboundTagSuggestions}
                placeholder={t("users.form.inboundTagsPlaceholder")}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {t("users.form.inboundNameRegex")}
              </Label>
              <Input
                value={value.inbound_name_regex ?? ""}
                onChange={(e) => patch({ inbound_name_regex: e.target.value })}
                placeholder={t("users.form.inboundNameRegexPlaceholder")}
                className={cn(
                  "h-8 font-mono text-xs",
                  inboundRegexError && "border-destructive focus-visible:ring-destructive/40"
                )}
              />
              {inboundRegexError && (
                <p className="flex items-center gap-1 text-xs text-destructive">
                  <AlertCircle className="size-3.5 shrink-0" />
                  {t("users.form.invalidRegex", { error: inboundRegexError })}
                </p>
              )}
            </div>

            {inboundRuleEmpty && (
              <p className="text-xs text-warning">{t("users.form.ruleHintEmpty")}</p>
            )}
          </div>
        )}

        {value.inbound_mode === "manual" && (
          <div className="space-y-2 pt-1">
            {matchedNodesOnly.length === 0 ? (
              <p className="rounded-md border border-dashed border-border py-5 text-center text-xs text-muted-foreground">
                {t("users.form.manualInboundsEmpty")}
              </p>
            ) : (
              <>
                <div className="flex items-center justify-end gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => {
                      const ids = matchedNodesOnly.flatMap((n) =>
                        (inboundsByNode.get(n.id) ?? []).filter((i) => i.enabled).map((i) => i.id)
                      )
                      patch({ inbound_ids: ids })
                    }}
                  >
                    {t("common.selectAll")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => patch({ inbound_ids: [] })}
                  >
                    {t("common.clear")}
                  </Button>
                </div>
                <div className="max-h-52 space-y-2.5 overflow-y-auto rounded-md border border-border p-2.5">
                  {matchedNodesOnly.map((n) => {
                    const ins = (inboundsByNode.get(n.id) ?? []).filter((i) => i.enabled)
                    return (
                      <div key={n.id} className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                          <span>{n.name}</span>
                          {n.region && (
                            <Badge variant="secondary" className="px-1 py-0 text-[10px] font-normal">
                              {n.region}
                            </Badge>
                          )}
                        </div>
                        {ins.length === 0 ? (
                          <p className="pl-1 text-[11px] text-muted-foreground">
                            {t("users.form.noInboundsOnNode")}
                          </p>
                        ) : (
                          <div className="grid gap-1.5 sm:grid-cols-2">
                            {ins.map((inb) => {
                              const checked = Boolean(value.inbound_ids?.includes(inb.id))
                              return (
                                <label
                                  key={inb.id}
                                  className="flex cursor-pointer items-center gap-2 rounded border border-border/70 px-2 py-1.5 text-xs hover:bg-muted/50"
                                >
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={(v) =>
                                      patch({
                                        inbound_ids: toggleID(value.inbound_ids, inb.id, Boolean(v)),
                                      })
                                    }
                                  />
                                  <Badge variant="secondary" className="px-1 py-0 font-mono text-[10px]">
                                    {PROTOCOL_LABELS[inb.protocol]}
                                  </Badge>
                                  <span className="truncate text-foreground">{inb.name}</span>
                                  <span className="ml-auto font-mono text-[11px] text-muted-foreground tabular-nums">
                                    :{inb.port}
                                  </span>
                                </label>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {(value.inbound_mode === "all" || value.inbound_mode === "rule") &&
          matchedNodesOnly.length > 0 && (
            <div className="border-t border-border/60 pt-2">
              <button
                type="button"
                onClick={() => setExcludeInboundsOpen((v) => !v)}
                className="flex w-full items-center justify-between text-xs text-muted-foreground hover:text-foreground"
              >
                <span>
                  {value.exclude_inbound_ids?.length
                    ? t("users.form.excludeInboundsHint", {
                        count: value.exclude_inbound_ids.length,
                      })
                    : t("users.form.excludeInbounds")}
                </span>
                {excludeInboundsOpen ? (
                  <ChevronUp className="size-3.5" />
                ) : (
                  <ChevronDown className="size-3.5" />
                )}
              </button>
              {excludeInboundsOpen && (
                <div className="mt-2 max-h-36 space-y-2 overflow-y-auto rounded-md border border-border bg-muted/20 p-2">
                  {matchedNodesOnly.map((n) => {
                    const ins = (inboundsByNode.get(n.id) ?? []).filter((i) => i.enabled)
                    if (ins.length === 0) return null
                    return (
                      <div key={n.id} className="space-y-1">
                        <div className="text-[11px] font-medium text-muted-foreground">{n.name}</div>
                        <div className="grid gap-1 sm:grid-cols-2">
                          {ins.map((inb) => {
                            const excluded = Boolean(value.exclude_inbound_ids?.includes(inb.id))
                            return (
                              <label
                                key={inb.id}
                                className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted/50"
                              >
                                <Checkbox
                                  checked={excluded}
                                  onCheckedChange={(v) =>
                                    patch({
                                      exclude_inbound_ids: toggleID(
                                        value.exclude_inbound_ids,
                                        inb.id,
                                        Boolean(v)
                                      ),
                                    })
                                  }
                                />
                                <span className="truncate text-foreground">
                                  {inb.name} ({PROTOCOL_LABELS[inb.protocol]})
                                </span>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
      </div>

      {evaluation.hasSharedSecret && (
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>{t("users.form.sharedSecretNote")}</span>
        </div>
      )}

      {/* Live Match Preview */}
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-medium text-foreground tabular-nums">
            <ShieldCheck className="size-4 text-success" />
            <span>
              {t("users.form.previewSummary", {
                nodes: evaluation.totalNodes,
                inbounds: evaluation.totalInbounds,
              })}
            </span>
          </div>
          {evaluation.entries.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setPreviewOpen((v) => !v)}
            >
              {previewOpen ? t("users.form.previewHide") : t("users.form.previewShow")}
            </Button>
          )}
        </div>

        {previewOpen && (
          <>
            <Separator className="my-2.5" />
            {evaluation.entries.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("users.form.previewEmpty")}</p>
            ) : (
              <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                {evaluation.entries.map(({ node, inbounds }) => (
                  <div
                    key={node.id}
                    className="flex flex-wrap items-center justify-between gap-1.5 text-xs"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-foreground">{node.name}</span>
                      {node.region && (
                        <Badge variant="secondary" className="px-1 py-0 text-[10px] font-normal">
                          {node.region}
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {inbounds.length === 0 ? (
                        <span className="text-[11px] text-muted-foreground">
                          {t("users.form.noInboundsOnNode")}
                        </span>
                      ) : (
                        inbounds.map((inb) => (
                          <Badge
                            key={inb.id}
                            variant="outline"
                            className="px-1.5 py-0 font-mono text-[10px] font-normal"
                          >
                            {PROTOCOL_LABELS[inb.protocol]}:{inb.port}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
