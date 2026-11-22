import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { BellRing, Loader2, Pencil, Plus, Send, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { ConfirmDeleteDialog, EmptyState, ErrorState } from "@/components/common/CommonUI"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api, queryKeys } from "@/lib/api"
import type { NotificationChannel } from "@/lib/types"
import { ChannelFormDialog } from "./ChannelFormDialog"

export function ChannelsTab() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<NotificationChannel | null>(null)
  const [deleting, setDeleting] = useState<NotificationChannel | null>(null)
  const [testingId, setTestingId] = useState<number | null>(null)

  const query = useQuery({
    queryKey: queryKeys.notificationChannels,
    queryFn: api.listNotificationChannels,
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      api.updateNotificationChannel(id, { enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notificationChannels })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteNotificationChannel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notificationChannels })
      toast.success(t("notifications.channels.toastDeleted"))
      setDeleting(null)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleTest = async (ch: NotificationChannel) => {
    setTestingId(ch.id)
    try {
      await api.testNotificationChannel(ch.id)
      qc.invalidateQueries({ queryKey: queryKeys.notificationLogs })
      toast.success(t("notifications.channels.toastTestSuccess"))
    } catch (err) {
      qc.invalidateQueries({ queryKey: queryKeys.notificationLogs })
      toast.error(err instanceof Error ? err.message : t("common.loadFailed"))
    } finally {
      setTestingId(null)
    }
  }

  const channels = query.data ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t("notifications.channels.intro")}</p>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <Plus className="mr-1.5 size-4" />
          {t("notifications.channels.addBtn")}
        </Button>
      </div>

      {query.isError ? (
        <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : channels.length === 0 ? (
        <EmptyState
          icon={<BellRing className="size-5" />}
          title={t("notifications.channels.emptyTitle")}
          description={t("notifications.channels.emptyDesc")}
          action={
            <Button
              size="sm"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <Plus className="mr-1.5 size-4" />
              {t("notifications.channels.addFirst")}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {channels.map((ch) => (
            <Card key={ch.id} className="gap-3 py-4">
              <CardHeader className="px-4 pb-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <CardTitle className="truncate text-sm font-semibold">{ch.name}</CardTitle>
                      <Badge variant="secondary" className="text-[11px] font-normal">
                        {t(
                          `notifications.providers.${
                            ["telegram", "bark", "discord", "generic", "smtp", "custom"].includes(
                              ch.provider
                            )
                              ? ch.provider
                              : "custom"
                          }` as "notifications.providers.telegram"
                        )}
                      </Badge>
                    </div>
                    <CardDescription className="truncate font-mono text-xs">
                      {ch.masked_url || "—"}
                    </CardDescription>
                  </div>
                  <Switch
                    checked={ch.enabled}
                    onCheckedChange={(checked) =>
                      toggleMutation.mutate({ id: ch.id, enabled: checked })
                    }
                    aria-label={t("notifications.channels.toggleAria")}
                  />
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-2 px-4 pt-0">
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {ch.events.length === 0 ? (
                    <span>{t("notifications.channels.allEventsBadge")}</span>
                  ) : (
                    <span>
                      {t("notifications.channels.selectedEventsCount", { count: ch.events.length })}
                    </span>
                  )}
                  {ch.remark && (
                    <>
                      <span className="opacity-40">·</span>
                      <span className="truncate">{ch.remark}</span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={testingId === ch.id}
                    onClick={() => void handleTest(ch)}
                  >
                    {testingId === ch.id ? (
                      <Loader2 className="mr-1 size-3 animate-spin" />
                    ) : (
                      <Send className="mr-1 size-3" />
                    )}
                    {t("notifications.channels.testBtn")}
                  </Button>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          aria-label={t("common.edit")}
                          onClick={() => {
                            setEditing(ch)
                            setFormOpen(true)
                          }}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      }
                    />
                    <TooltipContent>{t("common.edit")}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          aria-label={t("common.delete")}
                          onClick={() => setDeleting(ch)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      }
                    />
                    <TooltipContent>{t("common.delete")}</TooltipContent>
                  </Tooltip>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ChannelFormDialog open={formOpen} onOpenChange={setFormOpen} channel={editing} />
      <ConfirmDeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t("notifications.channels.deleteTitle")}
        description={t("notifications.channels.deleteDesc", { name: deleting?.name ?? "" })}
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
      />
    </div>
  )
}
