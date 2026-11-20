import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Pencil, Plus, Radio, Send, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { ConfirmDeleteDialog, EmptyState, ErrorState } from "@/components/common/CommonUI"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api, queryKeys } from "@/lib/api"
import { PROTOCOL_LABELS, type Inbound, type Node } from "@/lib/types"
import { InboundFormDialog } from "./InboundFormDialog"

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
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Inbound | null>(null)
  const [deleting, setDeleting] = useState<Inbound | null>(null)

  const query = useQuery({
    queryKey: node ? queryKeys.inbounds(node.id) : ["inbounds", "none"],
    queryFn: () => api.listInbounds(node!.id),
    enabled: open && Boolean(node),
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
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
          <SheetHeader className="border-b border-border px-5 pt-5 pb-4">
            <SheetTitle>{t("nodes.inbound.sheetTitle", { name: node?.name ?? "" })}</SheetTitle>
            <div className="flex items-center gap-2 pt-2">
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null)
                  setFormOpen(true)
                }}
              >
                <Plus className="mr-1.5 size-4" />
                {t("nodes.inbound.addProtocol")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pushMutation.isPending}
                onClick={() => pushMutation.mutate()}
              >
                <Send className="mr-1.5 size-3.5" />
                {t("nodes.inbound.pushNow")}
              </Button>
            </div>
          </SheetHeader>

          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
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
              query.data.map((inb) => (
                <div
                  key={inb.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3.5"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="font-mono text-xs">
                        {PROTOCOL_LABELS[inb.protocol]}
                      </Badge>
                      <span className="text-sm font-medium text-foreground">{inb.name}</span>
                      <span className="font-mono text-xs text-muted-foreground tabular-nums">
                        :{inb.port}
                      </span>
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
                          {t("nodes.inbound.cipherLabel", { value: inb.settings.ss_cipher })}
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
                            value: (inb.settings?.trusttunnel_network || "both").toUpperCase(),
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
                      {inb.settings?.proxy_name ? (
                        <span>
                          {t("nodes.inbound.proxyNameLabel", { value: inb.settings.proxy_name })}
                        </span>
                      ) : (
                        inb.tag && <span>{t("nodes.inbound.tagLabel", { value: inb.tag })}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
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
                              setFormOpen(true)
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
                            className="size-8 text-destructive hover:text-destructive"
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
        </SheetContent>
      </Sheet>

      {node && (
        <InboundFormDialog
          nodeId={node.id}
          nodeName={node.name}
          inbound={editing}
          open={formOpen}
          onOpenChange={setFormOpen}
        />
      )}

      <ConfirmDeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t("nodes.inbound.deleteTitle")}
        description={t("nodes.inbound.deleteDesc", { name: deleting?.name ?? "" })}
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
      />
    </>
  )
}
