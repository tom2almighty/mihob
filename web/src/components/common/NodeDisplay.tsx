import { useTranslation } from "react-i18next"
import { ArrowUpCircle, Loader2 } from "lucide-react"
import { TrafficProgress } from "@/components/common/CommonUI"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { daysUntil, formatDateShort } from "@/lib/format"
import type { TrafficDisplayMode } from "@/lib/trafficDisplay"
import type { Node } from "@/lib/types"
import { cn } from "@/lib/utils"

function parseSemver(raw?: string): [number, number, number] | null {
  if (!raw) return null
  const m = raw.match(/v?(\d+)\.(\d+)\.(\d+)/)
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

export function isVersionOlder(current?: string, latest?: string): boolean {
  const c = parseSemver(current)
  const l = parseSemver(latest)
  if (!c || !l) return false
  for (let i = 0; i < 3; i++) {
    if (c[i] !== l[i]) return c[i] < l[i]
  }
  return false
}

export function canUpgradeNode(n: Node): boolean {
  return (
    n.online &&
    n.upgrade_status !== "upgrading" &&
    (!n.os || n.os === "linux") &&
    (n.arch === "amd64" || n.arch === "arm64")
  )
}

export function NodeIdentity({
  node,
  showTags = false,
  maxTags = 2,
  className,
}: {
  node: Node
  showTags?: boolean
  maxTags?: number
  className?: string
}) {
  const { t } = useTranslation()
  const tags = showTags ? (node.tags ?? []) : []
  const visibleTags = tags.slice(0, maxTags)
  const hiddenTags = tags.slice(maxTags)

  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-1.5", className)}>
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          node.online ? "bg-success" : "bg-muted-foreground/40"
        )}
      />
      <span className="truncate text-sm font-medium text-foreground">{node.name}</span>
      {node.region && (
        <Badge variant="secondary" className="px-1.5 py-0 text-[11px] font-normal">
          {node.region}
        </Badge>
      )}
      {visibleTags.map((tag) => (
        <Badge
          key={tag}
          variant="outline"
          className="px-1.5 py-0 text-[11px] font-normal text-muted-foreground"
        >
          {tag}
        </Badge>
      ))}
      {hiddenTags.length > 0 && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Badge
                variant="outline"
                className="cursor-help px-1.5 py-0 text-[11px] font-normal text-muted-foreground tabular-nums"
              >
                +{hiddenTags.length}
              </Badge>
            }
          />
          <TooltipContent>{hiddenTags.join(" · ")}</TooltipContent>
        </Tooltip>
      )}
      {!node.enabled && (
        <Badge variant="outline" className="px-1.5 py-0 text-[11px] text-muted-foreground">
          {t("common.disabled")}
        </Badge>
      )}
    </div>
  )
}

