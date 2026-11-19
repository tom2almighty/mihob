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

export const NEEDS_CERT_ALWAYS: Protocol[] = ["hysteria2", "tuic", "anytls", "trusttunnel"]
export const SUPPORTS_REALITY: Protocol[] = ["vless", "vmess", "trojan"]
export const SUPPORTS_OPTIONAL_TLS: Protocol[] = ["http", "socks", "mixed"]

export function InboundProtocolFields({
  form,
  certs,
  section,
  keygenLoading,
  onGenerateReality,
  onGenerateSSKey,
  onGenerateSecret,
}: {
  form: UseFormReturn<InboundFormValues>
  certs: Certificate[]
  section: "security" | "transport"
  keygenLoading: boolean
  onGenerateReality: () => void
  onGenerateSSKey: () => void
  onGenerateSecret: (field: "snell_psk" | "sudoku_key") => void
}) {
  const { t } = useTranslation()
  const protocol = form.watch("protocol")
  const security = form.watch("security")
  const network = form.watch("network")
  const ssCipher = form.watch("ss_cipher")
  const snellVersion = Number(form.watch("snell_version") || 4)
  const sudokuDisableMask = Boolean(form.watch("sudoku_disable_http_mask"))

  const needsCert =
    NEEDS_CERT_ALWAYS.includes(protocol) ||
    ((SUPPORTS_REALITY.includes(protocol) || SUPPORTS_OPTIONAL_TLS.includes(protocol)) &&
      security === "tls")
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

        {SUPPORTS_OPTIONAL_TLS.includes(protocol) && (
          <FormField
            control={form.control}
            name="security"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.security")}</FormLabel>
                <Select
                  value={field.value === "tls" ? "tls" : "none"}
                  onValueChange={field.onChange}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="tls">{t("nodes.inbound.fields.securityTls")}</SelectItem>
                    <SelectItem value="none">{t("nodes.inbound.fields.securityNone")}</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
        )}

        {(SUPPORTS_REALITY.includes(protocol) || SUPPORTS_OPTIONAL_TLS.includes(protocol)) &&
          security === "none" && (
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

        {protocol === "vless" && (
          <div className="grid gap-3 rounded-md border border-border bg-muted/30 p-3 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="vless_decryption"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("nodes.inbound.fields.vlessDecryption")}</FormLabel>
                  <FormControl>
                    <Input
                      className="font-mono text-xs"
                      placeholder={t("nodes.inbound.fields.vlessDecryptionPlaceholder")}
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="vless_encryption"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("nodes.inbound.fields.vlessEncryption")}</FormLabel>
                  <FormControl>
                    <Input
                      className="font-mono text-xs"
                      placeholder={t("nodes.inbound.fields.vlessEncryptionPlaceholder")}
                      {...field}
                    />
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

        {protocol === "mieru" && (
          <p className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            {t("nodes.inbound.fields.mieruSecurityHint")}
          </p>
        )}

        {protocol === "shadowquic" && (
          <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
            <span className="text-xs font-medium text-foreground">
              {t("nodes.inbound.fields.shadowquicJlsTitle")}
            </span>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="shadowquic_jls_addr"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("nodes.inbound.fields.shadowquicJlsAddr")}</FormLabel>
                    <FormControl>
                      <Input placeholder="www.microsoft.com:443" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="shadowquic_jls_sni"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("nodes.inbound.fields.shadowquicJlsSni")}</FormLabel>
                    <FormControl>
                      <Input placeholder="www.microsoft.com" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="shadowquic_zero_rtt"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
                  <FormLabel className="text-xs">
                    {t("nodes.inbound.fields.shadowquicZeroRtt")}
                  </FormLabel>
                  <FormControl>
                    <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        )}

        {protocol === "snell" && (
          <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
            <FormField
              control={form.control}
              name="snell_version"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("nodes.inbound.fields.snellVersion")}</FormLabel>
                  <Select
                    value={String(field.value || 4)}
                    onValueChange={(v) => field.onChange(Number(v))}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="6">v6</SelectItem>
                      <SelectItem value="5">v5</SelectItem>
                      <SelectItem value="4">v4</SelectItem>
                      <SelectItem value="3">v3</SelectItem>
                      <SelectItem value="2">v2</SelectItem>
                      <SelectItem value="1">v1</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="snell_psk"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>{t("nodes.inbound.fields.snellPsk")}</FormLabel>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={keygenLoading}
                      onClick={() => onGenerateSecret("snell_psk")}
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
            <p className="text-xs text-muted-foreground">
              {t("nodes.inbound.fields.sharedSecretHint")}
            </p>
          </div>
        )}

        {protocol === "sudoku" && (
          <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
            <FormField
              control={form.control}
              name="sudoku_key"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>{t("nodes.inbound.fields.sudokuKey")}</FormLabel>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={keygenLoading}
                      onClick={() => onGenerateSecret("sudoku_key")}
                    >
                      <KeyRound className="mr-1.5 size-3.5" />
                      {t("nodes.inbound.fields.generateKey")}
                    </Button>
                  </div>
                  <FormControl>
                    <Input className="font-mono text-xs" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="sudoku_aead_method"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("nodes.inbound.fields.sudokuAead")}</FormLabel>
                    <Select
                      value={field.value || "chacha20-poly1305"}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="chacha20-poly1305">chacha20-poly1305</SelectItem>
                        <SelectItem value="aes-128-gcm">aes-128-gcm</SelectItem>
                        <SelectItem value="none">none</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sudoku_table_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("nodes.inbound.fields.sudokuTableType")}</FormLabel>
                    <Select
                      value={field.value || "prefer_ascii"}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="prefer_ascii">prefer_ascii</SelectItem>
                        <SelectItem value="prefer_entropy">prefer_entropy</SelectItem>
                        <SelectItem value="up_ascii_down_entropy">up_ascii_down_entropy</SelectItem>
                        <SelectItem value="up_entropy_down_ascii">up_entropy_down_ascii</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t("nodes.inbound.fields.sharedSecretHint")}
            </p>
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
        <div className="grid gap-3 sm:grid-cols-3">
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
          <FormField
            control={form.control}
            name="xhttp_mode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.xhttpMode")}</FormLabel>
                <Select value={field.value || "auto"} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="auto">auto</SelectItem>
                    <SelectItem value="packet-up">packet-up</SelectItem>
                    <SelectItem value="stream-up">stream-up</SelectItem>
                    <SelectItem value="stream-one">stream-one</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="xhttp_host"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.xhttpHost")}</FormLabel>
                <FormControl>
                  <Input placeholder="example.com" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
      )}

      {protocol === "hysteria2" && (
        <div className="space-y-3">
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
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="masquerade"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("nodes.inbound.fields.masquerade")}</FormLabel>
                  <FormControl>
                    <Input placeholder="https://example.com" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="bbr_profile"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("nodes.inbound.fields.bbrProfile")}</FormLabel>
                  <Select
                    value={field.value || "default"}
                    onValueChange={(v) => field.onChange(v === "default" ? "" : v)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="default">{t("nodes.inbound.fields.bbrDefault")}</SelectItem>
                      <SelectItem value="standard">standard</SelectItem>
                      <SelectItem value="conservative">conservative</SelectItem>
                      <SelectItem value="aggressive">aggressive</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="ignore_client_bandwidth"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
                <FormLabel className="text-xs">
                  {t("nodes.inbound.fields.ignoreClientBandwidth")}
                </FormLabel>
                <FormControl>
                  <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
      )}

      {protocol === "tuic" && (
        <div className="grid gap-3 sm:grid-cols-2">
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
          <FormField
            control={form.control}
            name="udp_relay_mode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.udpRelayMode")}</FormLabel>
                <Select value={field.value || "native"} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="native">native</SelectItem>
                    <SelectItem value="quic">quic</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
        </div>
      )}

      {protocol === "anytls" && (
        <FormField
          control={form.control}
          name="padding_scheme"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nodes.inbound.fields.paddingScheme")}</FormLabel>
              <FormControl>
                <Input
                  className="font-mono text-xs"
                  placeholder={t("nodes.inbound.fields.paddingSchemePlaceholder")}
                  {...field}
                />
              </FormControl>
            </FormItem>
          )}
        />
      )}

      {protocol === "mieru" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="mieru_transport"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.mieruTransport")}</FormLabel>
                <Select value={field.value || "TCP"} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="TCP">TCP</SelectItem>
                    <SelectItem value="UDP">UDP</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="mieru_port_range"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.mieruPortRange")}</FormLabel>
                <FormControl>
                  <Input placeholder="20000-20010" className="font-mono text-xs" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="mieru_multiplexing"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.mieruMultiplexing")}</FormLabel>
                <Select value={field.value || "MULTIPLEXING_LOW"} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="MULTIPLEXING_OFF">OFF</SelectItem>
                    <SelectItem value="MULTIPLEXING_LOW">LOW</SelectItem>
                    <SelectItem value="MULTIPLEXING_MIDDLE">MIDDLE</SelectItem>
                    <SelectItem value="MULTIPLEXING_HIGH">HIGH</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="mieru_tcp_idle_timeout"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.mieruTcpIdleTimeout")}</FormLabel>
                <FormControl>
                  <Input type="number" min={0} placeholder="120" className="tabular-nums" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
      )}

      {protocol === "trusttunnel" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="trusttunnel_network"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.trusttunnelNetwork")}</FormLabel>
                <Select value={field.value || "both"} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="both">{t("nodes.inbound.fields.trusttunnelBoth")}</SelectItem>
                    <SelectItem value="quic">QUIC (HTTP/3)</SelectItem>
                    <SelectItem value="tcp">TCP (HTTP/2)</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
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
        </div>
      )}

      {protocol === "shadowquic" && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
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
          </div>
          <FormField
            control={form.control}
            name="ignore_client_bandwidth"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
                <FormLabel className="text-xs">
                  {t("nodes.inbound.fields.ignoreClientBandwidth")}
                </FormLabel>
                <FormControl>
                  <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
      )}

      {protocol === "snell" &&
        (snellVersion === 6 ? (
          <FormField
            control={form.control}
            name="snell_mode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.snellMode")}</FormLabel>
                <Select value={field.value || "default"} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="default">default</SelectItem>
                    <SelectItem value="unshaped">unshaped</SelectItem>
                    <SelectItem value="unsafe-raw">unsafe-raw</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="snell_obfs_mode"
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
                      <SelectItem value="http">http</SelectItem>
                      <SelectItem value="tls">tls</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="snell_obfs_host"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("nodes.inbound.fields.snellObfsHost")}</FormLabel>
                  <FormControl>
                    <Input placeholder="bing.com" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        ))}

      {protocol === "sudoku" && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="sudoku_disable_http_mask"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
                  <FormLabel className="text-xs">
                    {t("nodes.inbound.fields.sudokuDisableMask")}
                  </FormLabel>
                  <FormControl>
                    <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="sudoku_enable_pure_downlink"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
                  <FormLabel className="text-xs">
                    {t("nodes.inbound.fields.sudokuPureDownlink")}
                  </FormLabel>
                  <FormControl>
                    <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
          {!sudokuDisableMask && (
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="sudoku_http_mask_mode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("nodes.inbound.fields.sudokuMaskMode")}</FormLabel>
                    <Select value={field.value || "legacy"} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="legacy">legacy</SelectItem>
                        <SelectItem value="stream">stream</SelectItem>
                        <SelectItem value="poll">poll</SelectItem>
                        <SelectItem value="auto">auto</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sudoku_path_root"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("nodes.inbound.fields.sudokuPathRoot")}</FormLabel>
                    <FormControl>
                      <Input placeholder="/api" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          )}
          <FormField
            control={form.control}
            name="sudoku_fallback"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.sudokuFallback")}</FormLabel>
                <FormControl>
                  <Input placeholder="127.0.0.1:80" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
      )}

      {(protocol === "shadowsocks" || SUPPORTS_OPTIONAL_TLS.includes(protocol)) && (
        <p className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          {t("nodes.inbound.fields.noExtraTransport")}
        </p>
      )}
    </div>
  )
}
