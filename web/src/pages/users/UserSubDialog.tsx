import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { ExternalLink, Eye, Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { CopyButton } from "@/components/common/CommonUI"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api, queryKeys } from "@/lib/api"
import type { User } from "@/lib/types"

export function UserSubDialog({
  user,
  open,
  onOpenChange,
}: {
  user: User | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [previewYAML, setPreviewYAML] = useState<string | null>(null)

  const settingsQuery = useQuery({
    queryKey: queryKeys.settings,
    queryFn: api.getSettings,
    enabled: open,
  })

  const baseURL = (settingsQuery.data?.hub_public_url || window.location.origin).replace(/\/+$/, "")
  const subPath = (settingsQuery.data?.sub_path || "sub").replace(/^\/+|\/+$/g, "") || "sub"
  const subURL = user ? `${baseURL}/${subPath}/${user.sub_token}` : ""

  const rotateMutation = useMutation({
    mutationFn: () => api.rotateUserToken(user!.id),
    onSuccess: (res) => {
      if (user) {
        qc.setQueryData<User[]>(queryKeys.users, (old) =>
          old?.map((u) => (u.id === user.id ? { ...u, sub_token: res.sub_token } : u))
        )
      }
      qc.invalidateQueries({ queryKey: queryKeys.users })
      toast.success(t("users.toastTokenRotated"))
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const previewMutation = useMutation({
    mutationFn: () => api.previewTemplate({ user_id: user!.id }),
    onSuccess: (res) => setPreviewYAML(res.yaml),
    onError: (err: Error) => toast.error(err.message),
  })

  const handleOpenChange = (next: boolean) => {
    if (!next) setPreviewYAML(null)
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("users.sub.title", { username: user?.username ?? "" })}</DialogTitle>
          <DialogDescription>{t("users.sub.desc")}</DialogDescription>
        </DialogHeader>

        {user && (
          <div className="space-y-4 overflow-y-auto py-1">
            <div className="space-y-1.5">
              <Label>{t("users.sub.subUrlLabel")}</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input readOnly value={subURL} className="min-w-0 flex-1 font-mono text-xs" />
                <CopyButton
                  value={subURL}
                  label={t("users.sub.copyUrl")}
                  size="sm"
                  variant="outline"
                />
                <Button variant="outline" size="sm" asChild>
                  <a href={subURL} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-1.5 size-3.5" />
                    {t("users.sub.openPage")}
                  </a>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={rotateMutation.isPending}
                  onClick={() => rotateMutation.mutate()}
                >
                  <RefreshCw
                    className={`mr-1.5 size-3.5 ${rotateMutation.isPending ? "animate-spin" : ""}`}
                  />
                  {t("users.sub.rotate")}
                </Button>
              </div>
            </div>

            <div className="grid gap-3 rounded-md border border-border bg-muted/30 p-3 sm:grid-cols-2">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">UUID (VLESS / VMess / TUIC)</span>
                  <CopyButton value={user.uuid} label={t("users.sub.copyUuid")} />
                </div>
                <p className="truncate font-mono text-xs text-foreground">{user.uuid}</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Password (Trojan / HY2 / AnyTLS)
                  </span>
                  <CopyButton value={user.password} label={t("users.sub.copyPassword")} />
                </div>
                <p className="truncate font-mono text-xs text-foreground">{user.password}</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">
                  {t("users.sub.previewTitle")}
                </span>
                <div className="flex items-center gap-2">
                  {previewYAML && (
                    <CopyButton
                      value={previewYAML}
                      label={t("users.sub.copyYaml")}
                      size="sm"
                      variant="outline"
                    />
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={previewMutation.isPending}
                    onClick={() => previewMutation.mutate()}
                  >
                    {previewMutation.isPending ? (
                      <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                    ) : (
                      <Eye className="mr-1.5 size-3.5" />
                    )}
                    {previewYAML ? t("users.sub.rerender") : t("users.sub.previewBtn")}
                  </Button>
                </div>
              </div>
              {previewYAML && (
                <pre className="max-h-72 overflow-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-xs leading-relaxed text-foreground">
                  {previewYAML}
                </pre>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
