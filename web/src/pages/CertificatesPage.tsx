import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { GripVertical, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  ConfirmDeleteDialog,
  CopyButton,
  EmptyState,
  ErrorState,
  PageHeader,
} from "@/components/common/CommonUI"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api, queryKeys } from "@/lib/api"
import { daysUntil, formatDateShort } from "@/lib/format"
import type { Certificate } from "@/lib/types"
import { useDragReorder } from "@/lib/useDragReorder"
import { cn } from "@/lib/utils"
import { CertFormDialog } from "./certificates/CertFormDialog"

export function CertificatesPage() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [deleting, setDeleting] = useState<Certificate | null>(null)

  const sourceLabel = (source: Certificate["source"]) => {
    if (source === "acme") return t("certificates.sourceAcme")
    if (source === "self_signed") return t("certificates.sourceSelfSigned")
    return t("certificates.sourceManual")
  }

  const query = useQuery({
    queryKey: queryKeys.certificates,
    queryFn: api.listCertificates,
  })

  const renewMutation = useMutation({
    mutationFn: (id: number) => api.renewCertificate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.certificates })
      toast.success(t("certificates.toastRenewed"))
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteCertificate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.certificates })
      toast.success(t("certificates.toastDeleted"))
      setDeleting(null)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const reorderMutation = useMutation({
    mutationFn: (ids: number[]) => api.reorderCertificates(ids),
    onError: () => {
      qc.invalidateQueries({ queryKey: queryKeys.certificates })
      toast.error(t("common.reorderFailed"))
    },
  })

  const certs = query.data ?? []
  const canDrag = certs.length > 1
  const { draggingId, overId, getRowDragProps } = useDragReorder({
    items: certs,
    enabled: canDrag,
    onReorder: (nextItems, nextIds) => {
      qc.setQueryData<Certificate[]>(queryKeys.certificates, nextItems)
      reorderMutation.mutate(nextIds)
    },
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("certificates.title")}
        description={t("certificates.description")}
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 size-4" />
            {t("certificates.addCert")}
          </Button>
        }
      />

      {query.isError ? (
        <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <div className="space-y-2.5">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : !query.data?.length ? (
        <EmptyState
          icon={<ShieldCheck className="size-5" />}
          title={t("certificates.emptyTitle")}
          description={t("certificates.emptyDesc")}
          action={
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 size-4" />
              {t("certificates.addCert")}
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8 px-2" />
                <TableHead>{t("certificates.colName")}</TableHead>
                <TableHead>{t("certificates.colSource")}</TableHead>
                <TableHead>{t("certificates.colIssuer")}</TableHead>
                <TableHead>{t("certificates.colExpiry")}</TableHead>
                <TableHead className="text-right">{t("certificates.colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {certs.map((c) => {
                const days = daysUntil(c.not_after)
                const badgeClass =
                  days === null
                    ? ""
                    : days <= 0
                      ? "bg-destructive/15 text-destructive"
                      : days <= 14
                        ? "bg-warning/15 text-warning"
                        : "bg-success/15 text-success"
                return (
                  <TableRow
                    key={c.id}
                    {...getRowDragProps(c.id)}
                    className={cn(
                      draggingId === c.id && "opacity-40",
                      overId === c.id &&
                        draggingId !== c.id &&
                        "bg-accent/50 ring-1 ring-inset ring-primary/40"
                    )}
                  >
                    <TableCell className="w-8 px-2">
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span
                              role="img"
                              className={cn(
                                "inline-flex items-center justify-center text-muted-foreground/60",
                                canDrag
                                  ? "cursor-grab hover:text-foreground active:cursor-grabbing"
                                  : "cursor-not-allowed opacity-40"
                              )}
                              aria-label={t("common.dragToReorder")}
                            >
                              <GripVertical className="size-4" />
                            </span>
                          }
                        />
                        <TooltipContent side="right">{t("common.dragToReorder")}</TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <div className="font-medium text-foreground">{c.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {c.domain}
                          {c.sans?.length > 1 ? ` (+${c.sans.length - 1})` : ""}
                        </div>
                        {c.fingerprint && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <span className="shrink-0">{t("certificates.fingerprintLabel")}</span>
                            <code
                              className="font-mono text-[11px] text-foreground/80"
                              title={c.fingerprint}
                            >
                              {`${c.fingerprint.slice(0, 12)}…${c.fingerprint.slice(-8)}`}
                            </code>
                            <CopyButton
                              value={c.fingerprint}
                              size="icon-sm"
                              label={t("certificates.copyFingerprintAria")}
                            />
                          </div>
                        )}
                        {c.last_error && <p className="text-xs text-destructive">{c.last_error}</p>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="secondary" className="text-xs">
                          {sourceLabel(c.source)}
                        </Badge>
                        {c.acme_provider && (
                          <Badge variant="outline" className="font-mono text-xs">
                            {c.acme_provider}
                          </Badge>
                        )}
                        {c.auto_renew && (
                          <Badge variant="outline" className="border-info/40 text-xs text-info">
                            {t("certificates.autoRenew")}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.issuer || "-"}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      <div className="flex items-center gap-2">
                        <span>{formatDateShort(c.not_after, i18n.language)}</span>
                        {days !== null && (
                          <Badge variant="secondary" className={badgeClass}>
                            {days <= 0
                              ? t("certificates.expired")
                              : t("certificates.daysLeft", { days })}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {c.source !== "manual" && (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8"
                                  aria-label={t("certificates.renewAria")}
                                  disabled={renewMutation.isPending}
                                  onClick={() => renewMutation.mutate(c.id)}
                                >
                                  <RefreshCw className="size-3.5" />
                                </Button>
                              }
                            />
                            <TooltipContent>{t("certificates.renewTooltip")}</TooltipContent>
                          </Tooltip>
                        )}
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                aria-label={t("certificates.deleteAria")}
                                onClick={() => setDeleting(c)}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            }
                          />
                          <TooltipContent>{t("certificates.deleteTooltip")}</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <CertFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ConfirmDeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t("certificates.deleteTitle")}
        description={t("certificates.deleteDesc", { name: deleting?.name ?? "" })}
        confirmName={deleting?.name}
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
      />
    </div>
  )
}
