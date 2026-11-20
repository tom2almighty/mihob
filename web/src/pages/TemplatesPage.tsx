import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Eye, FileCode2, Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  ConfirmDeleteDialog,
  CopyButton,
  EmptyState,
  ErrorState,
  PageHeader,
} from "@/components/common/CommonUI"
import { YamlCodeBlock } from "@/components/common/YamlEditor"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api, queryKeys } from "@/lib/api"
import { formatDateShort } from "@/lib/format"
import type { Template } from "@/lib/types"
import { TemplateFormDialog } from "./templates/TemplateFormDialog"

export function TemplatesPage() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Template | null>(null)
  const [deleting, setDeleting] = useState<Template | null>(null)
  const [previewTmpl, setPreviewTmpl] = useState<Template | null>(null)
  const [previewUserId, setPreviewUserId] = useState<string>("")
  const [renderedYAML, setRenderedYAML] = useState<string>("")

  const query = useQuery({
    queryKey: queryKeys.templates,
    queryFn: api.listTemplates,
  })

  const usersQuery = useQuery({
    queryKey: queryKeys.users,
    queryFn: api.listUsers,
    enabled: Boolean(previewTmpl),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteTemplate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.templates })
      toast.success(t("templates.toastDeleted"))
      setDeleting(null)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const previewMutation = useMutation({
    mutationFn: ({ userId, templateId }: { userId: number; templateId: number }) =>
      api.previewTemplate({ user_id: userId, template_id: templateId }),
    onSuccess: (res) => setRenderedYAML(res.yaml),
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("templates.title")}
        description={t("templates.description")}
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus className="mr-1.5 size-4" />
            {t("templates.createTemplate")}
          </Button>
        }
      />

      {query.isError ? (
        <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : !query.data?.length ? (
        <EmptyState
          icon={<FileCode2 className="size-5" />}
          title={t("templates.emptyTitle")}
          description={t("templates.emptyDesc")}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {query.data.map((tmpl) => (
            <Card key={tmpl.id} className="flex flex-col justify-between gap-2 py-4">
              <CardHeader className="px-4 pb-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="truncate text-sm font-semibold">{tmpl.name}</CardTitle>
                      {tmpl.is_default && (
                        <Badge variant="secondary" className="bg-info/15 text-xs text-info">
                          {t("templates.defaultBadge")}
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="line-clamp-2 text-xs">
                      {tmpl.description || t("common.noDescription")}
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
                            aria-label={t("templates.previewAria")}
                            onClick={() => {
                              setPreviewTmpl(tmpl)
                              setPreviewUserId("")
                              setRenderedYAML("")
                            }}
                          >
                            <Eye className="size-3.5" />
                          </Button>
                        }
                      />
                      <TooltipContent>{t("templates.previewTooltip")}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            aria-label={t("templates.editAria")}
                            onClick={() => {
                              setEditing(tmpl)
                              setFormOpen(true)
                            }}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                        }
                      />
                      <TooltipContent>{t("templates.editTooltip")}</TooltipContent>
                    </Tooltip>
                    {!tmpl.is_default && (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              aria-label={t("templates.deleteAria")}
                              onClick={() => setDeleting(tmpl)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          }
                        />
                        <TooltipContent>{t("templates.deleteTooltip")}</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-4 pt-0">
                <div className="text-xs text-muted-foreground tabular-nums">
                  {t("common.updatedAt", {
                    date: formatDateShort(tmpl.updated_at, i18n.language),
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <TemplateFormDialog open={formOpen} onOpenChange={setFormOpen} template={editing} />

      <Dialog open={Boolean(previewTmpl)} onOpenChange={(o) => !o && setPreviewTmpl(null)}>
        <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("templates.previewTitle", { name: previewTmpl?.name ?? "" })}</DialogTitle>
            <DialogDescription>{t("templates.previewDesc")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-2 py-2">
            <Select value={previewUserId} onValueChange={(v) => setPreviewUserId(v ?? "")}>
              <SelectTrigger className="w-60">
                <SelectValue placeholder={t("templates.selectUserPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {(usersQuery.data ?? []).map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {t("templates.userNodeCount", {
                      username: u.username,
                      count: u.node_ids.length,
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={!previewUserId || previewMutation.isPending}
              onClick={() =>
                previewTmpl &&
                previewMutation.mutate({ userId: Number(previewUserId), templateId: previewTmpl.id })
              }
            >
              {previewMutation.isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              {t("templates.generatePreview")}
            </Button>
            {renderedYAML && (
              <CopyButton
                value={renderedYAML}
                label={t("templates.copyYaml")}
                size="sm"
                variant="outline"
              />
            )}
          </div>
          {renderedYAML && <YamlCodeBlock value={renderedYAML} className="flex-1" />}
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t("templates.deleteTitle")}
        description={t("templates.deleteDesc", { name: deleting?.name ?? "" })}
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
      />
    </div>
  )
}
