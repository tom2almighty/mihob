import { useState } from "react"
import type { UseFormReturn } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Filter, FlaskConical, Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api } from "@/lib/api"
import type { ClientEndpointTestResult } from "@/lib/types"
import { cn } from "@/lib/utils"
import type { InboundFormValues } from "@/pages/nodes/inboundSchema"

export function ClientEndpointApisEditor({ form }: { form: UseFormReturn<InboundFormValues> }) {
  const { t } = useTranslation()
  const items = form.watch("client_endpoint_apis") ?? []
  const [testingIdx, setTestingIdx] = useState<number | null>(null)
  const [testResults, setTestResults] = useState<Record<number, ClientEndpointTestResult>>({})
  const [expandedFilters, setExpandedFilters] = useState<Record<number, boolean>>({})

  const updateItems = (next: NonNullable<InboundFormValues["client_endpoint_apis"]>) => {
    form.setValue("client_endpoint_apis", next, { shouldDirty: true })
  }

  const addItem = () => {
    updateItems([
      ...items,
      {
        url: "",
        name: "",
        count: 5,
        port: 0,
        match_mode: "keyword",
        include_filter: "",
        exclude_filter: "",
        enabled: true,
      },
    ])
  }

  const patchItem = (
    idx: number,
    patch: Partial<NonNullable<InboundFormValues["client_endpoint_apis"]>[number]>
  ) => {
    const next = items.map((item, i) => (i === idx ? { ...item, ...patch } : item))
    updateItems(next)
  }

  const removeItem = (idx: number) => {
    updateItems(items.filter((_, i) => i !== idx))
    setTestResults((prev) => {
      const next: Record<number, ClientEndpointTestResult> = {}
      for (const [k, v] of Object.entries(prev)) {
        const num = Number(k)
        if (num < idx) next[num] = v
        else if (num > idx) next[num - 1] = v
      }
      return next
    })
    setExpandedFilters((prev) => {
      const next: Record<number, boolean> = {}
      for (const [k, v] of Object.entries(prev)) {
        const num = Number(k)
        if (num < idx) next[num] = v
        else if (num > idx) next[num - 1] = v
      }
      return next
    })
  }

  const handleTest = async (idx: number) => {
    const item = items[idx]
    if (!item?.url.trim()) {
      toast.error(t("nodes.inbound.fields.cfApiUrlRequired"))
      return
    }
    setTestingIdx(idx)
    try {
      const res = await api.testClientEndpointAPI({
        url: item.url.trim(),
        name: (item.name || "").trim(),
        count: item.count || 0,
        port: item.port || form.getValues("client_port") || 443,
        match_mode: item.match_mode || "keyword",
        include_filter: (item.include_filter || "").trim(),
        exclude_filter: (item.exclude_filter || "").trim(),
      })
      setTestResults((prev) => ({ ...prev, [idx]: res }))
      if (res.total === 0) {
        toast.warning(t("nodes.inbound.fields.cfApiTestEmpty"))
      } else if (res.matched === 0) {
        toast.warning(t("nodes.inbound.fields.cfApiTestFilterEmpty", { total: res.total }))
      } else {
        toast.success(
          res.matched < res.total
            ? t("nodes.inbound.fields.cfApiTestSummaryFiltered", {
                total: res.total,
                matched: res.matched,
                applied: res.applied,
              })
            : t("nodes.inbound.fields.cfApiTestSummary", {
                total: res.total,
                applied: res.applied,
              })
        )
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.loadFailed"))
    } finally {
      setTestingIdx(null)
    }
  }

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground">
          {t("nodes.inbound.fields.cfApiTitle")}
        </span>
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addItem}>
          <Plus className="mr-1 size-3.5" />
          {t("nodes.inbound.fields.cfApiAdd")}
        </Button>
      </div>

      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item, idx) => {
            const result = testResults[idx]
            const hasFilter = Boolean(item.include_filter?.trim() || item.exclude_filter?.trim())
            const filterOpen = expandedFilters[idx] ?? hasFilter
            const matchMode = item.match_mode === "regex" ? "regex" : "keyword"
            return (
              <div
                key={`cf-api-${idx}`}
                className="space-y-2 rounded-md border border-border bg-background/80 p-2.5"
              >
                <div className="flex items-center gap-1.5">
                  <Switch
                    size="sm"
                    checked={item.enabled}
                    onCheckedChange={(checked) => patchItem(idx, { enabled: checked })}
                    aria-label={t("nodes.inbound.fields.cfApiToggleAria")}
                  />
                  <Input
                    value={item.url}
                    onChange={(e) => patchItem(idx, { url: e.target.value })}
                    placeholder={t("nodes.inbound.fields.cfApiUrlPlaceholder")}
                    className="h-8 flex-1 bg-background font-mono text-xs"
                  />
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant={filterOpen || hasFilter ? "secondary" : "outline"}
                          size="icon"
                          className={cn("relative size-8 shrink-0", hasFilter && "text-primary")}
                          aria-label={t("nodes.inbound.fields.cfApiFilterToggleAria")}
                          onClick={() =>
                            setExpandedFilters((prev) => ({ ...prev, [idx]: !filterOpen }))
                          }
                        >
                          <Filter className="size-3.5" />
                          {hasFilter && (
                            <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary" />
                          )}
                        </Button>
                      }
                    />
                    <TooltipContent>{t("nodes.inbound.fields.cfApiFilterTooltip")}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-8 shrink-0"
                          disabled={testingIdx === idx}
                          aria-label={t("nodes.inbound.fields.cfApiTestAria")}
                          onClick={() => void handleTest(idx)}
                        >
                          {testingIdx === idx ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <FlaskConical className="size-3.5" />
                          )}
                        </Button>
                      }
                    />
                    <TooltipContent>{t("nodes.inbound.fields.cfApiTestTooltip")}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          aria-label={t("nodes.inbound.fields.cfApiRemoveAria")}
                          onClick={() => removeItem(idx)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      }
                    />
                    <TooltipContent>{t("nodes.inbound.fields.cfApiRemoveAria")}</TooltipContent>
                  </Tooltip>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">
                      {t("nodes.inbound.fields.cfApiCount")}
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      max={50}
                      value={item.count ?? ""}
                      onChange={(e) =>
                        patchItem(idx, {
                          count: e.target.value ? Number(e.target.value) : 0,
                        })
                      }
                      placeholder="5"
                      className="h-7.5 bg-background font-mono text-xs tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">
                      {t("nodes.inbound.fields.cfApiPrefix")}
                    </Label>
                    <Input
                      value={item.name ?? ""}
                      onChange={(e) => patchItem(idx, { name: e.target.value })}
                      placeholder={t("nodes.inbound.fields.cfApiPrefixPlaceholder")}
                      className="h-7.5 bg-background text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">
                      {t("nodes.inbound.fields.cfApiDefaultPort")}
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      max={65535}
                      value={item.port || ""}
                      onChange={(e) =>
                        patchItem(idx, {
                          port: e.target.value ? Number(e.target.value) : 0,
                        })
                      }
                      placeholder={String(form.watch("client_port") || 443)}
                      className="h-7.5 bg-background font-mono text-xs tabular-nums"
                    />
                  </div>
                </div>

                {filterOpen && (
                  <div className="space-y-2 rounded-md border border-border/70 bg-muted/25 p-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-muted-foreground">
                        {t("nodes.inbound.fields.cfApiFilterTitle")}
                      </span>
                      <div className="inline-flex rounded-md border border-border bg-background p-0.5">
                        {(["keyword", "regex"] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => patchItem(idx, { match_mode: m })}
                            className={cn(
                              "rounded-sm px-2 py-0.5 text-[11px] transition-colors",
                              matchMode === m
                                ? "bg-secondary font-medium text-secondary-foreground"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            {m === "keyword"
                              ? t("nodes.inbound.fields.cfApiModeKeyword")
                              : t("nodes.inbound.fields.cfApiModeRegex")}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">
                          {t("nodes.inbound.fields.cfApiInclude")}
                        </Label>
                        <Input
                          value={item.include_filter ?? ""}
                          onChange={(e) => patchItem(idx, { include_filter: e.target.value })}
                          placeholder={
                            matchMode === "regex"
                              ? t("nodes.inbound.fields.cfApiIncludeRegexPlaceholder")
                              : t("nodes.inbound.fields.cfApiIncludePlaceholder")
                          }
                          className="h-7.5 bg-background font-mono text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">
                          {t("nodes.inbound.fields.cfApiExclude")}
                        </Label>
                        <Input
                          value={item.exclude_filter ?? ""}
                          onChange={(e) => patchItem(idx, { exclude_filter: e.target.value })}
                          placeholder={
                            matchMode === "regex"
                              ? t("nodes.inbound.fields.cfApiExcludeRegexPlaceholder")
                              : t("nodes.inbound.fields.cfApiExcludePlaceholder")
                          }
                          className="h-7.5 bg-background font-mono text-xs"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {result && (
                  <div className="rounded bg-muted/50 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                    {result.total === 0 ? (
                      <span>{t("nodes.inbound.fields.cfApiTestEmpty")}</span>
                    ) : result.matched === 0 ? (
                      <span>
                        {t("nodes.inbound.fields.cfApiTestFilterEmpty", { total: result.total })}
                      </span>
                    ) : (
                      <div className="space-y-1">
                        <div className="font-medium text-foreground">
                          {result.matched < result.total
                            ? t("nodes.inbound.fields.cfApiTestSummaryFiltered", {
                                total: result.total,
                                matched: result.matched,
                                applied: result.applied,
                              })
                            : t("nodes.inbound.fields.cfApiTestSummary", {
                                total: result.total,
                                applied: result.applied,
                              })}
                        </div>
                        <div className="truncate font-mono text-[11px]">
                          {result.endpoints
                            .slice(0, 4)
                            .map((ep) =>
                              ep.label
                                ? `${ep.host}:${ep.port}#${ep.label}`
                                : `${ep.host}:${ep.port}`
                            )
                            .join(" , ")}
                          {result.endpoints.length > 4 ? " ..." : ""}
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
  )
}