export function NodeStatusCell({
  node,
  latestVersion,
  onUpgrade,
}: {
  node: Node
  latestVersion?: string
  onUpgrade?: (node: Node) => void
}) {
  const { t } = useTranslation()

  const configLabel =
    node.config_status === "error"
      ? t("nodes.configError")
      : node.config_status === "synced"
        ? t("nodes.synced")
        : t("nodes.pending")

  const detailLines: string[] = []
  if (node.agent_version) {
    detailLines.push(t("nodes.statusTooltipAgent", { version: node.agent_version }))
  }
  if (node.mihomo_version) {
    detailLines.push(t("nodes.statusTooltipCore", { version: node.mihomo_version }))
  }
  detailLines.push(t("nodes.statusTooltipConfig", { status: configLabel }))

  const versionText = node.mihomo_version
    ? node.mihomo_version
    : node.agent_version
      ? `Agent ${node.agent_version}`
      : t("nodes.waitingAgent")

  const showUpdateBtn = Boolean(
    onUpgrade &&
      latestVersion &&
      canUpgradeNode(node) &&
      isVersionOlder(node.mihomo_version, latestVersion)
  )

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge
          variant={node.online ? "secondary" : "outline"}
          className={
            node.online ? "bg-success/15 text-success hover:bg-success/20" : "text-muted-foreground"
          }
        >
          {node.online ? t("nodes.online") : t("nodes.offline")}
        </Badge>
        {node.config_status === "error" && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Badge variant="destructive" className="cursor-help text-xs">
                  {t("nodes.configError")}
                </Badge>
              }
            />
            <TooltipContent className="max-w-xs wrap-break-word">
              {node.config_error || t("nodes.configErrorFallback")}
            </TooltipContent>
          </Tooltip>
        )}
        {node.config_status !== "synced" && node.config_status !== "error" && (
          <Badge variant="outline" className="border-warning/40 text-xs text-warning">
            {t("nodes.pending")}
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums">
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                className={cn(
                  "cursor-default",
                  node.mihomo_version || node.agent_version ? "font-mono" : "font-sans text-xs"
                )}
              >
                {versionText}
              </span>
            }
          />
          <TooltipContent className="space-y-0.5 font-sans text-xs">
            {detailLines.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </TooltipContent>
        </Tooltip>

        {node.upgrade_status === "upgrading" ? (
          <Badge variant="secondary" className="gap-1 px-1.5 py-0 text-[10px] font-normal">
            <Loader2 className="size-2.5 animate-spin" />
            {t("nodes.mihomo.upgradingBadge")}
          </Badge>
        ) : node.upgrade_status === "error" ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Badge
                  variant="destructive"
                  className="cursor-help px-1.5 py-0 text-[10px] font-normal"
                >
                  {t("nodes.mihomo.upgradeFailedBadge")}
                </Badge>
              }
            />
            <TooltipContent className="max-w-xs wrap-break-word">
              {node.upgrade_error || t("nodes.mihomo.upgradeFailedFallback")}
            </TooltipContent>
          </Tooltip>
        ) : showUpdateBtn ? (
          <button
            type="button"
            onClick={() => onUpgrade?.(node)}
            className="inline-flex items-center gap-0.5 rounded-full border border-primary/35 bg-primary/10 px-1.5 py-0 text-[10px] font-medium text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowUpCircle className="size-2.5" />
            {t("nodes.mihomo.updateAvailable")}
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function NodeMetaSummary({ node }: { node: Node }) {
  const { t, i18n } = useTranslation()
  const days = daysUntil(node.expire_at)
  const expireTone =
    days !== null && days <= 0
      ? "text-destructive font-medium"
      : days !== null && days <= 14
        ? "text-warning font-medium"
        : "text-muted-foreground"

  const tooltipLines: string[] = [
    t("nodes.metaTooltipMultiplier", { value: node.traffic_multiplier }),
    t("nodes.metaTooltipReset", { day: node.reset_day }),
  ]
  if (node.billing_cycle) {
    tooltipLines.push(
      t("nodes.metaTooltipCycle", {
        cycle: t(`nodes.billingCycles.${node.billing_cycle}` as "nodes.billingCycles.monthly"),
      })
    )
  }
  if (node.expire_at) {
    tooltipLines.push(
      t("nodes.metaTooltipExpire", {
        date: formatDateShort(node.expire_at, i18n.language),
      })
    )
  }

  const content = (
    <div className="space-y-0.5 text-xs tabular-nums">
      <div className="flex items-center gap-1.5 text-foreground">
        <span>{t("nodes.inboundCountShort", { count: node.inbound_count })}</span>
        <span className="text-muted-foreground/50">·</span>
        <span
          className={cn(
            node.traffic_multiplier !== 1 ? "font-medium text-primary" : "text-muted-foreground"
          )}
        >
          {node.traffic_multiplier}x
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1 text-muted-foreground">
        <span>{t("nodes.resetDayShort", { day: node.reset_day })}</span>
        {node.expire_at && (
          <>
            <span className="opacity-50">·</span>
            <span className={expireTone}>
              {days !== null && days <= 0
                ? t("nodes.expired")
                : t("nodes.daysLeft", { days: days ?? 0 })}
            </span>
          </>
        )}
      </div>
    </div>
  )

  return (
    <Tooltip>
      <TooltipTrigger render={content} />
      <TooltipContent className="space-y-0.5 text-xs tabular-nums">
        {tooltipLines.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </TooltipContent>
    </Tooltip>
  )
}

export function NodeStatusPreviewRow({
  node,
  trafficMode,
}: {
  node: Node
  trafficMode: TrafficDisplayMode
}) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <NodeIdentity node={node} showTags={false} />
          {node.config_status === "error" && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Badge
                    variant="destructive"
                    className="shrink-0 cursor-help px-1.5 py-0 text-[10px]"
                  >
                    {t("nodes.configError")}
                  </Badge>
                }
              />
              <TooltipContent className="max-w-xs wrap-break-word">
                {node.config_error || t("nodes.configErrorFallback")}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground tabular-nums">
          {t("dashboard.nodeMeta", {
            inbounds: node.inbound_count,
            connections: node.active_connections,
          })}
        </p>
      </div>
      <div className="w-full shrink-0 sm:w-44">
        <TrafficProgress used={node.traffic_used} limit={node.traffic_limit} mode={trafficMode} />
      </div>
    </div>
  )
}
