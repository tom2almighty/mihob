import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Globe2, GripVertical, ListPlus, Plus, Search, Sparkles, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api, queryKeys } from "@/lib/api"
import { useDragReorder } from "@/lib/useDragReorder"
import { cn } from "@/lib/utils"
import { DEFAULT_GEOX_URLS } from "../settings/GeoDataTab"
import {
  extractPolicyTargets,
  insertRuleProviders,
  insertRulesAtPosition,
  type RuleInsertPosition,
  type RuleProviderSpec,
  upsertGeoXURLBlock,
} from "./templateYamlUtils"

type RuleInsertMode = "geosite" | "geoip" | "ruleset"
type RuleSetSourceMode = "hub" | "metacubex"

interface StagedRuleItem {
  id: number
  rule: string
  provider?: RuleProviderSpec
}

const METACUBEX_MRS_BASE = "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo"

export function TemplateRuleHelper({
  yamlValue,
  isServer,
  onChange,
}: {
  yamlValue: string
  isServer: boolean
  onChange: (nextYaml: string) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<RuleInsertMode>("geosite")
  const [rsSource, setRsSource] = useState<RuleSetSourceMode>("metacubex")
  const [mrsGeoKind, setMrsGeoKind] = useState<"geosite" | "geoip">("geosite")
  const [search, setSearch] = useState("")
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedHubSets, setSelectedHubSets] = useState<string[]>([])
  const [customTag, setCustomTag] = useState("")
  const [targetPolicy, setTargetPolicy] = useState("")
  const [noResolve, setNoResolve] = useState(false)
  const [insertPos, setInsertPos] = useState<RuleInsertPosition>("before-match")
  const [staged, setStaged] = useState<StagedRuleItem[]>([])
  const nextIdRef = useRef(1)

  const policyTargets = useMemo(
    () => extractPolicyTargets(yamlValue, isServer),
    [yamlValue, isServer]
  )

  useEffect(() => {
    if (!targetPolicy || !policyTargets.includes(targetPolicy)) {
      setTargetPolicy(policyTargets[0] || "DIRECT")
    }
  }, [policyTargets, targetPolicy])

  useEffect(() => {
    setNoResolve(
      mode === "geoip" || (mode === "ruleset" && rsSource === "metacubex" && mrsGeoKind === "geoip")
    )
  }, [mode, rsSource, mrsGeoKind])

  const activeGeoKind: "geosite" | "geoip" =
    mode === "geoip" || (mode === "ruleset" && mrsGeoKind === "geoip") ? "geoip" : "geosite"

  const settingsQuery = useQuery({
    queryKey: queryKeys.settings,
    queryFn: api.getSettings,
    staleTime: 30_000,
  })

  const tagsQuery = useQuery({
    queryKey: queryKeys.geodataTags(activeGeoKind, search),
    queryFn: () => api.searchGeoDataTags(activeGeoKind, search, 80),
    enabled: open && (mode !== "ruleset" || rsSource === "metacubex"),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  const ruleSetsQuery = useQuery({
    queryKey: queryKeys.ruleSets,
    queryFn: api.listRuleSets,
    enabled: open && mode === "ruleset" && rsSource === "hub",
    staleTime: 15_000,
  })

  const { draggingId, overId, getRowDragProps } = useDragReorder({
    items: staged,
    enabled: staged.length > 1,
    onReorder: (nextItems) => setStaged(nextItems),
  })

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]))
  }

  const toggleHubSet = (name: string) => {
    setSelectedHubSets((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]
    )
  }

  const pendingPickCount =
    mode === "ruleset" && rsSource === "hub"
      ? selectedHubSets.length
      : selectedTags.length + (customTag.trim() && !selectedTags.includes(customTag.trim()) ? 1 : 0)

  const handleAddToQueue = () => {
    const policy = targetPolicy.trim() || "DIRECT"
    const additions: StagedRuleItem[] = []

    if (mode === "geosite" || mode === "geoip") {
      const tags = [...selectedTags]
      if (customTag.trim() && !tags.includes(customTag.trim())) {
        tags.push(customTag.trim())
      }
      if (tags.length === 0) {
        toast.warning(t("templates.geoHelper.selectAtLeastOne"))
        return
      }
      const rulePrefix = mode === "geosite" ? "GEOSITE" : "GEOIP"
      for (const tag of tags) {
        const rule =
          mode === "geoip" && noResolve
            ? `${rulePrefix},${tag},${policy},no-resolve`
            : `${rulePrefix},${tag},${policy}`
        additions.push({ id: nextIdRef.current++, rule })
      }
    } else if (rsSource === "hub") {
      const baseOrigin = (
        settingsQuery.data?.hub_public_url?.trim() || window.location.origin
      ).replace(/\/+$/, "")
      const mapByName = new Map((ruleSetsQuery.data ?? []).map((rs) => [rs.name, rs]))
      for (const name of selectedHubSets) {
        const rs = mapByName.get(name)
        if (!rs) continue
        const suffix = rs.behavior === "ipcidr" && noResolve ? ",no-resolve" : ""
        additions.push({
          id: nextIdRef.current++,
          rule: `RULE-SET,${rs.name},${policy}${suffix}`,
          provider: {
            name: rs.name,
            behavior: rs.behavior,
            url: `${baseOrigin}/api/public/rules/${encodeURIComponent(rs.name)}.mrs`,
          },
        })
      }
    } else {
      const tags = [...selectedTags]
      if (customTag.trim() && !tags.includes(customTag.trim())) {
        tags.push(customTag.trim())
      }
      for (const rawTag of tags) {
        const tag = rawTag.toLowerCase()
        const providerName = `${mrsGeoKind}-${tag.replace(/[^a-zA-Z0-9._-]/g, "-")}`
        const behavior: "domain" | "ipcidr" = mrsGeoKind === "geoip" ? "ipcidr" : "domain"
        const suffix = behavior === "ipcidr" && noResolve ? ",no-resolve" : ""
        additions.push({
          id: nextIdRef.current++,
          rule: `RULE-SET,${providerName},${policy}${suffix}`,
          provider: {
            name: providerName,
            behavior,
            url: `${METACUBEX_MRS_BASE}/${mrsGeoKind}/${encodeURIComponent(tag)}.mrs`,
          },
        })
      }
    }

    if (additions.length === 0) {
      toast.warning(t("templates.geoHelper.selectAtLeastOne"))
      return
    }

    setStaged((prev) => {
      const existing = new Set(prev.map((item) => item.rule))
      const unique = additions.filter((item) => !existing.has(item.rule))
      return [...prev, ...unique]
    })
    setSelectedTags([])
    setSelectedHubSets([])
    setCustomTag("")
  }

  const handleCommitQueue = () => {
    if (staged.length === 0) {
      toast.warning(t("templates.geoHelper.queueEmptyWarn"))
      return
    }
    const providers = staged
      .map((item) => item.provider)
      .filter((p): p is RuleProviderSpec => Boolean(p))
    let next = yamlValue
    if (providers.length > 0) {
      next = insertRuleProviders(next, providers)
    }
    next = insertRulesAtPosition(
      next,
      staged.map((item) => item.rule),
      insertPos
    )
    onChange(next)
    const count = staged.length
    setStaged([])
    setOpen(false)
    toast.success(
      providers.length > 0
        ? t("templates.geoHelper.insertedRuleSetCount", { count })
        : t("templates.geoHelper.insertedCount", { count })
    )
  }

  const handleInsertGeoX = () => {
    const geox = settingsQuery.data?.geox_url ?? DEFAULT_GEOX_URLS
    onChange(upsertGeoXURLBlock(yamlValue, geox))
    toast.success(t("templates.geoHelper.geoxInserted"))
  }

  const hubRuleSets = useMemo(() => {
    const list = (ruleSetsQuery.data ?? []).filter((rs) =>
      Boolean(rs.compiled_at && !rs.last_error)
    )
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (rs) => rs.name.toLowerCase().includes(q) || rs.description.toLowerCase().includes(q)
    )
  }, [ruleSetsQuery.data, search])

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 px-2.5 text-xs"
        onClick={() => setOpen(true)}
      >
        <Sparkles className="mr-1.5 size-3.5" />
        {t("templates.geoHelper.insertRuleBtn")}
      </Button>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 px-2.5 text-xs"
        onClick={handleInsertGeoX}
      >
        <Globe2 className="mr-1.5 size-3.5" />
        {t("templates.geoHelper.insertGeoxBtn")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[min(640px,88vh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="shrink-0 border-b border-border px-6 pt-5 pr-16 pb-3.5">
            <DialogTitle>{t("templates.geoHelper.dialogTitle")}</DialogTitle>
            <DialogDescription>{t("templates.geoHelper.dialogDesc")}</DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 divide-y divide-border overflow-hidden sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            {/* Left Pane: Rule Source Picker */}
            <div className="flex min-h-0 flex-col gap-2.5 overflow-y-auto p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Tabs
                  value={mode}
                  onValueChange={(v) => {
                    setMode((v as RuleInsertMode) || "geosite")
                    setSelectedTags([])
                    setSelectedHubSets([])
                    setSearch("")
                  }}
                >
                  <TabsList size="xs">
                    <TabsTrigger value="geosite">GEOSITE</TabsTrigger>
                    <TabsTrigger value="geoip">GEOIP</TabsTrigger>
                    <TabsTrigger value="ruleset">RULE-SET</TabsTrigger>
                  </TabsList>
                </Tabs>

                {(mode !== "ruleset" || rsSource === "metacubex") && tagsQuery.data && (
                  <Badge
                    variant="outline"
                    className="font-mono text-[10px] font-normal tabular-nums"
                  >
                    {tagsQuery.data.source === "local"
                      ? t("templates.geoHelper.sourceLocal", { count: tagsQuery.data.total })
                      : t("templates.geoHelper.sourceBuiltin")}
                  </Badge>
                )}
              </div>

              {mode === "ruleset" && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Tabs
                    value={rsSource}
                    onValueChange={(v) => {
                      setRsSource((v as RuleSetSourceMode) || "metacubex")
                      setSelectedTags([])
                      setSelectedHubSets([])
                      setSearch("")
                    }}
                  >
                    <TabsList size="xs">
                      <TabsTrigger value="metacubex">
                        {t("templates.geoHelper.mrsOfficial")}
                      </TabsTrigger>
                      <TabsTrigger value="hub">{t("templates.geoHelper.mrsHub")}</TabsTrigger>
                    </TabsList>
                  </Tabs>

                  {rsSource === "metacubex" && (
                    <Tabs
                      value={mrsGeoKind}
                      onValueChange={(v) => {
                        setMrsGeoKind((v as "geosite" | "geoip") || "geosite")
                        setSelectedTags([])
                      }}
                    >
                      <TabsList size="xs">
                        <TabsTrigger value="geosite" className="font-mono">
                          geosite
                        </TabsTrigger>
                        <TabsTrigger value="geoip" className="font-mono">
                          geoip
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  )}
                </div>
              )}

              {/* Search */}
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("templates.geoHelper.searchPlaceholder")}
                  className="h-8 pr-7 pl-8 text-xs"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label={t("common.clearSearch")}
                    className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>

              {/* Tag / RuleSet Checklist */}
              <div className="min-h-40 flex-1 space-y-0.5 overflow-y-auto rounded-md border border-border/80 bg-background p-1">
                {mode === "ruleset" && rsSource === "hub" ? (
                  hubRuleSets.length === 0 ? (
                    <div className="py-8 text-center text-xs text-muted-foreground">
                      {t("templates.geoHelper.noHubRuleSets")}
                    </div>
                  ) : (
                    hubRuleSets.map((rs) => {
                      const checked = selectedHubSets.includes(rs.name)
                      return (
                        <label
                          key={rs.id}
                          className="flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted/60"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleHubSet(rs.name)}
                            />
                            <span className="truncate font-mono text-foreground">{rs.name}</span>
                          </div>
                          <Badge variant="outline" className="font-mono text-[10px] font-normal">
                            {rs.behavior}
                          </Badge>
                        </label>
                      )
                    })
                  )
                ) : (tagsQuery.data?.tags ?? []).length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    {t("dashboard.trend.noMatchOptions")}
                  </div>
                ) : (
                  (tagsQuery.data?.tags ?? []).map((item) => {
                    const checked = selectedTags.includes(item.tag)
                    return (
                      <label
                        key={item.tag}
                        className="flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted/60"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <Checkbox checked={checked} onCheckedChange={() => toggleTag(item.tag)} />
                          <span className="truncate font-mono text-foreground">{item.tag}</span>
                        </div>
                        {item.count > 0 && (
                          <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
                            {item.count}
                          </span>
                        )}
                      </label>
                    )
                  })
                )}
              </div>

              {(mode !== "ruleset" || rsSource === "metacubex") && (
                <Input
                  value={customTag}
                  onChange={(e) => setCustomTag(e.target.value)}
                  placeholder={t("templates.geoHelper.customTagPlaceholder")}
                  className="h-8 font-mono text-xs"
                />
              )}

              {/* Unified-height Policy & no-resolve controls */}
              <div className="space-y-2 border-t border-border/70 pt-2.5">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      {t("templates.geoHelper.targetPolicy")}
                    </Label>
                    <Select
                      value={targetPolicy}
                      onValueChange={(v) => setTargetPolicy(v ?? "DIRECT")}
                    >
                      <SelectTrigger className="h-8 w-full text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {policyTargets.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {mode === "geoip" || mode === "ruleset" ? (
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        {t("templates.geoHelper.optionLabel")}
                      </Label>
                      <div className="flex h-8 items-center justify-between rounded-md border border-input bg-background px-2.5">
                        <span className="font-mono text-xs text-foreground">no-resolve</span>
                        <Switch size="sm" checked={noResolve} onCheckedChange={setNoResolve} />
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-8 w-full text-xs"
                        disabled={pendingPickCount === 0}
                        onClick={handleAddToQueue}
                      >
                        <ListPlus className="mr-1.5 size-3.5" />
                        {pendingPickCount > 0
                          ? t("templates.geoHelper.addToQueueCount", { count: pendingPickCount })
                          : t("templates.geoHelper.addToQueue")}
                      </Button>
                    </div>
                  )}
                </div>

                {(mode === "geoip" || mode === "ruleset") && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 w-full text-xs"
                    disabled={pendingPickCount === 0}
                    onClick={handleAddToQueue}
                  >
                    <ListPlus className="mr-1.5 size-3.5" />
                    {pendingPickCount > 0
                      ? t("templates.geoHelper.addToQueueCount", { count: pendingPickCount })
                      : t("templates.geoHelper.addToQueue")}
                  </Button>
                )}
              </div>
            </div>

            {/* Right Pane: Drag-Reorderable Staged Rules Queue */}
            <div className="flex min-h-0 flex-col gap-2.5 bg-muted/15 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-foreground">
                    {t("templates.geoHelper.queueTitle")}
                  </span>
                  <Badge variant="secondary" className="font-mono text-[11px] tabular-nums">
                    {staged.length}
                  </Badge>
                </div>
                {staged.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-destructive"
                    onClick={() => setStaged([])}
                  >
                    <Trash2 className="mr-1 size-3" />
                    {t("common.clear")}
                  </Button>
                )}
              </div>

              <div className="min-h-40 flex-1 space-y-1 overflow-y-auto rounded-md border border-border/80 bg-background p-1.5">
                {staged.length === 0 ? (
                  <div className="flex h-full min-h-36 flex-col items-center justify-center px-4 text-center text-xs text-muted-foreground">
                    <ListPlus className="mb-1.5 size-4 opacity-50" />
                    <span>{t("templates.geoHelper.queueEmpty")}</span>
                  </div>
                ) : (
                  staged.map((item) => (
                    <div
                      key={item.id}
                      {...getRowDragProps(item.id)}
                      className={cn(
                        "flex items-center justify-between gap-1.5 rounded-md border border-border/70 bg-card px-2 py-1.5 text-xs transition-colors",
                        draggingId === item.id && "opacity-40",
                        overId === item.id &&
                          draggingId !== item.id &&
                          "bg-accent/50 ring-1 ring-inset ring-primary/40"
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span
                          role="img"
                          aria-label={t("common.dragToReorder")}
                          className={cn(
                            "shrink-0 text-muted-foreground/60",
                            staged.length > 1
                              ? "cursor-grab hover:text-foreground active:cursor-grabbing"
                              : "opacity-30"
                          )}
                        >
                          <GripVertical className="size-3.5" />
                        </span>
                        <code className="truncate font-mono text-[11px] text-foreground">
                          {item.rule}
                        </code>
                        {item.provider && (
                          <Badge
                            variant="outline"
                            className="shrink-0 px-1 py-0 font-mono text-[10px] font-normal"
                          >
                            MRS
                          </Badge>
                        )}
                      </div>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                              aria-label={t("templates.geoHelper.removeQueueItemAria")}
                              onClick={() =>
                                setStaged((prev) => prev.filter((x) => x.id !== item.id))
                              }
                            >
                              <X className="size-3" />
                            </Button>
                          }
                        />
                        <TooltipContent>{t("common.delete")}</TooltipContent>
                      </Tooltip>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-1 border-t border-border/70 pt-2.5">
                <Label className="text-xs text-muted-foreground">
                  {t("templates.geoHelper.insertPositionLabel")}
                </Label>
                <Select
                  value={insertPos}
                  onValueChange={(v) => setInsertPos((v as RuleInsertPosition) || "before-match")}
                >
                  <SelectTrigger className="h-8 w-full bg-background text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="before-match">
                      {t("templates.geoHelper.posBeforeMatch")}
                    </SelectItem>
                    <SelectItem value="top">{t("templates.geoHelper.posTop")}</SelectItem>
                    <SelectItem value="bottom">{t("templates.geoHelper.posBottom")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t border-border px-6 py-3.5">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={staged.length === 0}
              onClick={handleCommitQueue}
            >
              <Plus className="mr-1.5 size-3.5" />
              {t("templates.geoHelper.commitQueueBtn", { count: staged.length })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
