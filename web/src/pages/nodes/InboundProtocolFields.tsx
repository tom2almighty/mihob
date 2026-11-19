import type { UseFormReturn } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import type { Certificate, Protocol } from "@/lib/types"
import type { InboundFormValues } from "./inboundSchema"

export const NEEDS_CERT_ALWAYS: Protocol[] = ["hysteria2", "tuic", "anytls"]
export const SUPPORTS_REALITY: Protocol[] = ["vless", "vmess", "trojan"]

export function InboundProtocolFields({
  form,
  certs,
  section,
  keygenLoading,
  onGenerateReality,
  onGenerateSSKey,
}: {
  form: UseFormReturn<InboundFormValues>
  certs: Certificate[]
  section: "security" | "transport"
  keygenLoading: boolean
  onGenerateReality: () => void
  onGenerateSSKey: () => void
}) {
  const { t } = useTranslation()
  const protocol = form.watch("protocol")
  const security = form.watch("security")
  const network = form.watch("network")
  const ssCipher = form.watch("ss_cipher")

  const needsCert =
    NEEDS_CERT_ALWAYS.includes(protocol) ||
    (SUPPORTS_REALITY.includes(protocol) && security === "tls")
  const isReality = SUPPORTS_REALITY.includes(protocol) && security === "reality"

  if (section === "security") {
    return (
      <div className="space-y-4">
        {SUPPORTS_REALITY.includes(protocol) && (
          <FormField
            control={form.control}
            name="security"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.security")}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="reality">{t("nodes.inbound.fields.securityReality")}</SelectItem>
                    <SelectItem value="tls">{t("nodes.inbound.fields.securityTls")}</SelectItem>
                    <SelectItem value="none">{t("nodes.inbound.fields.securityNone")}</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
        )}

        {SUPPORTS_REALITY.includes(protocol) && security === "none" && (
          <p className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            {t("nodes.inbound.fields.securityNoneHint")}
          </p>
        )}

        {isReality && (
          <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">
                {t("nodes.inbound.fields.realityTitle")}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={keygenLoading}
                onClick={onGenerateReality}
              >
                <KeyRound className="mr-1.5 size-3.5" />
                {t("nodes.inbound.fields.generateKeypair")}
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="reality_dest"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("nodes.inbound.fields.realityDest")}</FormLabel>
                    <FormControl>
                      <Input placeholder="www.microsoft.com:443" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="reality_server_names"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("nodes.inbound.fields.realityServerNames")}</FormLabel>
                    <FormControl>
                      <Input placeholder="www.microsoft.com" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="reality_private_key"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("nodes.inbound.fields.realityPrivateKey")}</FormLabel>
                    <FormControl>
                      <Input className="font-mono text-xs" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="reality_public_key"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("nodes.inbound.fields.realityPublicKey")}</FormLabel>
                    <FormControl>
                      <Input className="font-mono text-xs" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="reality_short_ids"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("nodes.inbound.fields.realityShortIds")}</FormLabel>
                  <FormControl>
                    <Input className="font-mono text-xs" placeholder="a1b2c3d4" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        )}

        {needsCert && (
          <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
            <FormField
              control={form.control}
              name="cert_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("nodes.inbound.fields.bindCert")}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t("nodes.inbound.fields.selectCertPlaceholder")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">{t("nodes.inbound.fields.noCertSelected")}</SelectItem>
                      {certs.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name} ({c.domain})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>{t("nodes.inbound.fields.certDesc")}</FormDescription>
                </FormItem>
              )}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="sni"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("nodes.inbound.fields.clientSni")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("nodes.inbound.fields.clientSniPlaceholder")} {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="skip_cert_verify"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
                    <FormLabel className="text-xs">
                      {t("nodes.inbound.fields.skipCertVerify")}
                    </FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </div>
        )}

        {protocol === "shadowsocks" && (
          <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
            <FormField
              control={form.control}
              name="ss_cipher"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("nodes.inbound.fields.ssCipher")}</FormLabel>
                  <Select
                    value={field.value || "2022-blake3-aes-128-gcm"}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="2022-blake3-aes-128-gcm">2022-blake3-aes-128-gcm</SelectItem>
                      <SelectItem value="2022-blake3-aes-256-gcm">2022-blake3-aes-256-gcm</SelectItem>
                      <SelectItem value="aes-256-gcm">aes-256-gcm</SelectItem>
                      <SelectItem value="chacha20-ietf-poly1305">chacha20-ietf-poly1305</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            {(ssCipher || "").startsWith("2022-") && (
              <FormField
                control={form.control}
                name="ss_server_password"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>{t("nodes.inbound.fields.ssServerPassword")}</FormLabel>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={keygenLoading}
                        onClick={onGenerateSSKey}
                      >
                        <KeyRound className="mr-1.5 size-3.5" />
                        {t("nodes.inbound.fields.generatePsk")}
                      </Button>
                    </div>
                    <FormControl>
                      <Input className="font-mono text-xs" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}
          </div>
        )}
      </div>
    )
  }

  // section === "transport"
  return (
    <div className="space-y-4">
      {SUPPORTS_REALITY.includes(protocol) && (
        <FormField
          control={form.control}
          name="network"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nodes.inbound.fields.transport")}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="tcp">TCP</SelectItem>
                  <SelectItem value="ws">WebSocket</SelectItem>
                  <SelectItem value="grpc">gRPC</SelectItem>
                  {protocol === "vless" && <SelectItem value="xhttp">XHTTP</SelectItem>}
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
      )}

      {protocol === "vless" && network === "tcp" && (
        <FormField
          control={form.control}
          name="flow"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nodes.inbound.fields.flow")}</FormLabel>
              <Select
                value={field.value || "none"}
                onValueChange={(v) => field.onChange(v === "none" ? "" : v)}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="xtls-rprx-vision">
                    {t("nodes.inbound.fields.flowVision")}
                  </SelectItem>
                  <SelectItem value="none">{t("nodes.inbound.fields.flowNone")}</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
      )}

      {SUPPORTS_REALITY.includes(protocol) && network === "ws" && (
        <FormField
          control={form.control}
          name="ws_path"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nodes.inbound.fields.wsPath")}</FormLabel>
              <FormControl>
                <Input placeholder="/ws" {...field} />
              </FormControl>
            </FormItem>
          )}
        />
      )}

      {SUPPORTS_REALITY.includes(protocol) && network === "grpc" && (
        <FormField
          control={form.control}
          name="grpc_service_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nodes.inbound.fields.grpcService")}</FormLabel>
              <FormControl>
                <Input placeholder="GunService" {...field} />
              </FormControl>
            </FormItem>
          )}
        />
      )}

      {protocol === "vless" && network === "xhttp" && (
        <FormField
          control={form.control}
          name="xhttp_path"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nodes.inbound.fields.xhttpPath")}</FormLabel>
              <FormControl>
                <Input placeholder="/xhttp" {...field} />
              </FormControl>
            </FormItem>
          )}
        />
      )}

      {protocol === "hysteria2" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField
            control={form.control}
            name="up_mbps"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.upMbps")}</FormLabel>
                <FormControl>
                  <Input type="number" min={0} className="tabular-nums" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="down_mbps"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.downMbps")}</FormLabel>
                <FormControl>
                  <Input type="number" min={0} className="tabular-nums" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="hop_ports"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.hopPorts")}</FormLabel>
                <FormControl>
                  <Input placeholder="20000-30000" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="obfs"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.obfs")}</FormLabel>
                <Select
                  value={field.value || "none"}
                  onValueChange={(v) => field.onChange(v === "none" ? "" : v)}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">{t("nodes.inbound.fields.obfsNone")}</SelectItem>
                    <SelectItem value="salamander">salamander</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="obfs_password"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>{t("nodes.inbound.fields.obfsPassword")}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t("nodes.inbound.fields.obfsPasswordPlaceholder")}
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
      )}

      {protocol === "tuic" && (
        <FormField
          control={form.control}
          name="congestion_controller"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nodes.inbound.fields.congestion")}</FormLabel>
              <Select value={field.value || "bbr"} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="bbr">{t("nodes.inbound.fields.bbrRecommended")}</SelectItem>
                  <SelectItem value="cubic">Cubic</SelectItem>
                  <SelectItem value="new_reno">New Reno</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
      )}

      {(protocol === "anytls" || protocol === "shadowsocks") && (
        <p className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          {t("nodes.inbound.fields.noExtraTransport")}
        </p>
      )}
    </div>
  )
}
