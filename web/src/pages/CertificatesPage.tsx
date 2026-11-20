import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  ConfirmDeleteDialog,
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
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("certificates.colName")}</TableHead>
                <TableHead>{t("certificates.colSource")}</TableHead>
                <TableHead>{t("certificates.colIssuer")}</TableHead>
                <TableHead>{t("certificates.colExpiry")}</TableHead>
                <TableHead className="text-right">{t("certificates.colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.map((c) => {
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
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="space-y-0.5">
                        <div className="font-medium text-foreground">{c.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {c.domain}
                          {c.sans?.length > 1 ? ` (+${c.sans.length - 1})` : ""}
                        </div>
                        {c.last_error && (
                          <p className="text-xs text-destructive">{c.last_error}</p>
                        )}
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
                    <TableCell className="text-xs text-muted-foreground">{c.issuer || "-"}</TableCell>
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
                                className="size-8 text-destructive hover:text-destructive"
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
