import { useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Loader2,
  RefreshCw,
} from "lucide-react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatBytes } from "@/lib/format"
import type { TrafficDisplayMode } from "@/lib/trafficDisplay"
import { cn } from "@/lib/utils"

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 px-6 py-12 text-center",
        className
      )}
    >
      <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </div>
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({
  message,
  onRetry,
}: {
  message?: string
  onRetry?: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
      <AlertTriangle className="mb-2 size-6 text-destructive" />
      <p className="text-sm font-medium text-foreground">{t("common.loadFailed")}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {message || t("common.loadFailedDesc")}
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw className="mr-1.5 size-3.5" />
          {t("common.retry")}
        </Button>
      )}
    </div>
  )
}

export function CopyButton({
  value,
  label,
  size = "icon-sm",
  variant = "ghost",
}: {
  value: string
  label?: string
  size?: "icon" | "icon-sm" | "sm" | "default"
  variant?: "ghost" | "outline" | "secondary"
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const resolvedLabel = label ?? t("common.copy")

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast.success(t("common.copySuccess"))
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error(t("common.copyError"))
    }
  }

  const isIconOnly = size === "icon" || size === "icon-sm"
  const btn = (
    <Button
      type="button"
      variant={variant}
      size={size === "icon-sm" ? "icon" : size}
      className={cn(size === "icon-sm" && "size-7")}
      onClick={handleCopy}
      aria-label={resolvedLabel}
    >
      {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      {!isIconOnly && <span className="ml-1.5">{copied ? t("common.copied") : resolvedLabel}</span>}
    </Button>
  )

  if (!isIconOnly) return btn

  return (
    <Tooltip>
      <TooltipTrigger render={btn} />
      <TooltipContent>{copied ? t("common.copied") : resolvedLabel}</TooltipContent>
    </Tooltip>
  )
}

export function TrafficModeToggle({
  value,
  onChange,
  size = "sm",
  className,
}: {
  value: TrafficDisplayMode
  onChange: (next: TrafficDisplayMode) => void
  size?: "sm" | "xs"
  className?: string
}) {
  const { t } = useTranslation()

  return (
    <Tabs
      value={value}
      onValueChange={(v) => onChange((v as TrafficDisplayMode) || "used")}
      className={cn("inline-flex", className)}
    >
      <TabsList size={size === "xs" ? "xs" : "sm"} aria-label={t("common.trafficModeAria")}>
        <TabsTrigger value="used">{t("common.trafficUsed")}</TabsTrigger>
        <TabsTrigger value="remaining">{t("common.trafficRemaining")}</TabsTrigger>
      </TabsList>
    </Tabs>
  )
}

export function TrafficProgress({
  used,
  limit,
  mode = "used",
  className,
}: {
  used: number
  limit: number
  mode?: TrafficDisplayMode
  className?: string
}) {
  const { t } = useTranslation()
  const unlimited = !limit || limit <= 0
  const usedRatio = unlimited ? 0 : Math.min(100, Math.round((used / limit) * 100))
  const remaining = unlimited ? 0 : Math.max(0, limit - used)
  const remainingRatio = unlimited ? 0 : Math.max(0, 100 - usedRatio)
  const displayRatio = mode === "remaining" ? remainingRatio : usedRatio
  const barColor =
    usedRatio >= 90
      ? "bg-destructive"
      : usedRatio >= 70
        ? "bg-warning"
        : "bg-success"

  const content = (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-2 text-xs tabular-nums">
        <span className="truncate font-medium text-foreground">
          {!unlimited && mode === "remaining"
            ? t("common.trafficRemainingShort", { value: formatBytes(remaining) })
            : formatBytes(used)}
        </span>
        <span className="shrink-0 text-muted-foreground">
          {unlimited ? t("common.unlimited") : `/ ${formatBytes(limit)} (${displayRatio}%)`}
        </span>
      </div>
      {!unlimited && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all duration-200", barColor)}
            style={{ width: `${displayRatio}%` }}
          />
        </div>
      )}
    </div>
  )

  if (unlimited) return content

  return (
    <Tooltip>
      <TooltipTrigger render={content} />
      <TooltipContent className="tabular-nums">
        {t("common.trafficTooltip", {
          used: formatBytes(used),
          remaining: formatBytes(remaining),
          limit: formatBytes(limit),
        })}
      </TooltipContent>
    </Tooltip>
  )
}

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmName,
  confirmLabel,
  loading,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmName?: string
  confirmLabel?: string
  loading?: boolean
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  const [typed, setTyped] = useState("")
  const canSubmit = !confirmName || typed.trim() === confirmName

  const handleOpenChange = (next: boolean) => {
    if (!next) setTyped("")
    onOpenChange(next)
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {confirmName && (
          <div className="space-y-1.5 py-2">
            <Label htmlFor="confirm-target-name" className="text-xs text-muted-foreground">
              {t("common.confirmTypePrefix")}{" "}
              <span className="font-mono font-semibold text-foreground">{confirmName}</span>{" "}
              {t("common.confirmTypeSuffix")}
            </Label>
            <Input
              id="confirm-target-name"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={confirmName}
              autoComplete="off"
            />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{t("common.cancel")}</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={!canSubmit || loading}
            onClick={onConfirm}
          >
            {loading && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {confirmLabel ?? t("common.confirmDelete")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function TablePagination({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
}: {
  total: number
  page: number
  pageSize: number
  onPageChange: (nextPage: number) => void
  onPageSizeChange: (nextSize: number) => void
  pageSizeOptions?: number[]
}) {
  const { t } = useTranslation()
  if (total <= 0) return null

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = (safePage - 1) * pageSize + 1
  const end = Math.min(total, safePage * pageSize)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
      <div className="tabular-nums">
        {t("common.pagination.summary", { start, end, total })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span>{t("common.pagination.perPage")}</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              const num = Number(v)
              if (num > 0) {
                onPageSizeChange(num)
                onPageChange(1)
              }
            }}
          >
            <SelectTrigger size="sm" className="h-7 w-16 px-2 text-xs tabular-nums">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end" className="min-w-20">
              {pageSizeOptions.map((opt) => (
                <SelectItem key={opt} value={String(opt)} className="text-xs tabular-nums">
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  className="size-7"
                  disabled={safePage <= 1}
                  onClick={() => onPageChange(safePage - 1)}
                  aria-label={t("common.pagination.prevPage")}
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
              }
            />
            <TooltipContent>{t("common.pagination.prevPage")}</TooltipContent>
          </Tooltip>
          <span className="min-w-12 text-center font-mono text-xs text-foreground tabular-nums">
            {safePage} / {totalPages}
          </span>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  className="size-7"
                  disabled={safePage >= totalPages}
                  onClick={() => onPageChange(safePage + 1)}
                  aria-label={t("common.pagination.nextPage")}
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              }
            />
            <TooltipContent>{t("common.pagination.nextPage")}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}
