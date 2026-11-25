import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Globe2, Plus, Search, Sparkles, X } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api, queryKeys } from "@/lib/api"
import { cn } from "@/lib/utils"
import { DEFAULT_GEOX_URLS } from "../settings/GeoDataTab"
import {
  extractPolicyTargets,
  insertRuleProviders,
  insertRulesBeforeMatch,
  type RuleProviderSpec,
  upsertGeoXURLBlock,
} from "./templateYamlUtils"

type RuleInsertMode = "geosite" | "geoip" | "ruleset"
type RuleSetSourceMode = "hub" | "metacubex"

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

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]))
  }

  const toggleHubSet = (name: string) => {
    setSelectedHubSets((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]
    )
  }

  const handleInsert = () => {
    const policy = targetPolicy.trim() || "DIRECT"

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
      const rules = tags.map((tag) =>
        mode === "geoip" && noResolve
          ? `${rulePrefix},${tag},${policy},no-resolve`
          : `${rulePrefix},${tag},${policy}`
      )
      onChange(insertRulesBeforeMatch(yamlValue, rules))
      setSelectedTags([])
      setCustomTag("")
      setOpen(false)
      toast.success(t("templates.geoHelper.insertedCount", { count: rules.length }))
      return
    }

    // RULE-SET (MRS)
    const providers: RuleProviderSpec[] = []
    const rules: string[] = []

    if (rsSource === "hub") {
      const baseOrigin = (
        settingsQuery.data?.hub_public_url?.trim() || window.location.origin
      ).replace(/\/+$/, "")
      const mapByName = new Map((ruleSetsQuery.data ?? []).map((rs) => [rs.name, rs]))
      for (const name of selectedHubSets) {
        const rs = mapByName.get(name)
        if (!rs) continue
        providers.push({
          name: rs.name,
          behavior: rs.behavior,
          url: `${baseOrigin}/api/public/rules/${encodeURIComponent(rs.name)}.mrs`,
        })
        const suffix = rs.behavior === "ipcidr" && noResolve ? ",no-resolve" : ""
        rules.push(`RULE-SET,${rs.name},${policy}${suffix}`)
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
        providers.push({
          name: providerName,
          behavior,
          url: `${METACUBEX_MRS_BASE}/${mrsGeoKind}/${encodeURIComponent(tag)}.mrs`,
        })
        const suffix = behavior === "ipcidr" && noResolve ? ",no-resolve" : ""
        rules.push(`RULE-SET,${providerName},${policy}${suffix}`)
      }
    }

    if (rules.length === 0) {
      toast.warning(t("templates.geoHelper.selectAtLeastOne"))
      return
    }

    let next = insertRuleProviders(yamlValue, providers)
    next = insertRulesBeforeMatch(next, rules)
    onChange(next)
    setSelectedTags([])
    setSelectedHubSets([])
    setCustomTag("")
    setOpen(false)
    toast.success(t("templates.geoHelper.insertedRuleSetCount", { count: rules.length }))
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
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button type="button" variant="outline" size="sm" className="h-7 px-2.5 text-xs">
              <Sparkles className="mr-1.5 size-3.5" />
              {t("templates.geoHelper.insertRuleBtn")}
            </Button>
          }
        />
        <PopoverContent align="start" className="w-88 space-y-2.5 p-3">
          <div className="flex items-center justify-between gap-2">
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
              <Badge variant="outline" className="font-mono text-[10px] font-normal tabular-nums">
                {tagsQuery.data.source === "local"
                  ? t("templates.geoHelper.sourceLocal", { count: tagsQuery.data.total })
                  : t("templates.geoHelper.sourceBuiltin")}
              </Badge>
            )}
          </div>

          {mode === "ruleset" && (
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex rounded-md border border-border bg-muted/30 p-0.5">
                {(["metacubex", "hub"] as const).map((src) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => {
                      setRsSource(src)
                      setSelectedTags([])
                      setSelectedHubSets([])
                      setSearch("")
                    }}
                    className={cn(
                      "rounded-sm px-2 py-0.5 text-[11px] transition-colors",
                      rsSource === src
                        ? "bg-background font-medium text-foreground shadow-2xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {src === "metacubex"
                      ? t("templates.geoHelper.mrsOfficial")
                      : t("templates.geoHelper.mrsHub")}
                  </button>
                ))}
              </div>
              {rsSource === "metacubex" && (
                <div className="inline-flex rounded-md border border-border bg-muted/30 p-0.5">
                  {(["geosite", "geoip"] as const).map((gk) => (
                    <button
                      key={gk}
                      type="button"
                      onClick={() => {
                        setMrsGeoKind(gk)
                        setSelectedTags([])
                      }}
                      className={cn(
                        "rounded-sm px-2 py-0.5 font-mono text-[11px] transition-colors",
                        mrsGeoKind === gk
                          ? "bg-background font-medium text-foreground shadow-2xs"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {gk}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Search input */}
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("templates.geoHelper.searchPlaceholder")}
              className="h-7.5 pr-7 pl-8 text-xs"
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

          {/* Selectable tag / ruleset list */}
          <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-md border border-border/70 p-1">
            {mode === "ruleset" && rsSource === "hub" ? (
              hubRuleSets.length === 0 ? (
                <div className="py-5 text-center text-xs text-muted-foreground">
                  {t("templates.geoHelper.noHubRuleSets")}
                </div>
              ) : (
                hubRuleSets.map((rs) => {
                  const checked = selectedHubSets.includes(rs.name)
                  return (
                    <label
                      key={rs.id}
                      className="flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1 text-xs hover:bg-muted/60"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <Checkbox checked={checked} onCheckedChange={() => toggleHubSet(rs.name)} />
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
              <div className="py-5 text-center text-xs text-muted-foreground">
                {t("dashboard.trend.noMatchOptions")}
              </div>
            ) : (
              (tagsQuery.data?.tags ?? []).map((item) => {
                const checked = selectedTags.includes(item.tag)
                return (
                  <label
                    key={item.tag}
                    className="flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1 text-xs hover:bg-muted/60"
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

          {/* Custom tag input (for geosite/geoip/official MRS) */}
          {(mode !== "ruleset" || rsSource === "metacubex") && (
            <Input
              value={customTag}
              onChange={(e) => setCustomTag(e.target.value)}
              placeholder={t("templates.geoHelper.customTagPlaceholder")}
              className="h-7.5 font-mono text-xs"
            />
          )}

          {/* Target policy & no-resolve */}
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">
                {t("templates.geoHelper.targetPolicy")}
              </Label>
              <Select value={targetPolicy} onValueChange={(v) => setTargetPolicy(v ?? "DIRECT")}>
                <SelectTrigger className="h-7.5 w-full text-xs">
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
            {(mode === "geoip" || mode === "ruleset") && (
              <div className="flex items-end justify-between rounded-md border border-border/70 px-2.5 py-1.5">
                <Label className="font-mono text-[11px] text-muted-foreground">no-resolve</Label>
                <Switch size="sm" checked={noResolve} onCheckedChange={setNoResolve} />
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button type="button" size="sm" className="h-7.5 text-xs" onClick={handleInsert}>
              <Plus className="mr-1 size-3.5" />
              {t("templates.geoHelper.applyInsertBtn")}
            </Button>
          </div>
        </PopoverContent>
      </Popover>

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
    </div>
  )
}
