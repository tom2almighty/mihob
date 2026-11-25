import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { GripVertical, Pencil, Plus, Radio, Send, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  ConfirmActionDialog,
  ConfirmDeleteDialog,
  EmptyState,
  ErrorState,
} from "@/components/common/CommonUI"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api, queryKeys } from "@/lib/api"
import { PROTOCOL_LABELS, type Inbound, type Node } from "@/lib/types"
import { useDragReorder } from "@/lib/useDragReorder"
import { cn } from "@/lib/utils"
import { InboundFormView } from "./InboundFormDialog"

export function InboundManagerSheet({
  node,
  open,
  onOpenChange,
}: {
  node: Node | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [view, setView] = useState<"list" | "form">("list")
  const [editing, setEditing] = useState<Inbound | null>(null)
  const [deleting, setDeleting] = useState<Inbound | null>(null)
  const [confirmPushOpen, setConfirmPushOpen] = useState(false)

  useEffect(() => {
    if (!open) {
      setView("list")
      setEditing(null)
      setConfirmPushOpen(false)
    }
  }, [open])

  const query = useQuery({
    queryKey: node ? queryKeys.inbounds(node.id) : ["inbounds", "none"],
    queryFn: () => api.listInbounds(node!.id),
    enabled: open && Boolean(node),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      api.setInboundEnabled(id, enabled),
    onSuccess: (updated) => {
      if (node) {
        qc.setQueryData<Inbound[]>(queryKeys.inbounds(node.id), (prev) =>
          prev?.map((item) => (item.id === updated.id ? updated : item))
        )
        qc.invalidateQueries({ queryKey: queryKeys.inbounds(node.id) })
      }
      qc.invalidateQueries({ queryKey: queryKeys.nodes })
      toast.success(
        updated.enabled ? t("nodes.inbound.toastEnabled") : t("nodes.inbound.toastDisabled")
      )
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteInbound(id),
    onSuccess: () => {
      if (node) qc.invalidateQueries({ queryKey: queryKeys.inbounds(node.id) })
      qc.invalidateQueries({ queryKey: queryKeys.nodes })
      toast.success(t("nodes.inbound.toastDeleted"))
      setDeleting(null)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const pushMutation = useMutation({
    mutationFn: () => api.pushNodeConfig(node!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.nodes })
      toast.success(t("nodes.inbound.toastPushed"))
      setConfirmPushOpen(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const reorderMutation = useMutation({
    mutationFn: (ids: number[]) => api.reorderInbounds(node!.id, ids),
    onError: () => {
      if (node) qc.invalidateQueries({ queryKey: queryKeys.inbounds(node.id) })
      toast.error(t("common.reorderFailed"))
    },
  })

  const inbounds = query.data ?? []
  const canDrag = inbounds.length > 1
  const { draggingId, overId, getRowDragProps } = useDragReorder({
    items: inbounds,
    enabled: canDrag,
    onReorder: (nextItems, nextIds) => {
      if (!node) return
      qc.setQueryData<Inbound[]>(queryKeys.inbounds(node.id), nextItems)
      reorderMutation.mutate(nextIds)
    },
  })

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          expandable
          className="flex h-[min(660px,88vh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        >
          {view === "form" && node ? (
            <InboundFormView
              nodeId={node.id}
              nodeName={node.name}
              nodeOutbounds={(node.outbound_config?.outbounds ?? [])
                .filter((o) => o.enabled && o.name.trim())
                .map((o) => o.name.trim())}
              inbound={editing}
              onBack={() => {
                setView("list")
                setEditing(null)
              }}
            />
          ) : (
            <>
              <DialogHeader className="shrink-0 border-b border-border px-6 pt-5 pr-20 pb-4">
                <DialogTitle>
                  {t("nodes.inbound.sheetTitle", { name: node?.name ?? "" })}
                </DialogTitle>
                <div className="flex items-center gap-2 pt-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditing(null)
                      setView("form")
                    }}
                  >
                    <Plus className="mr-1.5 size-4" />
                    {t("nodes.inbound.addProtocol")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pushMutation.isPending}
                    onClick={() => setConfirmPushOpen(true)}
                  >
                    <Send className="mr-1.5 size-3.5" />
                    {t("nodes.inbound.pushNow")}
                  </Button>
                </div>
              </DialogHeader>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                <div className="space-y-3 group-data-[expanded=true]/dialog:mx-auto group-data-[expanded=true]/dialog:w-full group-data-[expanded=true]/dialog:max-w-4xl">
                  {query.isLoading ? (
                    <div className="space-y-2.5">
                      <Skeleton className="h-20 w-full" />
                      <Skeleton className="h-20 w-full" />
                    </div>
                  ) : query.isError ? (
                    <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
                  ) : !query.data?.length ? (
                    <EmptyState
                      icon={<Radio className="size-5" />}
                      title={t("nodes.inbound.emptyTitle")}
                      description={t("nodes.inbound.emptyDesc")}
                    />
                  ) : (
                    inbounds.map((inb) => (
                      <div
                        key={inb.id}
                        {...getRowDragProps(inb.id)}
                        className={cn(
                          "flex items-start justify-between gap-2.5 rounded-lg border border-border bg-card p-3.5 transition-colors",
                          draggingId === inb.id && "opacity-40",
                          overId === inb.id &&
                            draggingId !== inb.id &&
                            "bg-accent/50 ring-1 ring-inset ring-primary/40"
                        )}
                      >
                        <div className="flex min-w-0 flex-1 items-start gap-2">
                          <span
                            role="img"
                            className={cn(
                              "mt-0.5 inline-flex shrink-0 items-center justify-center text-muted-foreground/60",
                              canDrag
                                ? "cursor-grab hover:text-foreground active:cursor-grabbing"
                                : "cursor-not-allowed opacity-40"
                            )}
                            aria-label={t("common.dragToReorder")}
                          >
                            <GripVertical className="size-4" />
                          </span>
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="secondary" className="font-mono text-xs">
                                {PROTOCOL_LABELS[inb.protocol]}
                              </Badge>
                              <span className="text-sm font-medium text-foreground">
                                {inb.name}
                              </span>
                              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                                :{inb.port}
                              </span>
                              {(inb.tags ?? []).map((tg) => (
                                <Badge
                                  key={tg}
                                  variant="outline"
                                  className="px-1.5 py-0 text-[11px] font-normal text-muted-foreground"
                                >
                                  {tg}
                                </Badge>
                              ))}
                              {!inb.enabled && (
                                <Badge variant="outline" className="text-xs text-muted-foreground">
                                  {t("common.disabled")}
                                </Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              {inb.settings?.security && inb.settings.security !== "none" && (
                                <span>
                                  {t("nodes.inbound.securityLabel", {
                                    value: inb.settings.security.toUpperCase(),
                                  })}
                                </span>
                              )}
                              {(inb.protocol === "vless" ||
                                inb.protocol === "vmess" ||
                                inb.protocol === "trojan") &&
                                inb.settings?.network && (
                                  <span>
                                    {t("nodes.inbound.networkLabel", {
                                      value: inb.settings.network.toUpperCase(),
                                    })}
                                  </span>
                                )}
                              {inb.protocol === "shadowsocks" && inb.settings?.ss_cipher && (
                                <span>
                                  {t("nodes.inbound.cipherLabel", {
                                    value: inb.settings.ss_cipher,
                                  })}
                                </span>
                              )}
                              {inb.protocol === "mieru" && (
                                <span>
                                  {t("nodes.inbound.networkLabel", {
                                    value: (inb.settings?.mieru_transport || "TCP").toUpperCase(),
                                  })}
                                </span>
                              )}
                              {inb.protocol === "trusttunnel" && (
                                <span>
                                  {t("nodes.inbound.networkLabel", {
                                    value: (
                                      inb.settings?.trusttunnel_network || "both"
                                    ).toUpperCase(),
                                  })}
                                </span>
                              )}
                              {inb.protocol === "snell" && (
                                <span>v{inb.settings?.snell_version || 4}</span>
                              )}
                              {inb.protocol === "sudoku" && inb.settings?.sudoku_aead_method && (
                                <span>
                                  {t("nodes.inbound.cipherLabel", {
                                    value: inb.settings.sudoku_aead_method,
                                  })}
                                </span>
                              )}
                              {inb.cert_id && (
                                <span>{t("nodes.inbound.certLabel", { id: inb.cert_id })}</span>
                              )}
                              {inb.settings?.listener_proxy && (
                                <span className="font-mono">
                                  {t("nodes.inbound.outboundLabel", {
                                    value: inb.settings.listener_proxy,
                                  })}
                                </span>
                              )}
                              {inb.settings?.proxy_name ? (
                                <span>
                                  {t("nodes.inbound.proxyNameLabel", {
                                    value: inb.settings.proxy_name,
                                  })}
                                </span>
                              ) : (
                                inb.tag && (
                                  <span>{t("nodes.inbound.tagLabel", { value: inb.tag })}</span>
                                )
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <span className="inline-flex items-center">
                                  <Switch
                                    size="sm"
                                    checked={inb.enabled}
                                    disabled={
                                      toggleMutation.isPending &&
                                      toggleMutation.variables?.id === inb.id
                                    }
                                    onCheckedChange={(checked) =>
                                      toggleMutation.mutate({ id: inb.id, enabled: checked })
                                    }
                                    aria-label={t("nodes.inbound.toggleAria")}
                                  />
                                </span>
                              }
                            />
                            <TooltipContent>
                              {inb.enabled
                                ? t("nodes.inbound.disableTooltip")
                                : t("nodes.inbound.enableTooltip")}
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8"
                                  aria-label={t("nodes.inbound.editAria")}
                                  onClick={() => {
                                    setEditing(inb)
                                    setView("form")
                                  }}
                                >
                                  <Pencil className="size-3.5" />
                                </Button>
                              }
                            />
                            <TooltipContent>{t("nodes.inbound.editTooltip")}</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  aria-label={t("nodes.inbound.deleteAria")}
                                  onClick={() => setDeleting(inb)}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              }
                            />
                            <TooltipContent>{t("nodes.inbound.deleteTooltip")}</TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t("nodes.inbound.deleteTitle")}
        description={t("nodes.inbound.deleteDesc", { name: deleting?.name ?? "" })}
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
      />

      <ConfirmActionDialog
        open={confirmPushOpen}
        onOpenChange={setConfirmPushOpen}
        title={t("nodes.confirmPushTitle", { name: node?.name ?? "" })}
        description={node?.online ? t("nodes.confirmPushDesc") : t("nodes.confirmPushOfflineDesc")}
        confirmLabel={t("nodes.confirmPushAction")}
        loading={pushMutation.isPending}
        onConfirm={() => pushMutation.mutate()}
      />
    </>
  )
}
