import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { RefreshCw, Terminal } from "lucide-react"
import { toast } from "sonner"
import { CopyButton, ErrorState } from "@/components/common/CommonUI"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api, queryKeys } from "@/lib/api"
import type { Node } from "@/lib/types"

export function InstallCommandDialog({
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

  const query = useQuery({
    queryKey: node ? queryKeys.nodeInstall(node.id) : ["nodes", "install", "none"],
    queryFn: () => api.getNodeInstall(node!.id),
    enabled: open && Boolean(node),
  })

  const regenMutation = useMutation({
    mutationFn: () => api.regenerateNodeToken(node!.id),
    onSuccess: () => {
      if (node) {
        qc.invalidateQueries({ queryKey: queryKeys.nodeInstall(node.id) })
      }
      qc.invalidateQueries({ queryKey: queryKeys.nodes })
      toast.success(t("nodes.install.tokenResetToast"))
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="size-4" />
            {t("nodes.install.title", { name: node?.name ?? "" })}
          </DialogTitle>
          <DialogDescription>{t("nodes.install.desc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto py-1">
          {query.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-9 w-64" />
              <Skeleton className="h-[300px] max-h-[45vh] w-full" />
            </div>
          ) : query.isError ? (
            <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
          ) : query.data ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
                <div className="min-w-0 space-y-0.5">
                  <span className="text-muted-foreground">{t("nodes.install.hubUrl")}</span>{" "}
                  <span className="font-mono text-foreground">{query.data.hub_url}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={regenMutation.isPending}
                  onClick={() => regenMutation.mutate()}
                >
                  <RefreshCw className="mr-1.5 size-3.5" />
                  {t("nodes.install.resetToken")}
                </Button>
              </div>

              <Tabs defaultValue="compose">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="compose">{t("nodes.install.tabCompose")}</TabsTrigger>
                  <TabsTrigger value="docker">{t("nodes.install.tabDocker")}</TabsTrigger>
                  <TabsTrigger value="binary">{t("nodes.install.tabBinary")}</TabsTrigger>
                </TabsList>

                <TabsContent value="compose" className="mt-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{t("nodes.install.composeHint")}</span>
                    <CopyButton
                      value={query.data.docker_compose}
                      label={t("nodes.install.copyCompose")}
                      size="sm"
                      variant="outline"
                    />
                  </div>
                  <pre className="h-[300px] max-h-[45vh] overflow-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-xs leading-relaxed text-foreground">
                    {query.data.docker_compose}
                  </pre>
                </TabsContent>

                <TabsContent value="docker" className="mt-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{t("nodes.install.dockerHint")}</span>
                    <CopyButton
                      value={query.data.docker_run}
                      label={t("nodes.install.copyCommand")}
                      size="sm"
                      variant="outline"
                    />
                  </div>
                  <pre className="h-[300px] max-h-[45vh] overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-muted/50 p-3 font-mono text-xs leading-relaxed text-foreground">
                    {query.data.docker_run}
                  </pre>
                </TabsContent>

                <TabsContent value="binary" className="mt-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{t("nodes.install.binaryHint")}</span>
                    <CopyButton
                      value={query.data.binary_install}
                      label={t("nodes.install.copyScript")}
                      size="sm"
                      variant="outline"
                    />
                  </div>
                  <pre className="h-[300px] max-h-[45vh] overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-muted/50 p-3 font-mono text-xs leading-relaxed text-foreground">
                    {query.data.binary_install}
                  </pre>
                </TabsContent>
              </Tabs>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
