import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
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
import { Textarea } from "@/components/ui/textarea"
import type { NodeOutboundRouting, OutboundRouteMode } from "@/lib/types"
import { RULE_PRESET_KEYS } from "./outboundDefaults"

export function OutboundRoutingSection({
  routing,
  enabledOutboundNames,
  onUpdateRouting,
}: {
  routing: NodeOutboundRouting
  enabledOutboundNames: string[]
  onUpdateRouting: (patch: Partial<NodeOutboundRouting>) => void
}) {
  const { t } = useTranslation()
  const routeMode: OutboundRouteMode = routing.mode || "none"

  const serializedDomains = (routing.custom_domains ?? []).join("\n")
  const [domainsText, setDomainsText] = useState(serializedDomains)
  const lastCommittedRef = useRef(serializedDomains)

  useEffect(() => {
    if (serializedDomains !== lastCommittedRef.current) {
      lastCommittedRef.current = serializedDomains
      setDomainsText(serializedDomains)
    }
  }, [serializedDomains])

  const togglePreset = (preset: string) => {
    const cur = routing.rule_presets ?? []
    const next = cur.includes(preset) ? cur.filter((p) => p !== preset) : [...cur, preset]
    onUpdateRouting({ rule_presets: next })
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3.5">
      <div className="text-sm font-medium">{t("nodes.form.outbound.routingTitle")}</div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">{t("nodes.form.outbound.routeMode")}</Label>
          <Select
            value={routeMode}
            onValueChange={(v) => {
              const nextMode = (v ?? "none") as OutboundRouteMode
              const nextTarget =
                nextMode !== "none" && !routing.target
                  ? enabledOutboundNames[0] || ""
                  : routing.target || ""
              onUpdateRouting({ mode: nextMode, target: nextTarget })
            }}
          >
            <SelectTrigger className="h-8 w-full bg-background text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("nodes.form.outbound.routeModeNone")}</SelectItem>
              <SelectItem value="split">{t("nodes.form.outbound.routeModeSplit")}</SelectItem>
              <SelectItem value="global">{t("nodes.form.outbound.routeModeGlobal")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {routeMode !== "none" && (
          <div className="space-y-1">
            <Label className="text-xs">{t("nodes.form.outbound.routeTarget")}</Label>
            {enabledOutboundNames.length > 0 ? (
              <Select
                value={routing.target || ""}
                onValueChange={(v) => onUpdateRouting({ target: v ?? "" })}
              >
                <SelectTrigger className="h-8 w-full bg-background font-mono text-xs">
                  <SelectValue placeholder={t("nodes.form.outbound.routeTargetPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {enabledOutboundNames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={routing.target || ""}
                onChange={(e) => onUpdateRouting({ target: e.target.value })}
                placeholder={t("nodes.form.outbound.routeTargetPlaceholder")}
                className="h-8 bg-background font-mono text-xs"
              />
            )}
          </div>
        )}
      </div>

      {routeMode === "split" && (
        <div className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("nodes.form.outbound.rulePresets")}</Label>
            <div className="flex flex-wrap gap-1.5">
              {RULE_PRESET_KEYS.map((preset) => {
                const active = (routing.rule_presets ?? []).includes(preset)
                return (
                  <Button
                    key={preset}
                    type="button"
                    size="sm"
                    variant={active ? "default" : "outline"}
                    className="h-7 px-2.5 text-xs"
                    onClick={() => togglePreset(preset)}
                  >
                    {t(`nodes.form.outbound.presets.${preset}`)}
                  </Button>
                )
              })}
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">{t("nodes.form.outbound.customDomains")}</Label>
            <Textarea
              value={domainsText}
              onChange={(e) => {
                const raw = e.target.value
                setDomainsText(raw)
                const parsed = raw
                  .split(/\r?\n/)
                  .map((s) => s.trim())
                  .filter(Boolean)
                lastCommittedRef.current = parsed.join("\n")
                onUpdateRouting({ custom_domains: parsed })
              }}
              placeholder={t("nodes.form.outbound.customDomainsPlaceholder")}
              className="min-h-20 bg-background font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              {t("nodes.form.outbound.customDomainsDesc")}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
