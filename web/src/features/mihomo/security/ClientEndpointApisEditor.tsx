import { useState } from "react"
import type { UseFormReturn } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { FlaskConical, Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api } from "@/lib/api"
import type { ClientEndpointTestResult } from "@/lib/types"
import type { InboundFormValues } from "@/pages/nodes/inboundSchema"

export function ClientEndpointApisEditor({ form }: { form: UseFormReturn<InboundFormValues> }) {
  const { t } = useTranslation()
  const items = form.watch("client_endpoint_apis") ?? []
  const [testingIdx, setTestingIdx] = useState<number | null>(null)
  const [testResults, setTestResults] = useState<Record<number, ClientEndpointTestResult>>({})

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
      })
      setTestResults((prev) => ({ ...prev, [idx]: res }))
      if (res.total === 0) {
        toast.warning(t("nodes.inbound.fields.cfApiTestEmpty"))
      } else {
        toast.success(
          t("nodes.inbound.fields.cfApiTestSummary", {
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
            return (
              <div
                key={`cf-api-${idx}`}
                className="space-y-2 rounded-md border border-border bg-background/80 p-2.5"
              >
                <div className="flex items-center gap-2">
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

                {result && (
                  <div className="rounded bg-muted/50 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                    {result.total === 0 ? (
                      <span>{t("nodes.inbound.fields.cfApiTestEmpty")}</span>
                    ) : (
                      <div className="space-y-1">
                        <div className="font-medium text-foreground">
                          {t("nodes.inbound.fields.cfApiTestSummary", {
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
