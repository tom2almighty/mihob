import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import {
  Eye,
  FileArchive,
  FileCode2,
  Loader2,
  Pencil,
  Plus,
  Server,
  Smartphone,
  Trash2,
} from "lucide-react"
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api, queryKeys } from "@/lib/api"
import { formatDateShort } from "@/lib/format"
import type { RuleSet, Template, TemplateKind } from "@/lib/types"
import { RuleSetFormDialog } from "./templates/RuleSetFormDialog"
import { RuleSetsTab } from "./templates/RuleSetsTab"
import { TemplateFormDialog } from "./templates/TemplateFormDialog"

type TemplatesPageTab = TemplateKind | "rulesets"

export function TemplatesPage() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<TemplatesPageTab>("client")
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Template | null>(null)
  const [deleting, setDeleting] = useState<Template | null>(null)
  const [ruleSetFormOpen, setRuleSetFormOpen] = useState(false)
  const [editingRuleSet, setEditingRuleSet] = useState<RuleSet | null>(null)
  const [previewTmpl, setPreviewTmpl] = useState<Template | null>(null)
  const [previewUserId, setPreviewUserId] = useState<string>("")
  const [previewNodeId, setPreviewNodeId] = useState<string>("none")
  const [renderedYAML, setRenderedYAML] = useState<string>("")

  const query = useQuery({
    queryKey: queryKeys.templates,
    queryFn: api.listTemplates,
  })

  const usersQuery = useQuery({
    queryKey: queryKeys.users,
    queryFn: api.listUsers,
    enabled: Boolean(previewTmpl && previewTmpl.kind !== "server"),
  })

  const nodesQuery = useQuery({
    queryKey: queryKeys.nodes,
    queryFn: api.listNodes,
    enabled: Boolean(previewTmpl && previewTmpl.kind === "server"),
  })

  const clientTemplates = useMemo(
    () => (query.data ?? []).filter((tmpl) => tmpl.kind !== "server"),
    [query.data]
  )
  const serverTemplates = useMemo(
    () => (query.data ?? []).filter((tmpl) => tmpl.kind === "server"),
    [query.data]
  )
  const visibleTemplates = activeTab === "server" ? serverTemplates : clientTemplates

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteTemplate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.templates })
      if (deleting?.kind === "server") {
        qc.invalidateQueries({ queryKey: queryKeys.nodes })
      }
      toast.success(t("templates.toastDeleted"))
      setDeleting(null)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const previewClientMutation = useMutation({
    mutationFn: ({ userId, templateId }: { userId: number; templateId: number }) =>
      api.previewTemplate({ user_id: userId, template_id: templateId }),
    onSuccess: (res) => setRenderedYAML(res.yaml),
    onError: (err: Error) => toast.error(err.message),
  })

  const previewServerMutation = useMutation({
    mutationFn: ({ nodeId, templateId }: { nodeId: number | null; templateId: number }) =>
      api.previewServerConfig({ node_id: nodeId, template_id: templateId }),
    onSuccess: (res) => setRenderedYAML(res.yaml),
    onError: (err: Error) => toast.error(err.message),
  })

  const isPreviewServer = previewTmpl?.kind === "server"
  const previewPending = previewClientMutation.isPending || previewServerMutation.isPending

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("templates.title")}
        description={t("templates.description")}
        actions={
          <Button
            size="sm"
            onClick={() => {
              if (activeTab === "rulesets") {
                setEditingRuleSet(null)
                setRuleSetFormOpen(true)
              } else {
                setEditing(null)
                setFormOpen(true)
              }
            }}
          >
            <Plus className="mr-1.5 size-4" />
            {activeTab === "rulesets"
              ? t("templates.rulesets.createBtn")
              : activeTab === "server"
                ? t("templates.createServerTemplate")
                : t("templates.createClientTemplate")}
          </Button>
        }
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TemplatesPageTab)}>
        <TabsList className="h-auto max-w-full flex-wrap">
          <TabsTrigger value="client">
            <Smartphone className="size-3.5 shrink-0" />
            <span>{t("templates.tabClient")}</span>
          </TabsTrigger>
          <TabsTrigger value="server">
            <Server className="size-3.5 shrink-0" />
            <span>{t("templates.tabServer")}</span>
          </TabsTrigger>
          <TabsTrigger value="rulesets">
            <FileArchive className="size-3.5 shrink-0" />
            <span>{t("templates.tabRuleSets")}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {activeTab === "rulesets" ? (
        <RuleSetsTab
          onEdit={(rs) => {
            setEditingRuleSet(rs)
            setRuleSetFormOpen(true)
          }}
        />
      ) : query.isError ? (
        <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : !visibleTemplates.length ? (
        <EmptyState
          icon={<FileCode2 className="size-5" />}
          title={
            activeTab === "server" ? t("templates.emptyServerTitle") : t("templates.emptyTitle")
          }
          description={
            activeTab === "server" ? t("templates.emptyServerDesc") : t("templates.emptyDesc")
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {visibleTemplates.map((tmpl) => (
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
                              setPreviewNodeId("none")
                              setRenderedYAML("")
                            }}
                          >
                            <Eye className="size-3.5" />
                          </Button>
                        }
                      />
                      <TooltipContent>
                        {tmpl.kind === "server"
                          ? t("templates.previewServerTooltip")
                          : t("templates.previewTooltip")}
                      </TooltipContent>
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

      <TemplateFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        template={editing}
        defaultKind={activeTab === "server" ? "server" : "client"}
      />

      <RuleSetFormDialog
        open={ruleSetFormOpen}
        onOpenChange={setRuleSetFormOpen}
        ruleSet={editingRuleSet}
      />

      <Dialog open={Boolean(previewTmpl)} onOpenChange={(o) => !o && setPreviewTmpl(null)}>
        <DialogContent
          expandable
          className="flex h-[min(760px,90vh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
        >
          <DialogHeader className="shrink-0 border-b border-border px-6 pt-5 pr-20 pb-4">
            <DialogTitle>
              {t("templates.previewTitle", { name: previewTmpl?.name ?? "" })}
            </DialogTitle>
            <DialogDescription>
              {isPreviewServer ? t("templates.previewServerDesc") : t("templates.previewDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-6 py-3">
            {isPreviewServer ? (
              <>
                <Select value={previewNodeId} onValueChange={(v) => setPreviewNodeId(v ?? "none")}>
                  <SelectTrigger className="w-64 bg-background">
                    <SelectValue placeholder={t("templates.selectNodePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("templates.previewNoNodeOption")}</SelectItem>
                    {(nodesQuery.data ?? []).map((n) => (
                      <SelectItem key={n.id} value={String(n.id)}>
                        {t("templates.nodeInboundCount", {
                          name: n.name,
                          count: n.inbound_count,
                        })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={previewPending}
                  onClick={() =>
                    previewTmpl &&
                    previewServerMutation.mutate({
                      nodeId: previewNodeId !== "none" ? Number(previewNodeId) : null,
                      templateId: previewTmpl.id,
                    })
                  }
                >
                  {previewPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                  {t("templates.generatePreview")}
                </Button>
              </>
            ) : (
              <>
                <Select value={previewUserId} onValueChange={(v) => setPreviewUserId(v ?? "")}>
                  <SelectTrigger className="w-60 bg-background">
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
                  disabled={!previewUserId || previewPending}
                  onClick={() =>
                    previewTmpl &&
                    previewClientMutation.mutate({
                      userId: Number(previewUserId),
                      templateId: previewTmpl.id,
                    })
                  }
                >
                  {previewPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                  {t("templates.generatePreview")}
                </Button>
              </>
            )}
            {renderedYAML && (
              <CopyButton
                value={renderedYAML}
                label={t("templates.copyYaml")}
                size="sm"
                variant="outline"
              />
            )}
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 py-4">
            {renderedYAML ? (
              <YamlCodeBlock value={renderedYAML} className="min-h-0 flex-1" />
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
                {isPreviewServer ? t("templates.previewServerDesc") : t("templates.previewDesc")}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t("templates.deleteTitle")}
        description={
          deleting?.kind === "server"
            ? t("templates.deleteServerDesc", { name: deleting?.name ?? "" })
            : t("templates.deleteDesc", { name: deleting?.name ?? "" })
        }
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
      />
    </div>
  )
}
