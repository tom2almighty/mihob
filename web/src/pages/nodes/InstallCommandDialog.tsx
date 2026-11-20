import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Cloud, RefreshCw, Terminal } from "lucide-react"
import { toast } from "sonner"
import { CopyButton, ErrorState } from "@/components/common/CommonUI"
import { YamlCodeBlock } from "@/components/common/YamlEditor"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api, queryKeys } from "@/lib/api"
import type { Node } from "@/lib/types"

type CfProtocol = "auto" | "http2" | "quic"
type CfEdgeIp = "auto" | "4" | "6"
type CfHaConnections = "4" | "2" | "1"
type CfLogLevel = "info" | "warn" | "error"

function buildDockerCompose(
  baseCompose: string,
  opts: {
    watchtowerLabel: boolean
    watchtowerService: boolean
    cfEnabled: boolean
    cfToken: string
    cfProtocol: CfProtocol
    cfEdgeIp: CfEdgeIp
    cfHaConnections: CfHaConnections
    cfLogLevel: CfLogLevel
  }
): string {
  let out = baseCompose.trimEnd()
  const addLabel = opts.watchtowerLabel || opts.watchtowerService

  if (addLabel) {
    out += `\n    labels:\n      - "com.centurylinklabs.watchtower.enable=true"`
  }

  if (opts.cfEnabled) {
    const tok = opts.cfToken.trim() || "<YOUR_CLOUDFLARE_TUNNEL_TOKEN>"
    const cfFlags = ["--no-autoupdate"]
    if (opts.cfProtocol !== "auto") cfFlags.push(`--protocol ${opts.cfProtocol}`)
    if (opts.cfEdgeIp !== "auto") cfFlags.push(`--edge-ip-version ${opts.cfEdgeIp}`)
    if (opts.cfHaConnections !== "4") cfFlags.push(`--ha-connections ${opts.cfHaConnections}`)
    if (opts.cfLogLevel !== "info") cfFlags.push(`--loglevel ${opts.cfLogLevel}`)

    out += `\n\n  cloudflared:\n    image: cloudflare/cloudflared:latest\n    container_name: mihob-cloudflared\n    restart: unless-stopped\n    network_mode: host\n    command: tunnel ${cfFlags.join(" ")} run --token "${tok}"`
    if (addLabel) {
      out += `\n    labels:\n      - "com.centurylinklabs.watchtower.enable=true"`
    }
  }

  if (opts.watchtowerService) {
    out += `\n\n  watchtower:\n    image: containrrr/watchtower:latest\n    container_name: mihob-watchtower\n    restart: unless-stopped\n    volumes:\n      - /var/run/docker.sock:/var/run/docker.sock\n    command: --cleanup --label-enable --interval 3600`
  }

  return `${out}\n`
}

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
  const [watchtowerLabel, setWatchtowerLabel] = useState(false)
  const [watchtowerService, setWatchtowerService] = useState(false)
  const [cfEnabled, setCfEnabled] = useState(false)
  const [cfToken, setCfToken] = useState("")
  const [cfProtocol, setCfProtocol] = useState<CfProtocol>("auto")
  const [cfEdgeIp, setCfEdgeIp] = useState<CfEdgeIp>("auto")
  const [cfHaConnections, setCfHaConnections] = useState<CfHaConnections>("4")
  const [cfLogLevel, setCfLogLevel] = useState<CfLogLevel>("info")

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
      <DialogContent
        expandable
        className="flex h-[min(660px,88vh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
      >
        <DialogHeader className="shrink-0 border-b border-border px-6 pt-5 pr-20 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="size-4" />
            {t("nodes.install.title", { name: node?.name ?? "" })}
          </DialogTitle>
          <DialogDescription>{t("nodes.install.desc")}</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {query.isLoading ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 py-4">
              <Skeleton className="h-10 w-full shrink-0" />
              <Skeleton className="h-9 w-full shrink-0" />
              <Skeleton className="min-h-0 w-full flex-1" />
            </div>
          ) : query.isError ? (
            <div className="flex flex-1 items-center justify-center px-6 py-4">
              <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
            </div>
          ) : query.data ? (
            <>
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-6 py-2.5 text-xs">
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

              <Tabs defaultValue="compose" className="flex min-h-0 flex-1 flex-col gap-0">
                <div className="shrink-0 border-b border-border px-6 py-2.5">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="compose">{t("nodes.install.tabCompose")}</TabsTrigger>
                    <TabsTrigger value="docker">{t("nodes.install.tabDocker")}</TabsTrigger>
                    <TabsTrigger value="binary">{t("nodes.install.tabBinary")}</TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent
                  value="compose"
                  keepMounted
                  className="mt-0 flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden px-6 py-4"
                >
                  {(() => {
                    const composeText = buildDockerCompose(query.data.docker_compose, {
                      watchtowerLabel,
                      watchtowerService,
                      cfEnabled,
                      cfToken,
                      cfProtocol,
                      cfEdgeIp,
                      cfHaConnections,
                      cfLogLevel,
                    })
                    return (
                      <>
                        <div className="flex shrink-0 items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>{t("nodes.install.composeHint")}</span>
                          <CopyButton
                            value={composeText}
                            label={t("nodes.install.copyCompose")}
                            size="sm"
                            variant="outline"
                          />
                        </div>

                        <div className="max-h-[48%] shrink-0 space-y-2.5 overflow-y-auto rounded-md border border-border bg-muted/30 p-2.5">
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                            <label className="flex cursor-pointer items-center gap-1.5">
                              <Checkbox
                                checked={watchtowerLabel || watchtowerService}
                                disabled={watchtowerService}
                                onCheckedChange={(v) => setWatchtowerLabel(Boolean(v))}
                              />
                              <span>{t("nodes.install.optWatchtowerLabel")}</span>
                            </label>
                            <label className="flex cursor-pointer items-center gap-1.5">
                              <Checkbox
                                checked={watchtowerService}
                                onCheckedChange={(v) => {
                                  const next = Boolean(v)
                                  setWatchtowerService(next)
                                  if (next) setWatchtowerLabel(true)
                                }}
                              />
                              <span>{t("nodes.install.optWatchtowerService")}</span>
                            </label>
                            <label className="flex cursor-pointer items-center gap-1.5">
                              <Checkbox
                                checked={cfEnabled}
                                onCheckedChange={(v) => setCfEnabled(Boolean(v))}
                              />
                              <span>{t("nodes.install.optCloudflared")}</span>
                            </label>
                          </div>

                          {cfEnabled && (
                            <div className="space-y-2.5 border-t border-border/60 pt-2.5">
                              <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1">
                                <Cloud className="size-3.5 shrink-0 text-muted-foreground" />
                                <Input
                                  value={cfToken}
                                  onChange={(e) => setCfToken(e.target.value)}
                                  placeholder={t("nodes.install.cfTokenPlaceholder")}
                                  className="h-7 border-0 bg-transparent px-1 font-mono text-xs shadow-none focus-visible:ring-0"
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                                <div className="space-y-1">
                                  <Label className="block truncate whitespace-nowrap text-[11px] text-muted-foreground">
                                    {t("nodes.install.cfProtocol")}{" "}
                                    <span className="font-mono opacity-70">--protocol</span>
                                  </Label>
                                  <Select
                                    value={cfProtocol}
                                    onValueChange={(v) => v && setCfProtocol(v as CfProtocol)}
                                  >
                                    <SelectTrigger className="h-8 w-full bg-background text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="auto">
                                        {t("nodes.install.cfProtocolAuto")}
                                      </SelectItem>
                                      <SelectItem value="http2">http2</SelectItem>
                                      <SelectItem value="quic">quic</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1">
                                  <Label className="block truncate whitespace-nowrap text-[11px] text-muted-foreground">
                                    {t("nodes.install.cfEdgeIp")}{" "}
                                    <span className="font-mono opacity-70">--edge-ip-version</span>
                                  </Label>
                                  <Select
                                    value={cfEdgeIp}
                                    onValueChange={(v) => v && setCfEdgeIp(v as CfEdgeIp)}
                                  >
                                    <SelectTrigger className="h-8 w-full bg-background text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="auto">
                                        {t("nodes.install.cfEdgeIpAuto")}
                                      </SelectItem>
                                      <SelectItem value="4">{t("nodes.install.cfEdgeIp4")}</SelectItem>
                                      <SelectItem value="6">{t("nodes.install.cfEdgeIp6")}</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1">
                                  <Label className="block truncate whitespace-nowrap text-[11px] text-muted-foreground">
                                    {t("nodes.install.cfHaConnections")}{" "}
                                    <span className="font-mono opacity-70">--ha-connections</span>
                                  </Label>
                                  <Select
                                    value={cfHaConnections}
                                    onValueChange={(v) =>
                                      v && setCfHaConnections(v as CfHaConnections)
                                    }
                                  >
                                    <SelectTrigger className="h-8 w-full bg-background text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="4">
                                        {t("nodes.install.cfHaDefault")}
                                      </SelectItem>
                                      <SelectItem value="2">2</SelectItem>
                                      <SelectItem value="1">1</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1">
                                  <Label className="block truncate whitespace-nowrap text-[11px] text-muted-foreground">
                                    {t("nodes.install.cfLogLevel")}{" "}
                                    <span className="font-mono opacity-70">--loglevel</span>
                                  </Label>
                                  <Select
                                    value={cfLogLevel}
                                    onValueChange={(v) => v && setCfLogLevel(v as CfLogLevel)}
                                  >
                                    <SelectTrigger className="h-8 w-full bg-background text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="info">
                                        {t("nodes.install.cfLogInfo")}
                                      </SelectItem>
                                      <SelectItem value="warn">warn</SelectItem>
                                      <SelectItem value="error">error</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        <YamlCodeBlock value={composeText} className="min-h-0 flex-1" />
                      </>
                    )
                  })()}
                </TabsContent>

                <TabsContent
                  value="docker"
                  keepMounted
                  className="mt-0 flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden px-6 py-4"
                >
                  <div className="flex shrink-0 items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{t("nodes.install.dockerHint")}</span>
                    <CopyButton
                      value={query.data.docker_run}
                      label={t("nodes.install.copyCommand")}
                      size="sm"
                      variant="outline"
                    />
                  </div>
                  <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-muted/50 p-3 font-mono text-xs leading-relaxed text-foreground">
                    {query.data.docker_run}
                  </pre>
                </TabsContent>

                <TabsContent
                  value="binary"
                  keepMounted
                  className="mt-0 min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>{t("nodes.install.binaryHint")}</span>
                      <CopyButton
                        value={query.data.binary_install}
                        label={t("nodes.install.copyScript")}
                        size="sm"
                        variant="outline"
                      />
                    </div>
                    <pre className="overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-muted/50 p-3 font-mono text-xs leading-relaxed text-foreground">
                      {query.data.binary_install}
                    </pre>
                  </div>

                  {(() => {
                    const updateCmd =
                      query.data.binary_update ||
                      `curl -fsSL "${query.data.hub_url}/install/agent.sh" | sudo bash -s -- --update`
                    return (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>{t("nodes.install.binaryUpdateHint")}</span>
                          <CopyButton
                            value={updateCmd}
                            label={t("nodes.install.copyUpdate")}
                            size="sm"
                            variant="outline"
                          />
                        </div>
                        <pre className="overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-muted/50 p-3 font-mono text-xs leading-relaxed text-foreground">
                          {updateCmd}
                        </pre>
                      </div>
                    )
                  })()}

                  {(() => {
                    const uninstallCmd =
                      query.data.binary_uninstall ||
                      `curl -fsSL "${query.data.hub_url}/install/agent.sh" | sudo bash -s -- --uninstall`
                    return (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>{t("nodes.install.binaryUninstallHint")}</span>
                          <CopyButton
                            value={uninstallCmd}
                            label={t("nodes.install.copyUninstall")}
                            size="sm"
                            variant="outline"
                          />
                        </div>
                        <pre className="overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-muted/50 p-3 font-mono text-xs leading-relaxed text-foreground">
                          {uninstallCmd}
                        </pre>
                      </div>
                    )
                  })()}
                </TabsContent>
              </Tabs>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
