import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileArchive,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import {
  ConfirmDeleteDialog,
  CopyButton,
  EmptyState,
  ErrorState,
} from "@/components/common/CommonUI"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api, queryKeys } from "@/lib/api"
import { formatBytes } from "@/lib/format"
import type { RuleSet } from "@/lib/types"

export function RuleSetsTab({ onEdit }: { onEdit: (rs: RuleSet) => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [deleting, setDeleting] = useState<RuleSet | null>(null)
  const [compilingId, setCompilingId] = useState<number | null>(null)

  const query = useQuery({
    queryKey: queryKeys.ruleSets,
    queryFn: api.listRuleSets,
  })

  const settingsQuery = useQuery({
    queryKey: queryKeys.settings,
    queryFn: api.getSettings,
  })

  const compileMutation = useMutation({
    mutationFn: async (id: number) => {
      setCompilingId(id)
      return api.compileRuleSet(id)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.ruleSets })
      toast.success(t("templates.rulesets.toastCompiled"))
    },
    onError: (err: Error) => {
      qc.invalidateQueries({ queryKey: queryKeys.ruleSets })
      toast.error(err.message)
    },
    onSettled: () => setCompilingId(null),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteRuleSet(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.ruleSets })
      toast.success(t("templates.rulesets.toastDeleted"))
      setDeleting(null)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const baseOrigin = (settingsQuery.data?.hub_public_url?.trim() || window.location.origin).replace(
    /\/+$/,
    ""
  )

  if (query.isError) {
    return <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
  }
  if (query.isLoading) {
    return (
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  const list = query.data ?? []
  if (!list.length) {
    return (
      <EmptyState
        icon={<FileArchive className="size-5" />}
        title={t("templates.rulesets.emptyTitle")}
        description={t("templates.rulesets.emptyDesc")}
      />
    )
  }

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {list.map((rs) => {
          const publicUrl = `${baseOrigin}/api/public/rules/${encodeURIComponent(rs.name)}.mrs`
          const hasCompiled = Boolean(rs.compiled_at && rs.mrs_size > 0 && !rs.last_error)
          return (
            <Card key={rs.id} className="flex flex-col justify-between gap-3 py-4">
              <CardHeader className="px-4 pb-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <CardTitle className="truncate font-mono text-sm font-semibold">
                        {rs.name}
                      </CardTitle>
                      <Badge variant="outline" className="font-mono text-[11px] font-normal">
                        {rs.behavior}
                      </Badge>
                    </div>
                    <CardDescription className="line-clamp-2 text-xs">
                      {rs.description || t("common.noDescription")}
                    </CardDescription>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            disabled={compilingId === rs.id}
                            aria-label={t("templates.rulesets.compileAria")}
                            onClick={() => compileMutation.mutate(rs.id)}
                          >
                            {compilingId === rs.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="size-3.5" />
                            )}
                          </Button>
                        }
                      />
                      <TooltipContent>{t("templates.rulesets.compileTooltip")}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            aria-label={t("templates.rulesets.editAria")}
                            onClick={() => onEdit(rs)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                        }
                      />
                      <TooltipContent>{t("templates.rulesets.editTooltip")}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            aria-label={t("templates.rulesets.deleteAria")}
                            onClick={() => setDeleting(rs)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        }
                      />
                      <TooltipContent>{t("templates.rulesets.deleteTooltip")}</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-2.5 px-4 pt-0">
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <Badge
                    variant="secondary"
                    className="font-mono text-[11px] font-normal tabular-nums"
                  >
                    {t("templates.rulesets.ruleCount", { count: rs.rule_count })}
                  </Badge>
                  {hasCompiled ? (
                    <Badge
                      variant="secondary"
                      className="gap-1 bg-success/15 font-mono text-[11px] font-normal text-success tabular-nums"
                    >
                      <CheckCircle2 className="size-3" />
                      {formatBytes(rs.mrs_size)}
                    </Badge>
                  ) : rs.last_error ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Badge
                            variant="secondary"
                            className="gap-1 bg-destructive/15 text-[11px] font-normal text-destructive"
                          >
                            <AlertTriangle className="size-3" />
                            {t("templates.rulesets.compileFailed")}
                          </Badge>
                        }
                      />
                      <TooltipContent className="max-w-xs break-all text-xs">
                        {rs.last_error}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <Badge variant="outline" className="text-[11px] font-normal">
                      {t("templates.rulesets.notCompiled")}
                    </Badge>
                  )}
                </div>

                {hasCompiled && (
                  <div className="flex items-center justify-between gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1 text-[11px]">
                    <span className="truncate font-mono text-muted-foreground">{publicUrl}</span>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <CopyButton value={publicUrl} size="icon-sm" />
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <a
                              href={`/api/public/rules/${encodeURIComponent(rs.name)}.mrs`}
                              download={`${rs.name}.mrs`}
                              className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              aria-label={t("templates.rulesets.downloadAria")}
                            >
                              <Download className="size-3" />
                            </a>
                          }
                        />
                        <TooltipContent>{t("templates.rulesets.downloadTooltip")}</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <ConfirmDeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t("templates.rulesets.deleteTitle")}
        description={t("templates.rulesets.deleteDesc", { name: deleting?.name ?? "" })}
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
      />
    </>
  )
}
